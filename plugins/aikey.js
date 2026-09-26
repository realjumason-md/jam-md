import { clearAiKey, getAiStatus, setAiKey } from '../lib/aiState.js';

export default {
    command: 'aikey',
    aliases: ['setaikey'],
    category: 'ai',
    description: 'Set or clear a Gemini or Groq API key',
    usage: '.aikey <gemini|groq> <key|clear>',
    ownerOnly: true,
    async handler(sock, message, args, context) {
        const chatId = context.chatId || message.key.remoteJid;
        const provider = String(args[0] || '').toLowerCase();
        const value = args.slice(1).join(' ').trim();
        if (!['gemini', 'groq'].includes(provider) || !value) {
            return sock.sendMessage(chatId, {
                text: '*AI KEY SETUP*\n\nUse `.aikey gemini <key>` or `.aikey groq <key>`.\nUse `.aikey <provider> clear` to remove a command-set key.\n\nEnvironment variables `GEMINI_API_KEY` and `GROQ_API_KEY` are also supported and take priority.'
            }, { quoted: message });
        }
        if (value.toLowerCase() === 'clear') {
            await clearAiKey(provider);
        }
        else {
            await setAiKey(provider, value);
        }
        const status = await getAiStatus();
        return sock.sendMessage(chatId, {
            text: `✅ *${provider} key ${value.toLowerCase() === 'clear' ? 'cleared' : 'saved'}.*\n\nAvailable providers: *${status.availableProviders.join(', ') || 'none'}*`
        }, { quoted: message });
    }
};
