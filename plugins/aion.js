import { getAiStatus, setAiChatOverride } from '../lib/aiState.js';

export default {
    command: 'aion',
    category: 'ai',
    description: 'Enable automatic AI replies in this chat',
    usage: '.aion',
    async handler(sock, message, _args, context) {
        const chatId = context.chatId || message.key.remoteJid;
        const status = await getAiStatus();
        if (!status.availableProviders.length) {
            return sock.sendMessage(chatId, {
                text: '❌ AI was not enabled because no provider is configured.\n\nSet GEMINI_API_KEY, GROQ_API_KEY, or XAI_API_KEY in the deployment environment, then run `.aion` again.',
                quoted: message
            });
        }
        await setAiChatOverride(chatId, 'on');
        return sock.sendMessage(chatId, {
            text: '✅ *AI replies enabled for this chat.*\n\nUse `.aioff` to disable it here.'
        }, { quoted: message });
    }
};
