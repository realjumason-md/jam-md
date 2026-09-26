import { setAiChatOverride } from '../lib/aiState.js';

export default {
    command: 'aion',
    category: 'ai',
    description: 'Enable automatic AI replies in this chat',
    usage: '.aion',
    async handler(sock, message, _args, context) {
        const chatId = context.chatId || message.key.remoteJid;
        await setAiChatOverride(chatId, 'on');
        return sock.sendMessage(chatId, {
            text: '✅ *AI replies enabled for this chat.*\n\nUse `.aioff` to disable it here.'
        }, { quoted: message });
    }
};
