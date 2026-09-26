import { setAiChatOverride } from '../lib/aiState.js';

function canManageChat(message, context) {
    return !context.isGroup ||
        context.isSenderAdmin ||
        context.senderIsOwnerOrSudo ||
        message.key.fromMe;
}

export default {
    command: 'aion',
    category: 'ai',
    description: 'Enable automatic AI replies in this chat',
    usage: '.aion',
    adminOnly: true,
    async handler(sock, message, _args, context) {
        const chatId = context.chatId || message.key.remoteJid;
        if (!canManageChat(message, context)) {
            return sock.sendMessage(chatId, {
                text: 'ℹ️ *Only group admins can enable AI for this group.*'
            }, { quoted: message });
        }
        await setAiChatOverride(chatId, 'on');
        return sock.sendMessage(chatId, {
            text: '✅ *AI replies enabled for this chat.*\n\nUse `.aioff` to disable it here.'
        }, { quoted: message });
    }
};
