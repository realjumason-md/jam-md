import { getAIResponse } from './chatbot.js';
export default {
    command: 'gpt',
    aliases: ['ai', 'chat', 'ask', 'mistral', 'llama'],
    category: 'ai',
    description: 'Ask a question to AI',
    usage: '.gpt <question>',
    async handler(sock, message, args, context) {
        const chatId = context.chatId || message.key.remoteJid;
        const query = args.join(' ').trim();
        if (!query) {
            return sock.sendMessage(chatId, { text: '🤖 *AI Assistant*\n\nUsage: `.gpt <your question>`\nExample: `.gpt explain quantum physics`' }, { quoted: message });
        }
        try {
            await sock.sendMessage(chatId, { react: { text: '🤖', key: message.key } });
            const answer = await getAIResponse(query, {
                messages: [`User: ${query}`],
                userInfo: {}
            }, message);
            await sock.sendMessage(chatId, { text: answer }, { quoted: message });
        }
        catch (error) {
            console.error('AI Command Error:', error.message);
            await sock.sendMessage(chatId, { text: '❌ Failed to get AI response. Please try again later.' }, { quoted: message });
        }
    }
};
