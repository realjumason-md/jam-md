import { setAiChatOverride } from '../lib/aiState.js';

function canManageChat(message, context) {
    return !context.isGroup ||
        context.isSenderAdmin ||
        context.senderIsOwnerOrSudo ||
        message.key.fromMe;
}

export default {
    command: 'aioff',
    category: 'ai',
    description: 'Disable automatic AI replies in this chat',
    usage: '.aioff',
    adminOnly: true,
    async handler(sock, message, _args, context) {
        const chatId = context.chatId || message.key.remoteJid;
        if (!canManageChat(message, context)) {
            return sock.sendMessage(chatId, {
                text: 'ℹ️ *Only group admins can disable AI for this group.*'
            }, { quoted: message });
        }
        await setAiChatOverride(chatId, 'off');
        return sock.sendMessage(chatId, {
            text: '✅ *AI replies disabled for this chat.*\n\nThis override stays off even when `.aionall` is enabled.'
        }, { quoted: message });
    }
};
