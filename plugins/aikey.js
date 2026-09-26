import { clearAiKey, getAiStatus, setAiKey } from '../lib/aiState.js';

function looksLikeXaiKey(value) {
    return /^xai-/i.test(String(value || '').trim());
}

export default {
    command: 'aikey',
    aliases: ['setaikey'],
    category: 'ai',
    description: 'Set or clear a Gemini, Groq, or xAI API key',
    usage: '.aikey <gemini|groq|xai> <key|clear>',
    ownerOnly: true,
    async handler(sock, message, args, context) {
        const chatId = context.chatId || message.key.remoteJid;
        const provider = String(args[0] || '').toLowerCase();
        const value = args.slice(1).join(' ').trim();
        if (!['gemini', 'groq', 'xai'].includes(provider) || !value) {
            return sock.sendMessage(chatId, {
                text: '*AI KEY SETUP*\n\nUse `.aikey gemini <key>`, `.aikey groq <key>`, or `.aikey xai <key>`.\nUse `.aikey <provider> clear` to remove a command-set key.\n\nEnvironment variables `GEMINI_API_KEY`, `GROQ_API_KEY`, and `XAI_API_KEY` are also supported and take priority.'
            }, { quoted: message });
        }
        const detectedProvider = provider === 'groq' && looksLikeXaiKey(value) ? 'xai' : provider;
        if (value.toLowerCase() === 'clear') {
            await clearAiKey(detectedProvider);
        }
        else {
            await setAiKey(detectedProvider, value);
        }
        const status = await getAiStatus();
        return sock.sendMessage(chatId, {
            text: `✅ *${detectedProvider} key ${value.toLowerCase() === 'clear' ? 'cleared' : 'saved'}.*${detectedProvider !== provider ? '\n\nThe xAI key was detected automatically and saved as xAI.' : ''}\n\nAvailable providers: *${status.availableProviders.join(', ') || 'none'}*`
        }, { quoted: message });
    }
};
