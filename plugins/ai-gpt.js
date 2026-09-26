import { getAIResponse } from './chatbot.js';

export async function handleAiCommand(sock, message, args, context) {
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
        const messageText = error.message.includes('No AI provider') || error.message.includes('API key')
            ? `❌ ${error.message}.\n\nSet a key with \`.aikey gemini <key>\`, \`.aikey groq <key>\`, or \`.aikey xai <key>\`.`
            : '❌ Failed to get an AI response. Please try again later.';
        await sock.sendMessage(chatId, { text: messageText }, { quoted: message });
    }
}

export default {
    command: 'gpt',
    aliases: ['ai', 'chat', 'ask'],
    category: 'ai',
    description: 'Ask a question to AI',
    usage: '.gpt <question>',
    handler: handleAiCommand
};
