export default {
    command: 'pair',
    aliases: ['paircode', 'session', 'getsession', 'sessionid'],
    category: 'general',
    description: 'Get session id for jam-md',
    usage: '.pair 92305395XXXX',
    async handler(sock, message, _args, context) {
        const { chatId } = context;
        await sock.sendMessage(chatId, {
            text: 'Pairing codes are now generated on the bot web page. Open your deployed jam-md URL, enter your WhatsApp number, then copy the code into WhatsApp.'
        }, { quoted: message });
    }
};
