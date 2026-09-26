import { setAiChatOverride } from '../lib/aiState.js';

export default {
    command: 'aioff',
    category: 'ai',
    description: 'Disable automatic AI replies in this chat',
    usage: '.aioff',
    async handler(sock, message, _args, context) {
        const chatId = context.chatId || message.key.remoteJid;
        await setAiChatOverride(chatId, 'off');
        return sock.sendMessage(chatId, {
            text: '✅ *AI replies disabled for this chat.*\n\nThis override stays off even when `.aionall` is enabled.'
        }, { quoted: message });
    }
};
