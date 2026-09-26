import { setAiGlobalEnabled, getAiStatus } from '../lib/aiState.js';

export default {
    command: 'aioffall',
    category: 'ai',
    description: 'Disable global AI replies',
    usage: '.aioffall',
    ownerOnly: true,
    async handler(sock, message, _args, context) {
        const chatId = context.chatId || message.key.remoteJid;
        await setAiGlobalEnabled(false);
        const status = await getAiStatus();
        return sock.sendMessage(chatId, {
            text: `✅ *Global AI replies disabled.*\n\nProvider: *${status.provider}*\nUse \`.aion\` in any chat to enable that chat independently.`
        }, { quoted: message });
    }
};
