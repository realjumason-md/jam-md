import 'dotenv/config';

import fs, { existsSync, mkdirSync, rmSync } from 'fs';
import path, { dirname } from 'path';
import chalk from 'chalk';
import syntaxerror from 'syntax-error';
import { parsePhoneNumber as PhoneNumber } from 'awesome-phonenumber';
import QRCode from 'qrcode';
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
import { smsg } from './lib/myfunc.js';
import { compileAll } from './lib/compile.js';
import makeWASocket, { useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion, Browsers, jidDecode, jidNormalizedUser, makeCacheableSignalKeyStore, delay } from '@whiskeysockets/baileys';
import NodeCache from 'node-cache';
import pino from 'pino';
import config from './config.js';
import store from './lib/lightweight_store.js';
import SaveCreds from './lib/session.js';
import { server, PORT, clearPairingSocket, setPairingSocket, setPairingStatus } from './lib/server.js';
import { printLog } from './lib/print.js';
import { writeErrorLog } from './lib/logger.js';
import { handleMessages, handleGroupParticipantUpdate, handleStatus, handleCall } from './lib/messageHandler.js';
import { SESSION_DIR } from './lib/paths.js';
import commandHandler from './lib/commandHandler.js';
store.readFromFile();
setInterval(() => store.writeToFile(), config.storeWriteInterval || 10000);
setInterval(() => {
    if (global.gc) {
        global.gc();
        console.log('🧹 Garbage collection completed');
    }
}, 60000);
setInterval(() => {
    const used = process.memoryUsage().rss / 1024 / 1024;
    if (used > 400) {
        printLog('warning', 'RAM too high (>400MB), restarting bot...');
        process.exit(1);
    }
}, 30000);
// Auto-create data directory and default files on startup
const DATA_DEFAULTS = {
    'owner.json': [],
    'banned.json': [],
    'premium.json': [],
    'warnings.json': {},
    'notes.json': {},
    'autoAi.json': {},
    'messageCount.json': { isPublic: true, messageCount: {} },
    'userGroupData.json': { users: [], groups: [], antilink: {}, antibadword: {}, warnings: {}, sudo: [], welcome: {}, goodbye: {}, chatbot: {}, autoReaction: false },
    'autoStatus.json': { enabled: false },
    'autoread.json': { enabled: false },
    'autotyping.json': { enabled: false },
    'pmblocker.json': { enabled: false },
    'anticall.json': { enabled: false },
    'stealthMode.json': { enabled: false },
    'autoBio.json': { enabled: false, customBio: null },
    'autoReaction.json': { enabled: false },
    'antidelete.json': { enabled: false },
    'antilink.json': {},
    'antibadword.json': {},
};
fs.mkdirSync('./data', { recursive: true });
for (const [file, def] of Object.entries(DATA_DEFAULTS)) {
    const fp = `./data/${file}`;
    if (!fs.existsSync(fp))
        fs.writeFileSync(fp, JSON.stringify(def, null, 2));
}
let owner = [];
try {
    owner = JSON.parse(fs.readFileSync('./data/owner.json', 'utf-8'));
}
catch {
    owner = [];
}
global.botname = config.botName || "jam-md";
global.themeemoji = "•";
let activeSocket = null;
let reconnectTimer = null;
let reconnectAttempt = 0;
let startInFlight = false;
let sessionRecoveryInFlight = false;
const MAX_RECONNECT_DELAY_MS = 30000;
const SESSION_RESET_MARKER = path.join(SESSION_DIR, '.reset-required');

function errorText(error) {
    if (!error)
        return '';
    return [
        error.message,
        error.stack,
        error.data?.message,
        error.output?.payload?.message
    ].filter(Boolean).join(' ');
}

function isCryptoSessionError(error) {
    const text = errorText(error).toLowerCase();
    return [
        'verifymac',
        'sessioncipher',
        'bad mac',
        'bad mac key',
        'decryptwithsessions',
        'failed to decrypt',
        'libsignal',
        'invalid pre-key',
        'signal error'
    ].some((marker) => text.includes(marker));
}

function closeActiveSocket() {
    const socket = activeSocket;
    activeSocket = null;
    if (!socket)
        return;
    try {
        socket.ws?.close();
    }
    catch (error) {
        printLog('warning', `Could not close the stale WhatsApp socket: ${error.message}`);
    }
}

function scheduleReconnect(reason = 'connection closed') {
    if (reconnectTimer || startInFlight || sessionRecoveryInFlight)
        return;
    const waitMs = Math.min(
        5000 * Math.max(1, 2 ** reconnectAttempt),
        MAX_RECONNECT_DELAY_MS
    );
    reconnectAttempt += 1;
    printLog('connection', `${reason}. Reconnecting in ${Math.ceil(waitMs / 1000)} seconds...`);
    reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        startQasimDev().catch((error) => {
            printLog('error', `Reconnect failed: ${error.message}`);
            scheduleReconnect('reconnect attempt failed');
        });
    }, waitMs);
}

async function recoverCorruptedSession(reason) {
    if (sessionRecoveryInFlight)
        return;
    sessionRecoveryInFlight = true;
    try {
        closeActiveSocket();
        rmSync(SESSION_DIR, { recursive: true, force: true });
        ensureSessionDirectory();
        fs.writeFileSync(SESSION_RESET_MARKER, JSON.stringify({
            reason,
            resetAt: new Date().toISOString()
        }));
        setPairingStatus('ready');
        printLog('warning', `WhatsApp session reset after a decryption failure (${reason}). Re-pair the bot if needed.`);
    }
    catch (error) {
        printLog('error', `Could not reset the WhatsApp session: ${error.message}`);
    }
    finally {
        sessionRecoveryInFlight = false;
    }
    scheduleReconnect('session recovery completed');
}

const pairingCode = !process.argv.includes("--qr-code");
const useMobile = process.argv.includes("--mobile");
function ensureSessionDirectory() {
    if (!existsSync(SESSION_DIR)) {
        mkdirSync(SESSION_DIR, { recursive: true });
    }
    return SESSION_DIR;
}
function hasValidSession() {
    try {
        const credsPath = path.join(SESSION_DIR, 'creds.json');
        if (!existsSync(credsPath))
            return false;
        const fileContent = fs.readFileSync(credsPath, 'utf8');
        if (!fileContent || fileContent.trim().length === 0) {
            printLog('warning', 'creds.json exists but is empty');
            return false;
        }
        try {
            const creds = JSON.parse(fileContent);
            if (!creds.noiseKey || !creds.signedIdentityKey || !creds.signedPreKey) {
                printLog('warning', 'creds.json is missing required fields');
                return false;
            }
            if (creds.registered === false) {
                printLog('warning', 'Session not registered. Clearing for fresh pairing...');
                try {
                    rmSync(SESSION_DIR, { recursive: true, force: true });
                }
                catch (_e) { /* ignore */ }
                return false;
            }
            printLog('success', 'Valid and registered session credentials found');
            return true;
        }
        catch (_parseError) {
            printLog('warning', 'creds.json contains invalid JSON');
            return false;
        }
    }
    catch (error) {
        printLog('error', `Error checking session validity: ${error.message}`);
        return false;
    }
}
async function initializeSession() {
    ensureSessionDirectory();
    if (existsSync(SESSION_RESET_MARKER)) {
        printLog('warning', 'A previous WhatsApp session failed authentication. Waiting for a fresh pairing instead of restoring SESSION_ID.');
        return false;
    }
    const txt = config.sessionId;
    if (!txt) {
        if (hasValidSession()) {
            printLog('success', 'Existing session found. Using saved credentials');
            return true;
        }
        return false;
    }
    if (hasValidSession())
        return true;
    try {
        await SaveCreds(txt);
        await delay(2000);
        if (hasValidSession()) {
            printLog('success', 'Session file verified and valid');
            await delay(1000);
            return true;
        }
        else {
            printLog('error', 'Session file not valid after download');
            return false;
        }
    }
    catch (error) {
        printLog('error', `Error downloading session: ${error.message}`);
        return false;
    }
}
server.listen(PORT, () => {
    printLog('success', `Server listening on port ${PORT}`);
});
async function startQasimDev() {
    if (startInFlight)
        return activeSocket;
    startInFlight = true;
    try {
        const { version } = await fetchLatestBaileysVersion();
        ensureSessionDirectory();
        await delay(1000);
        const { state, saveCreds } = await useMultiFileAuthState(SESSION_DIR);
        const _saveCreds = async () => {
            ensureSessionDirectory();
            await saveCreds();
        };
        const msgRetryCounterCache = new NodeCache();
        const ghostMode = await store.getSetting('global', 'stealthMode');
        const isGhostActive = ghostMode && ghostMode.enabled;
        const QasimDev = makeWASocket({
            version,
            logger: pino({ level: 'silent' }),
            browser: Browsers.macOS('Chrome'),
            auth: {
                creds: state.creds,
                keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "fatal" }).child({ level: "fatal" })),
            },
            markOnlineOnConnect: !isGhostActive,
            generateHighQualityLinkPreview: true,
            syncFullHistory: false,
            shouldSyncHistoryMessage: () => false,
            getMessage: async (key) => {
                const jid = jidNormalizedUser(key.remoteJid);
                const msg = await store.loadMessage(jid, key.id);
                return msg?.message || "";
            },
            msgRetryCounterCache,
            defaultQueryTimeoutMs: 60000,
            connectTimeoutMs: 60000,
            keepAliveIntervalMs: 10000,
        });
        activeSocket = QasimDev;
        QasimDev.store = store;
        setPairingSocket(QasimDev);
        const originalSendPresenceUpdate = QasimDev.sendPresenceUpdate;
        const originalReadMessages = QasimDev.readMessages;
        const originalSendReceipt = QasimDev.sendReceipt;
        QasimDev.sendPresenceUpdate = async function (...args) {
            const ghostMode = await store.getSetting('global', 'stealthMode');
            if (ghostMode && ghostMode.enabled) {
                printLog('info', '👻 Blocked presence update (stealth mode)');
                return;
            }
            return originalSendPresenceUpdate.apply(this, args);
        };
        QasimDev.readMessages = async function (...args) {
            const ghostMode = await store.getSetting('global', 'stealthMode');
            if (ghostMode && ghostMode.enabled)
                return;
            return originalReadMessages.apply(this, args);
        };
        if (originalSendReceipt) {
            QasimDev.sendReceipt = async function (...args) {
                const ghostMode = await store.getSetting('global', 'stealthMode');
                if (ghostMode && ghostMode.enabled)
                    return;
                return originalSendReceipt.apply(this, args);
            };
        }
        const originalQuery = QasimDev.query;
        QasimDev.query = async function (node, ...args) {
            const ghostMode = await store.getSetting('global', 'stealthMode');
            if (ghostMode && ghostMode.enabled) {
                if (node && node.tag === 'receipt')
                    return;
                if (node && node.attrs && (node.attrs.type === 'read' || node.attrs.type === 'read-self'))
                    return;
            }
            return originalQuery.apply(this, [node, ...args]);
        };
        QasimDev.isGhostMode = async () => {
            const ghostMode = await store.getSetting('global', 'stealthMode');
            return ghostMode && ghostMode.enabled;
        };
        QasimDev.ev.on('creds.update', _saveCreds);
        store.bind(QasimDev.ev);
        QasimDev.ev.on('messages.upsert', async (chatUpdate) => {
            try {
                if (chatUpdate?.requestId) {
                    return;
                }
                const mek = chatUpdate.messages[0];
                if (!mek.message)
                    return;
                mek.message = (Object.keys(mek.message)[0] === 'ephemeralMessage')
                    ? mek.message.ephemeralMessage.message
                    : mek.message;
                if (mek.key && mek.key.remoteJid === 'status@broadcast') {
                    await handleStatus(QasimDev, chatUpdate);
                    return;
                }
                if (!QasimDev.public && !mek.key.fromMe && chatUpdate.type === 'notify') {
                    const isGroup = mek.key?.remoteJid?.endsWith('@g.us');
                    if (!isGroup)
                        return;
                }
                if (mek.key.id.startsWith('BAE5') && mek.key.id.length === 16)
                    return;
                if (QasimDev?.msgRetryCounterCache) {
                    QasimDev.msgRetryCounterCache.clear();
                }
                try {
                    await handleMessages(QasimDev, chatUpdate);
                }
                catch (err) {
                    printLog('error', `Error in handleMessages: ${err.message}`);
                    if (mek.key && mek.key.remoteJid) {
                        await QasimDev.sendMessage(mek.key.remoteJid, {
                            text: '❌ An error occurred while processing your message.'
                        }).catch(console.error);
                    }
                }
            }
            catch (err) {
                printLog('error', `Error in messages.upsert: ${err.message}`);
            }
        });
        QasimDev.decodeJid = (jid) => {
            if (!jid)
                return jid;
            if (/:\d+@/gi.test(jid)) {
                const decode = jidDecode(jid) || {};
                return decode.user && decode.server && `${decode.user }@${ decode.server}` || jid;
            }
            else
                return jid;
        };
        QasimDev.ev.on('contacts.update', (update) => {
            for (const contact of update) {
                const id = QasimDev.decodeJid(contact.id);
                if (store && store.contacts)
                    store.contacts[id] = { id, name: contact.notify };
            }
        });
        QasimDev.getName = (jid, withoutContact = false) => {
            const id = QasimDev.decodeJid(jid);
            withoutContact = QasimDev.withoutContact || withoutContact;
            let v;
            if (id.endsWith("@g.us"))
                return new Promise(async (resolve) => {
                    v = store.contacts[id] || {};
                    if (!(v.name || v.subject))
                        v = QasimDev.groupMetadata(id) || {};
                    resolve(v.name || v.subject || PhoneNumber(`+${ id.replace('@s.whatsapp.net', '')}`).number?.international);
                });
            else
                v = id === '0@s.whatsapp.net' ? {
                    id,
                    name: 'WhatsApp'
                } : id === QasimDev.decodeJid(QasimDev.user.id) ?
                    QasimDev.user :
                    (store.contacts[id] || {});
            return (withoutContact ? '' : v.name) || v.subject || v.verifiedName || PhoneNumber(`+${ jid.replace('@s.whatsapp.net', '')}`).number?.international;
        };
        QasimDev.public = true;
        QasimDev.serializeM = (m) => smsg(QasimDev, m, store);
        const isRegistered = state.creds?.registered === true;
        setPairingStatus(isRegistered ? 'connected' : 'ready');
        if (pairingCode && !isRegistered) {
            if (useMobile)
                throw new Error('Cannot use pairing code with mobile api');
            printLog('info', 'Pairing is ready. Open the web page and enter your WhatsApp number.');
        }
        else if (isRegistered) {
            setPairingStatus('connected');
        }
        else {
            printLog('warning', 'Waiting for connection to establish...');
        }
        QasimDev.ev.on('connection.update', async (s) => {
            const { connection, lastDisconnect, qr } = s;
            if (qr) {
                if (!pairingCode) {
                    try {
                        console.log(await QRCode.toString(qr, { type: 'terminal', small: true }));
                    }
                    catch (_e) {
                        console.log('QR:', qr);
                    }
                }
            }
            if (connection === "open") {
                reconnectAttempt = 0;
                setPairingStatus('connected');
                try {
                    if (existsSync(SESSION_RESET_MARKER))
                        fs.rmSync(SESSION_RESET_MARKER, { force: true });
                }
                catch (error) {
                    printLog('warning', `Could not clear the session reset marker: ${error.message}`);
                }
                printLog('success', 'Bot connected successfully!');
                try {
                    const setbioModule = await import('./plugins/setbio.js');
                    const startAutoBio = setbioModule.startAutoBio || setbioModule.default?.startAutoBio;
                    if (typeof startAutoBio === 'function')
                        startAutoBio(QasimDev);
                }
                catch (e) {
                    printLog('error', `Failed to start auto bio: ${e.message}`);
                }
                const ghostMode = await store.getSetting('global', 'stealthMode');
                if (ghostMode && ghostMode.enabled) {
                    printLog('info', '👻 STEALTH MODE ACTIVE');
                }
                printLog('success', `Connected to => ${ JSON.stringify(QasimDev.user, null, 2)}`);
                try {
                    const botNumber = `${QasimDev.user.id.split(':')[0] }@s.whatsapp.net`;
                    const ghostStatus = (ghostMode && ghostMode.enabled) ? '\n👻 Stealth Mode: ACTIVE' : '';
                    await QasimDev.sendMessage(botNumber, {
                        text: `🤖 Bot Connected Successfully!\n\n⏰ Time: ${new Date().toLocaleString()}\n✅ Status: Online and Ready!${ghostStatus}`
                    });
                }
                catch (error) {
                    printLog('error', `Failed to send connection message: ${error.message}`);
                }
                await delay(1999);
                try {
                    owner = JSON.parse(fs.readFileSync('./data/owner.json', 'utf-8'));
                }
                catch (_e) { }
                printLog('info', `[ ${config.botName || 'jam-md'} ]`);
                printLog('info', `WA NUMBER  : ${owner[0] || config.ownerNumber || ''}`);
                printLog('success', `Bot Connected Successfully!`);
                printLog('info', `Plugins   : ${commandHandler.commands.size}`);
                printLog('info', `Prefixes   : ${config.prefixes.join(', ')}`);
                printLog('store', `Backend    : ${store.getStats().backend}`);
                console.log();
            }
            if (connection === 'close') {
                clearPairingSocket(QasimDev);
                setPairingStatus('reconnecting');
                const statusCode = lastDisconnect?.error?.output?.statusCode;
                const disconnectError = lastDisconnect?.error;
                activeSocket = null;
                const shouldResetSession = isCryptoSessionError(disconnectError) ||
                    statusCode === DisconnectReason.loggedOut ||
                    statusCode === 401;
                if (shouldResetSession) {
                    await recoverCorruptedSession(
                        isCryptoSessionError(disconnectError)
                            ? 'Baileys reported a bad MAC/session cipher'
                            : `WhatsApp disconnected with status ${statusCode}`
                    );
                    return;
                }
                scheduleReconnect(`WhatsApp connection closed${statusCode ? ` (status ${statusCode})` : ''}`);
            }
        });
        QasimDev.ev.on('call', async (calls) => {
            await handleCall(QasimDev, calls);
        });
        QasimDev.ev.on('group-participants.update', async (update) => {
            await handleGroupParticipantUpdate(QasimDev, update);
        });
        QasimDev.ev.on('status.update', async (status) => {
            await handleStatus(QasimDev, status);
        });
        QasimDev.ev.on('messages.reaction', async (reaction) => {
            await handleStatus(QasimDev, reaction);
        });
        return QasimDev;
    }
    catch (error) {
        printLog('error', `Error in startQasimDev: ${error.message}`);
        startInFlight = false;
        scheduleReconnect('WhatsApp startup failed');
    }
    finally {
        startInFlight = false;
    }
}
async function main() {
    await compileAll();
    await commandHandler.loadCommands();
    await commandHandler.loadCommandState();
    printLog('info', 'Starting jam-md BOT...');
    await initializeSession();
    await delay(3000);
    startQasimDev().catch((error) => {
        printLog('error', `Fatal error: ${error.message}`);
        process.exit(1);
    });
}
main();
// Temp folder setup
const customTemp = path.join(process.cwd(), 'temp');
if (!fs.existsSync(customTemp))
    fs.mkdirSync(customTemp, { recursive: true });
process.env.TMPDIR = customTemp;
process.env.TEMP = customTemp;
process.env.TMP = customTemp;
// Temp folder cleanup
setInterval(() => {
    fs.readdir(customTemp, (err, files) => {
        if (err)
            return;
        for (const file of files) {
            const filePath = path.join(customTemp, file);
            fs.stat(filePath, (err, stats) => {
                if (!err && Date.now() - stats.mtimeMs > 3 * 60 * 60 * 1000) {
                    fs.unlink(filePath, () => { });
                }
            });
        }
    });
}, 1 * 60 * 60 * 1000);
// Syntax check dist files
const folders = [
    path.join(__dirname, './lib'),
    path.join(__dirname, './plugins')
];
folders.forEach(folder => {
    if (!fs.existsSync(folder))
        return;
    fs.readdirSync(folder)
        .filter(file => file.endsWith('.js'))
        .forEach(file => {
        const filePath = path.join(folder, file);
        try {
            const code = fs.readFileSync(filePath, 'utf-8');
            const err = syntaxerror(code, file, {
                sourceType: 'module',
                allowAwaitOutsideFunction: true
            });
            if (err) {
                console.error(chalk.red(`❌ Syntax error in ${filePath}:\n${err}`));
            }
        }
        catch (e) {
            console.error(chalk.yellow(`⚠️ Cannot read file ${filePath}:\n${e}`));
        }
    });
});
// Error handlers
process.on('uncaughtException', (err) => {
    printLog('error', `Uncaught Exception: ${err.message}`);
    console.error(err.stack);
    writeErrorLog({
        type: 'uncaughtException',
        error: err.message,
        stack: err.stack,
        timestamp: new Date().toISOString()
    });
});
process.on('unhandledRejection', (err) => {
    if (isCryptoSessionError(err)) {
        void recoverCorruptedSession('libsignal could not decrypt the stored session');
    }
    const message = errorText(err) || 'unknown error';
    printLog('error', `Unhandled Rejection: ${message}`);
    console.error(err?.stack || err);
    writeErrorLog({
        type: 'unhandledRejection',
        error: message,
        stack: err?.stack,
        timestamp: new Date().toISOString()
    });
});
server.on('error', (error) => {
    if (error.code === 'EADDRINUSE') {
        printLog('error', `Address localhost:${PORT} in use`);
        writeErrorLog({
            type: 'serverError',
            error: `Address localhost:${PORT} in use`,
            timestamp: new Date().toISOString()
        });
        server.close();
    }
    else {
        printLog('error', `Server error: ${error.message}`);
        writeErrorLog({
            type: 'serverError',
            error: error.message,
            stack: error.stack,
            timestamp: new Date().toISOString()
        });
    }
});
