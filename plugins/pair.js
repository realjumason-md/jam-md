import { requestLocalPairingCode } from '../lib/server.js';

export default {
    command: 'pair',
    aliases: ['paircode', 'session', 'getsession', 'sessionid'],
    category: 'general',
    description: 'Get a local WhatsApp pairing code',
    usage: '.pair 92305395XXXX',
    async handler(sock, message, args, context) {
        const { chatId } = context;
        const number = args.join('').trim();
        if (!number) {
            return await sock.sendMessage(chatId, {
                text: '❌ *Missing number*\nExample: .pair 256765309986'
            }, { quoted: message });
        }

        await sock.sendMessage(chatId, {
            text: '⚡ *Requesting a local pairing code...*'
        }, { quoted: message });

        try {
            const code = await requestLocalPairingCode(number);
            await sock.sendMessage(chatId, {
                text: `✅ *JAM-MD PAIRING CODE*\n\nCode: *${code}*\n\n` +
                    '*How to use:*\n' +
                    '1. Open WhatsApp Settings\n' +
                    '2. Tap Linked Devices\n' +
                    '3. Tap Link a Device\n' +
                    '4. Select Link with phone number instead\n' +
                    '5. Enter the code above.'
            }, { quoted: message });
        }
        catch (error) {
            await sock.sendMessage(chatId, {
                text: `❌ *Pairing failed*\nReason: ${error.message}`
            }, { quoted: message });
        }
    }
};
