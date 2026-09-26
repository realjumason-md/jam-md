import axios from 'axios';
import config from '../config.js';
export default {
    command: 'news',
    aliases: ['headlines', 'latestnews'],
    category: 'info',
    description: 'Get the latest top 5 news headlines from the US',
    usage: '.news',
    async handler(sock, message, args, context) {
        const chatId = context.chatId || message.key.remoteJid;
        try {
            const apiKey = config.newsApiKey;
            if (!apiKey) {
                return await sock.sendMessage(chatId, {
                    text: '⚠️ News lookup is not configured on this bot yet.',
                    quoted: message
                });
            }
            const response = await axios.get(`https://newsapi.org/v2/top-headlines?country=us&apiKey=${apiKey}`);
            if (!response.data || !response.data.articles)
                throw new Error('Invalid API response');
            const articles = response.data.articles.slice(0, 5);
            if (articles.length === 0) {
                await sock.sendMessage(chatId, {
                    text: '❌ No news found at the moment. Please try again later.',
                    quoted: message
                });
                return;
            }
            let newsMessage = '📰 *Latest News*:\n\n';
            articles.forEach((article, index) => {
                newsMessage += `${index + 1}. *${article.title}*\n${article.description || 'No description'}\n\n`;
            });
            await sock.sendMessage(chatId, {
                text: newsMessage.trim(),
                quoted: message
            });
        }
        catch (error) {
            console.error('News Command Error:', error);
            await sock.sendMessage(chatId, {
                text: '❌ Sorry, I could not fetch news right now. Please try again later.',
                quoted: message
            });
        }
    }
};
