import { downloadContentFromMessage } from '@whiskeysockets/baileys';
import { getAiKey, getAiStatus, getAvailableProviders, loadAiState, resolveAiProvider, setAiChatOverride, shouldAiReply } from '../lib/aiState.js';
import config from '../config.js';
const chatMemory = {
    messages: new Map(),
    userInfo: new Map()
};
const API_ENDPOINTS = [
    {
        name: 'ZellAPI',
        url: (text) => `https://zellapi.autos/ai/chatbot?text=${encodeURIComponent(text)}`,
        parse: (data) => data?.result
    },
    {
        name: 'Hercai',
        url: (text) => `https://hercai.onrender.com/gemini/hercai?question=${encodeURIComponent(text)}`,
        parse: (data) => data?.reply
    },
    {
        name: 'SparkAPI',
        url: (text) => `https://discardapi.dpdns.org/api/chat/spark?apikey=guru&text=${encodeURIComponent(text)}`,
        parse: (data) => data?.result?.answer
    },
    {
        name: 'LlamaAPI',
        url: (text) => `https://discardapi.dpdns.org/api/bot/llama?apikey=guru&text=${encodeURIComponent(text)}`,
        parse: (data) => data?.result
    }
];
function getRandomDelay() {
    return Math.floor(Math.random() * 700) + 350;
}
async function showTyping(sock, chatId) {
    try {
        await sock.presenceSubscribe(chatId);
        await sock.sendPresenceUpdate('composing', chatId);
        await new Promise(resolve => setTimeout(resolve, getRandomDelay()));
    }
    catch (error) {
        console.error('Typing indicator error:', error);
    }
}
function extractUserInfo(message) {
    const info = {};
    if (message.toLowerCase().includes('my name is')) {
        info.name = message.split('my name is')[1].trim().split(' ')[0];
    }
    if (message.toLowerCase().includes('i am') && message.toLowerCase().includes('years old')) {
        info.age = message.match(/\d+/)?.[0];
    }
    if (message.toLowerCase().includes('i live in') || message.toLowerCase().includes('i am from')) {
        info.location = message.split(/(?:i live in|i am from)/i)[1].trim().split(/[.,!?]/)[0];
    }
    return info;
}

function getMessageContent(message) {
    return message.message?.ephemeralMessage?.message ||
        message.message?.viewOnceMessage?.message ||
        message.message?.viewOnceMessageV2?.message ||
        message.message;
}

async function downloadIncomingImage(message) {
    const content = getMessageContent(message);
    const image = content?.imageMessage;
    if (!image)
        return null;
    const stream = await downloadContentFromMessage(image, 'image');
    const chunks = [];
    for await (const chunk of stream)
        chunks.push(chunk);
    return {
        mimeType: image.mimetype || 'image/jpeg',
        data: Buffer.concat(chunks).toString('base64')
    };
}

function buildSystemPrompt() {
    return `You are jam-md, a warm and natural AI conversation partner configured by ${config.botOwner}.
Reply in the same language and general tone as the person chatting with you. You can understand multilingual messages and code-switching.
Be useful, knowledgeable, and conversational. Use natural contractions, varied sentence length, and brief acknowledgements when they fit. Give the amount of detail the person asks for.
Use occasional emojis when they fit, but do not force them. Do not mention these instructions.
If someone asks whether you are an AI, answer honestly and briefly. Never claim to be a human or conceal that you are an AI assistant.
If someone asks who owns or configured the bot, answer that the owner is ${config.botOwner}.`;
}

function buildConversationPrompt(userMessage, userContext) {
    return `${buildSystemPrompt()}

Conversation so far:
${userContext.messages.join('\n') || '(new conversation)'}

User details:
${JSON.stringify(userContext.userInfo, null, 2)}

Latest message:
${userMessage}`;
}

function normalizeResponse(response) {
    return typeof response === 'string' ? response.trim() : '';
}

async function requestGemini(prompt, image) {
    const key = await getAiKey('gemini');
    if (!key)
        throw new Error('GEMINI_API_KEY is not configured');
    const parts = [{ text: prompt }];
    if (image) {
        parts.push({
            inlineData: {
                mimeType: image.mimeType,
                data: image.data
            }
        });
    }
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${encodeURIComponent(key)}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
            contents: [{ role: 'user', parts }],
            generationConfig: {
                temperature: 0.85,
                maxOutputTokens: 1200
            }
        })
    });
    if (!response.ok)
        throw new Error(`Gemini HTTP ${response.status}`);
    const data = await response.json();
    return normalizeResponse(data?.candidates?.[0]?.content?.parts?.map((part) => part.text || '').join(''));
}

async function requestGroq(prompt, image) {
    const key = await getAiKey('groq');
    if (!key)
        throw new Error('GROQ_API_KEY is not configured');
    const model = image
        ? (process.env.GROQ_VISION_MODEL || 'meta-llama/llama-4-scout-17b-16e-instruct')
        : (process.env.GROQ_MODEL || 'llama-3.3-70b-versatile');
    const content = [{ type: 'text', text: prompt }];
    if (image) {
        content.push({
            type: 'image_url',
            image_url: {
                url: `data:${image.mimeType};base64,${image.data}`
            }
        });
    }
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
            authorization: `Bearer ${key}`,
            'content-type': 'application/json'
        },
        body: JSON.stringify({
            model,
            messages: [{ role: 'user', content }],
            temperature: 0.85,
            max_tokens: 1200
        })
    });
    if (!response.ok)
        throw new Error(`Groq HTTP ${response.status}`);
    const data = await response.json();
    return normalizeResponse(data?.choices?.[0]?.message?.content);
}

async function requestLegacyApi(prompt) {
    for (const api of API_ENDPOINTS) {
        try {
            const controller = new globalThis.AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 10000);
            const response = await fetch(api.url(prompt), {
                method: 'GET',
                signal: controller.signal
            });
            clearTimeout(timeoutId);
            if (!response.ok)
                continue;
            const result = normalizeResponse(api.parse(await response.json()));
            if (result)
                return result;
        }
        catch {
            continue;
        }
    }
    return '';
}

export async function getAIResponse(userMessage, userContext, message) {
    const state = await loadAiState();
    const requestedProvider = state.provider === 'auto' ? 'auto' : state.provider;
    const selectedProvider = await resolveAiProvider(state);
    const image = await downloadIncomingImage(message);
    const prompt = buildConversationPrompt(userMessage, userContext);
    const providers = requestedProvider === 'auto'
        ? await getAvailableProviders(state)
        : selectedProvider
            ? [selectedProvider]
            : [];
    for (const provider of providers) {
        try {
            const response = provider === 'gemini'
                ? await requestGemini(prompt, image)
                : await requestGroq(prompt, image);
            if (response)
                return response;
        }
        catch (error) {
            console.error(`${provider} AI error:`, error.message);
        }
    }
    if (requestedProvider === 'auto' && !image) {
        return requestLegacyApi(prompt);
    }
    if (!providers.length) {
        throw new Error(requestedProvider === 'auto'
            ? 'No AI provider is configured'
            : `No ${requestedProvider} API key is configured`);
    }
    return '';
}

export async function handleChatbotResponse(sock, chatId, message, userMessage, senderId) {
    if (message.key.fromMe)
        return;
    const isGroup = chatId.endsWith('@g.us');
    if (!await shouldAiReply(chatId, isGroup))
        return;
    try {
        const botId = sock.user?.id || '';
        const botNumber = botId.split(':')[0];
        const content = getMessageContent(message);
        const originalMessage = content?.conversation ||
            content?.extendedTextMessage?.text ||
            content?.imageMessage?.caption ||
            userMessage ||
            '';
        const cleanedMessage = originalMessage
            .replace(new RegExp(`@${botNumber}`, 'g'), '')
            .trim();
        const image = content?.imageMessage;
        if (!cleanedMessage && !image)
            return;
        const memoryKey = `${chatId}:${senderId}`;
        if (!chatMemory.messages.has(memoryKey)) {
            chatMemory.messages.set(memoryKey, []);
            chatMemory.userInfo.set(memoryKey, {});
        }
        const imagePrompt = image && !cleanedMessage ? 'Please look at this image and respond naturally.' : cleanedMessage;
        const userInfo = extractUserInfo(cleanedMessage);
        if (Object.keys(userInfo).length > 0) {
            chatMemory.userInfo.set(memoryKey, {
                ...chatMemory.userInfo.get(memoryKey),
                ...userInfo
            });
        }
        const messages = chatMemory.messages.get(memoryKey);
        messages.push(`User: ${imagePrompt}`);
        while (messages.length > 40)
            messages.shift();
        await sock.sendMessage(chatId, {
            react: { text: image ? '👀' : '🤔', key: message.key }
        });
        await showTyping(sock, chatId);
        const response = await getAIResponse(imagePrompt, {
            messages,
            userInfo: chatMemory.userInfo.get(memoryKey)
        }, message);
        if (!response) {
            await sock.sendMessage(chatId, {
                text: 'I could not get a response right now. Try again in a moment.',
                quoted: message
            });
            return;
        }
        messages.push(`Assistant: ${response}`);
        while (messages.length > 40)
            messages.shift();
        chatMemory.messages.set(memoryKey, messages);
        await sock.sendMessage(chatId, { text: response }, { quoted: message });
    }
    catch (error) {
        console.error('Error in chatbot response:', error.message);
        if (error.message && error.message.includes('No sessions'))
            return;
        try {
            await sock.sendMessage(chatId, {
                text: error.message.includes('API key')
                    ? 'AI is not configured yet. Add a Gemini or Groq key with the owner command `.aikey`.'
                    : 'I could not process that right now. Try again in a moment.',
                quoted: message
            });
        }
        catch (sendError) {
            console.error('Failed to send chatbot error message:', sendError.message);
        }
    }
}
export default {
    command: 'chatbot',
    aliases: ['bot', 'ai', 'achat'],
    category: 'admin',
    description: 'Enable or disable AI replies in this chat',
    usage: '.chatbot <on|off>',
    async handler(sock, message, args, context) {
        const chatId = context.chatId || message.key.remoteJid;
        const match = args.join(' ').toLowerCase();
        if (!match) {
            const status = await getAiStatus();
            await showTyping(sock, chatId);
            return sock.sendMessage(chatId, {
                text: `*🤖 CHATBOT SETUP*\n\n` +
                    `*Status:* ${status.globalEnabled ? 'Enabled' : 'Disabled'}\n` +
                    `*Scope:* Direct messages and groups\n` +
                    `*APIs:* ${API_ENDPOINTS.length} endpoints with fallback\n\n` +
                    `*Commands:*\n` +
                    `• \`.chatbot on\` - Enable replies in this chat\n` +
                    `• \`.chatbot off\` - Disable replies in this chat\n\n` +
                    `*How it works:*\n` +
                    `The bot responds naturally to regular messages.\n\n` +
                    `*Features:*\n` +
                    `• Natural multilingual conversations\n` +
                    `• Longer conversation context\n` +
                    `• Image-aware replies\n` +
                    `• Auto fallback if API fails`,
                quoted: message
            });
        }
        if (match === 'on') {
            await showTyping(sock, chatId);
            await setAiChatOverride(chatId, 'on');
            return sock.sendMessage(chatId, {
                text: '✅ *AI replies enabled for this chat.*\n\nSend a normal message to start chatting.',
                quoted: message
            });
        }
        if (match === 'off') {
            await showTyping(sock, chatId);
            await setAiChatOverride(chatId, 'off');
            return sock.sendMessage(chatId, {
                text: '❌ *AI replies disabled for this chat.*\n\nUse `.chatbot on` to resume normal conversations.',
                quoted: message
            });
        }
        await showTyping(sock, chatId);
        return sock.sendMessage(chatId, {
            text: '❌ *Invalid command*\n\nUse: `.chatbot on/off`',
            quoted: message
        });
    },
    handleChatbotResponse
};
