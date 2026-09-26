import { normalizePhoneNumber } from '../lib/pairing.js';

function getMessageContext(message) {
    const content = message.message?.ephemeralMessage?.message ||
        message.message?.viewOnceMessage?.message ||
        message.message?.viewOnceMessageV2?.message ||
        message.message;
    return content?.extendedTextMessage?.contextInfo || {};
}

function phoneFromJid(jid) {
    return String(jid || '')
        .replace(/@s\.whatsapp\.net|@lid|@c\.us/gi, '')
        .split(':')[0]
        .replace(/\D/g, '');
}

function jidFromPhone(value) {
    const normalized = normalizePhoneNumber(value);
    return normalized ? `${normalized}@s.whatsapp.net` : '';
}

async function resolveLid(sock, target, chatId) {
    if (!target?.endsWith('@lid'))
        return target;
    if (chatId.endsWith('@g.us')) {
        const metadata = await sock.groupMetadata(chatId);
        const participant = metadata.participants.find((entry) =>
            entry.lid === target || entry.id === target || entry.lid?.split(':')[0] === target.split(':')[0]
        );
        if (participant?.id)
            return participant.id;
    }
    const contact = Object.values(sock.store?.contacts || {}).find((entry) =>
        entry?.lid === target || entry?.lid?.split(':')[0] === target.split(':')[0]
    );
    return contact?.id?.endsWith('@s.whatsapp.net') ? contact.id : target;
}

async function resolvePhoneJid(sock, input) {
    const jid = jidFromPhone(input);
    if (!jid)
        return '';
    if (typeof sock.onWhatsApp !== 'function')
        return jid;
    const matches = await sock.onWhatsApp(jid);
    const match = Array.isArray(matches) ? matches.find((entry) => entry?.exists !== false && entry?.jid) : null;
    return match?.jid || (matches?.[0]?.exists ? matches[0].jid || jid : '');
}

async function resolveTarget(sock, message, args, chatId, isGroup) {
    const contextInfo = getMessageContext(message);
    if (contextInfo.mentionedJid?.[0])
        return contextInfo.mentionedJid[0];
    if (contextInfo.participant)
        return contextInfo.participant;

    const numberInput = args.join(' ').trim();
    if (numberInput)
        return resolvePhoneJid(sock, numberInput);

    // In a private chat, no argument means the person whose chat is open.
    // In a group, it means the person who issued the command.
    return isGroup ? (message.key.participant || chatId) : chatId;
}

export default {
    command: 'getpp',
    aliases: ['dlpp', 'profilepic', 'getdp'],
    category: 'general',
    description: 'Get a user profile picture by reply, mention, or WhatsApp number',
    usage: '.getpp [@user|reply|number]',
    async handler(sock, message, args, context) {
        const chatId = context.chatId || message.key.remoteJid;
        const isGroup = chatId.endsWith('@g.us');
        let target;
        try {
            target = await resolveTarget(sock, message, args, chatId, isGroup);
        }
        catch (error) {
            console.error('GetPP target resolution error:', error.message);
            target = '';
        }

        if (!target) {
            return sock.sendMessage(chatId, {
                text: '❌ WhatsApp number not found. Use `.getpp 256765309986`, mention someone, or reply to their message.'
            }, { quoted: message });
        }

        try {
            const realJid = await resolveLid(sock, target, chatId);
            const displayNumber = phoneFromJid(realJid);
            let displayName = '';
            try {
                const name = await sock.getName?.(realJid);
                if (name && !name.startsWith('+'))
                    displayName = name;
            }
            catch {
                // The picture is still useful when WhatsApp has no saved contact name.
            }

            let ppUrl;
            try {
                ppUrl = await sock.profilePictureUrl(realJid, 'image');
            }
            catch {
                return sock.sendMessage(chatId, {
                    text: `❌ No profile picture found${displayName ? ` for *${displayName}*` : ''}${displayNumber ? `\n📱 *WhatsApp number:* +${displayNumber}` : ''}`
                }, { quoted: message });
            }

            return sock.sendMessage(chatId, {
                image: { url: ppUrl },
                caption: `📸 *Profile Picture*${displayName ? `\n\n👤 *Name:* ${displayName}` : ''}${displayNumber ? `\n📱 *WhatsApp number:* +${displayNumber}` : ''}`
            }, { quoted: message });
        }
        catch (error) {
            console.error('GetPP Error:', error);
            return sock.sendMessage(chatId, {
                text: '❌ Failed to fetch that WhatsApp profile picture. Check the number and try again.'
            }, { quoted: message });
        }
    }
};