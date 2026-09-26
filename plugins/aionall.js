import { setAiGlobalEnabled, getAiStatus } from '../lib/aiState.js';

export default {
    command: 'aionall',
    category: 'ai',
    description: 'Enable AI replies for all chats',
    usage: '.aionall',
    ownerOnly: true,
    async handler(sock, message, _args, context) {
        const chatId = context.chatId || message.key.remoteJid;
        const status = await getAiStatus();
        if (!status.availableProviders.length) {
            return sock.sendMessage(chatId, {
                text: '❌ AI was not enabled because no provider is configured.\n\nSet GEMINI_API_KEY, GROQ_API_KEY, or XAI_API_KEY in the deployment environment, then run `.aionall` again.',
                quoted: message
            });
        }
        await setAiGlobalEnabled(true);
        return sock.sendMessage(chatId, {
            text: `✅ *Global AI replies enabled for all chats.*\n\nProvider: *${status.provider}*\nAvailable: *${status.availableProviders.join(', ') || 'none'}*\n\nUse \`.aioff\` in a chat to keep that chat disabled.`
        }, { quoted: message });
    }
};
