import { setAiGlobalEnabled, getAiStatus } from '../lib/aiState.js';

export default {
    command: 'aionall',
    category: 'ai',
    description: 'Enable AI replies for all direct-message chats',
    usage: '.aionall',
    ownerOnly: true,
    async handler(sock, message, _args, context) {
        const chatId = context.chatId || message.key.remoteJid;
        await setAiGlobalEnabled(true);
        const status = await getAiStatus();
        return sock.sendMessage(chatId, {
            text: `✅ *Global AI replies enabled for direct messages.*\n\nProvider: *${status.provider}*\nAvailable: *${status.availableProviders.join(', ') || 'none'}*\n\nUse \`.aioff\` in a chat to keep that chat disabled.`
        }, { quoted: message });
    }
};
