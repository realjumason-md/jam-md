import { getAiStatus, setAiProvider } from '../lib/aiState.js';

export default {
    command: 'aiswitch',
    category: 'ai',
    description: 'Choose Gemini, Groq, xAI, or any available AI provider',
    usage: '.aiswitch <gemini|groq|xai|auto>',
    ownerOnly: true,
    async handler(sock, message, args, context) {
        const chatId = context.chatId || message.key.remoteJid;
        const requested = String(args[0] || '').toLowerCase();
        if (!requested) {
            const status = await getAiStatus();
            return sock.sendMessage(chatId, {
                text: `*AI PROVIDER*\n\nCurrent: *${status.provider}*\nAvailable: *${status.availableProviders.join(', ') || 'none'}*\n\nUse \`.aiswitch groq\`, \`.aiswitch gemini\`, \`.aiswitch xai\`, or \`.aiswitch auto\`.`
            }, { quoted: message });
        }
        if (!['gemini', 'groq', 'xai', 'auto', 'any', 'available'].includes(requested)) {
            return sock.sendMessage(chatId, {
                text: '❌ Use `.aiswitch groq`, `.aiswitch gemini`, `.aiswitch xai`, or `.aiswitch auto`.'
            }, { quoted: message });
        }
        const statusBefore = await getAiStatus();
        if (requested === 'gemini' || requested === 'groq' || requested === 'xai') {
            if (!statusBefore.availableProviders.includes(requested)) {
                if (requested === 'groq' && statusBefore.availableProviders.includes('xai')) {
                    return sock.sendMessage(chatId, {
                        text: '❌ Groq is not configured, but an xAI key is available. Use `.aiswitch xai` or set a real `GROQ_API_KEY` before selecting Groq.'
                    }, { quoted: message });
                }
                return sock.sendMessage(chatId, {
                    text: `❌ No ${requested} API key is available. Set the matching environment variable or use \`.aikey ${requested} <key>\`.`
                }, { quoted: message });
            }
        }
        await setAiProvider(requested);
        const status = await getAiStatus();
        return sock.sendMessage(chatId, {
            text: `✅ AI provider switched to *${status.provider}*.\n\nAvailable: *${status.availableProviders.join(', ') || 'none'}*`
        }, { quoted: message });
    }
};
