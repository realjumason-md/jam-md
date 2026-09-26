import { handleAiCommand } from './ai-gpt.js';

export default {
    command: 'mistral',
    aliases: [],
    category: 'ai',
    description: 'Ask the configured AI provider a question',
    usage: '.mistral <question>',
    handler: handleAiCommand
};