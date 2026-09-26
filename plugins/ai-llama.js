import { handleAiCommand } from './ai-gpt.js';

export default {
    command: 'llama',
    aliases: [],
    category: 'ai',
    description: 'Ask the configured AI provider a question',
    usage: '.llama <question>',
    handler: handleAiCommand
};