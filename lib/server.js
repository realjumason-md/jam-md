import express from 'express';
import { createServer } from 'http';
import config from '../config.js';
import { formatPairingCode, normalizePhoneNumber } from './pairing.js';
const packageInfo = {
    name: config.botName || 'jam-md',
    version: config.version || '6.0.0',
    description: config.description || 'WhatsApp Bot',
    author: config.author || 'Jaiton'
};
const app = express();
const server = createServer(app);
const PORT = config.port || 5000;
let pairingSocket = null;
let pairingStatus = 'starting';
let pairingInFlight = null;
const pairingRequests = new Map();
const PAIRING_COOLDOWN_MS = 30000;
let pairingReadyAt = 0;

app.set('trust proxy', 1);

export function setPairingSocket(socket) {
    pairingSocket = socket;
    pairingStatus = 'ready';
    pairingReadyAt = Date.now() + 3000;
}

export function clearPairingSocket(socket) {
    if (pairingSocket !== socket) {
        return;
    }
    pairingSocket = null;
    pairingReadyAt = 0;
    if (pairingStatus !== 'connected') {
        pairingStatus = 'reconnecting';
    }
}

export function setPairingStatus(status) {
    pairingStatus = status;
}

app.use(express.json({ limit: '2kb' }));

function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (character) => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    }[character]));
}
app.get('/', (req, res) => {
    const uptimeSeconds = Math.floor(process.uptime());
    const hours = Math.floor(uptimeSeconds / 3600);
    const minutes = Math.floor((uptimeSeconds % 3600) / 60);
    const seconds = uptimeSeconds % 60;
    const uptimeString = `${hours}h ${minutes}m ${seconds}s`;
    res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${packageInfo.name.toUpperCase()} Status</title>
        <style>
            :root { --primary: #25d366; --bg: #0f172a; --card-bg: rgba(30, 41, 59, 0.7); }
            body { 
                margin: 0; padding: 0; background: var(--bg); color: white; 
                font-family: 'Inter', system-ui, sans-serif;
                display: flex; justify-content: center; align-items: center; min-height: 100vh;
            }
            .container {
                background: var(--card-bg); backdrop-filter: blur(12px);
                border: 1px solid rgba(255,255,255,0.1); padding: 30px;
                border-radius: 24px; width: 90%; max-width: 400px; text-align: center;
                box-shadow: 0 20px 50px rgba(0,0,0,0.5);
            }
            .status-badge {
                display: inline-flex; align-items: center; background: rgba(37, 211, 102, 0.1);
                color: var(--primary); padding: 5px 15px; border-radius: 50px;
                font-size: 0.8rem; font-weight: bold; margin-bottom: 20px;
            }
            .dot { height: 8px; width: 8px; background: var(--primary); border-radius: 50%; margin-right: 8px; box-shadow: 0 0 10px var(--primary); }
            h1 { margin: 0; font-size: 1.8rem; letter-spacing: 1px; }
            .desc { color: #94a3b8; margin: 10px 0 25px 0; font-size: 0.9rem; }
            .grid { display: grid; gap: 12px; }
            .item { 
                background: rgba(0,0,0,0.2); padding: 12px 18px; border-radius: 12px;
                display: flex; justify-content: space-between; align-items: center;
            }
            .label { color: #64748b; font-size: 0.75rem; text-transform: uppercase; font-weight: 800; }
            .val { font-weight: 600; font-family: monospace; color: #f1f5f9; }
            .pairing { margin-top: 24px; padding-top: 22px; border-top: 1px solid rgba(255,255,255,0.1); text-align: left; }
            .pairing h2 { margin: 0 0 8px; font-size: 1.15rem; }
            .pairing-help { color: #94a3b8; font-size: 0.82rem; line-height: 1.5; margin: 0 0 16px; }
            .pairing label { display: block; color: #cbd5e1; font-size: 0.78rem; font-weight: 700; margin-bottom: 7px; }
            .pairing input { box-sizing: border-box; width: 100%; border: 1px solid #475569; border-radius: 10px; padding: 12px; background: #0f172a; color: #f8fafc; font-size: 1rem; outline: none; }
            .pairing input:focus { border-color: var(--primary); box-shadow: 0 0 0 3px rgba(37,211,102,0.15); }
            .pairing button { width: 100%; margin-top: 10px; border: 0; border-radius: 10px; padding: 12px; background: var(--primary); color: #052e16; font-weight: 800; cursor: pointer; }
            .pairing button:disabled { cursor: wait; opacity: 0.6; }
            .pairing-status { min-height: 20px; color: #94a3b8; font-size: 0.82rem; margin: 12px 0 0; }
            .pairing-status.error { color: #fca5a5; }
            .code-card { margin-top: 14px; padding: 16px; border: 1px solid rgba(37,211,102,0.35); border-radius: 12px; background: rgba(37,211,102,0.08); text-align: center; }
            .code-card span, .code-card small { display: block; color: #a7f3d0; }
            .code-card strong { display: block; margin: 8px 0; color: #fff; font: 800 1.7rem/1.2 monospace; letter-spacing: 0.12em; }
            .copy-button { background: #d1fae5 !important; color: #064e3b !important; margin-top: 0 !important; }
            .code-card small { display: block; margin-top: 12px; color: #cbd5e1; font-size: 0.72rem; line-height: 1.45; }
            footer { margin-top: 25px; font-size: 0.7rem; color: #475569; letter-spacing: 1px; }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="status-badge"><span class="dot"></span> SYSTEM ONLINE</div>
            <h1>${escapeHtml(packageInfo.name.toUpperCase())}</h1>
            <p class="desc">${escapeHtml(packageInfo.description)}</p>
            
            <div class="grid">
                <div class="item"><span class="label">Version</span><span class="val">${escapeHtml(packageInfo.version)}</span></div>
                <div class="item"><span class="label">Author</span><span class="val">${escapeHtml(packageInfo.author)}</span></div>
                <div class="item"><span class="label">Uptime</span><span class="val">${uptimeString}</span></div>
            </div>

            <section class="pairing">
                <h2>Link WhatsApp</h2>
                <p class="pairing-help">Enter your full number with country code, without <strong>+</strong> or spaces.</p>
                <form id="pairing-form">
                    <label for="phone-number">WhatsApp number</label>
                    <input id="phone-number" name="number" type="tel" inputmode="numeric" autocomplete="tel" placeholder="256765309986" required>
                    <button type="submit" id="pair-button">Get pairing code</button>
                </form>
                <p id="pairing-status" class="pairing-status" role="status">Checking pairing service…</p>
                <div id="code-card" class="code-card" hidden>
                    <span>Pairing code</span>
                    <strong id="pairing-code"></strong>
                    <button type="button" id="copy-code" class="copy-button">Copy code</button>
                    <small>On WhatsApp: Linked Devices → Link a Device → Link with phone number instead.</small>
                </div>
            </section>

            <footer>POWERED BY JAM-MD</footer>
        </div>
        <script>
            const form = document.getElementById('pairing-form');
            const phoneInput = document.getElementById('phone-number');
            const pairButton = document.getElementById('pair-button');
            const status = document.getElementById('pairing-status');
            const codeCard = document.getElementById('code-card');
            const codeElement = document.getElementById('pairing-code');
            const copyButton = document.getElementById('copy-code');

            function setStatus(message, isError = false) {
                status.textContent = message;
                status.classList.toggle('error', isError);
            }

            async function refreshPairingStatus() {
                try {
                    const response = await fetch('/pair/status', { cache: 'no-store' });
                    const data = await response.json();
                    if (data.status === 'connected') {
                        setStatus('This bot is already connected.');
                    } else if (data.status === 'ready') {
                        setStatus('Ready. Enter your number to get a code.');
                    } else if (data.status === 'reconnecting') {
                        setStatus('WhatsApp is reconnecting. Try again shortly.', true);
                    } else {
                        setStatus('Waiting for the WhatsApp service…');
                    }
                } catch {
                    setStatus('Could not check the pairing service.', true);
                }
            }

            form.addEventListener('submit', async (event) => {
                event.preventDefault();
                pairButton.disabled = true;
                codeCard.hidden = true;
                setStatus('Requesting your pairing code…');
                try {
                    const response = await fetch('/pair', {
                        method: 'POST',
                        headers: { 'content-type': 'application/json' },
                        body: JSON.stringify({ number: phoneInput.value })
                    });
                    const data = await response.json();
                    if (!response.ok) throw new Error(data.error || 'Pairing request failed.');
                    codeElement.textContent = data.code;
                    codeCard.hidden = false;
                    const copied = await copyCode(data.code);
                    setStatus(copied
                        ? 'Code copied. Paste it into WhatsApp now.'
                        : 'Code ready. Copy it and enter it in WhatsApp.');
                } catch (error) {
                    setStatus(error instanceof Error ? error.message : 'Pairing request failed.', true);
                } finally {
                    pairButton.disabled = false;
                }
            });

            async function copyCode(code) {
                try {
                    if (!navigator.clipboard?.writeText) {
                        return false;
                    }
                    await navigator.clipboard.writeText(code);
                    copyButton.textContent = 'Copied';
                    setTimeout(() => { copyButton.textContent = 'Copy code'; }, 1500);
                    return true;
                } catch {
                    return false;
                }
            }

            copyButton.addEventListener('click', async () => {
                const copied = await copyCode(codeElement.textContent);
                if (!copied) {
                    setStatus('Copy failed. Select the code and copy it manually.', true);
                }
            });

            refreshPairingStatus();
        </script>
    </body>
    </html>
    `);
});
app.get('/health', (req, res) => {
    const mem = process.memoryUsage();
    res.json({
        status: 'ok',
        uptime: Math.floor(process.uptime()),
        memory: {
            rss: `${Math.round(mem.rss / 1024 / 1024) }MB`,
            heapUsed: `${Math.round(mem.heapUsed / 1024 / 1024) }MB`,
            heapTotal: `${Math.round(mem.heapTotal / 1024 / 1024) }MB`
        },
        version: packageInfo.version,
        bot: packageInfo.name,
        timestamp: new Date().toISOString()
    });
});
app.get('/process', (req, res) => {
    const { send } = req.query;
    if (!send)
        return res.status(400).json({ error: 'Missing send query' });
    res.json({ status: 'Received', data: send });
});
app.get('/chat', (req, res) => {
    const { message, to } = req.query;
    if (!message || !to)
        return res.status(400).json({ error: 'Missing message or to query' });
    res.json({ status: 200, info: 'Message received (integration not implemented)' });
});
app.get('/pair/status', (req, res) => {
    res.set('Cache-Control', 'no-store');
    res.json({
        status: pairingStatus,
        inProgress: Boolean(pairingInFlight)
    });
});
app.post('/pair', async (req, res) => {
    res.set('Cache-Control', 'no-store');
    const number = normalizePhoneNumber(req.body?.number);
    if (!number) {
        return res.status(400).json({
            error: 'Enter a valid phone number with country code, without + or spaces.'
        });
    }
    if (!pairingSocket || pairingStatus === 'connected') {
        if (pairingStatus !== 'connected') {
            res.set('Retry-After', '5');
        }
        return res.status(503).json({
            error: pairingStatus === 'connected'
                ? 'This bot is already connected.'
                : 'WhatsApp pairing is not ready yet. Try again shortly.'
        });
    }
    if (pairingInFlight) {
        res.set('Retry-After', '5');
        return res.status(429).json({ error: 'A pairing code request is already in progress.' });
    }
    const clientKey = `${req.ip || req.socket.remoteAddress || 'unknown'}:${number}`;
    const lastRequest = pairingRequests.get(clientKey) || 0;
    if (Date.now() - lastRequest < PAIRING_COOLDOWN_MS) {
        res.set('Retry-After', '30');
        return res.status(429).json({ error: 'Please wait 30 seconds before requesting another code.' });
    }
    pairingRequests.set(clientKey, Date.now());
    setTimeout(() => pairingRequests.delete(clientKey), PAIRING_COOLDOWN_MS);
    pairingInFlight = (async () => {
        try {
            const socket = pairingSocket;
            if (!socket) {
                throw new Error('Pairing socket is unavailable');
            }
            const waitMs = pairingReadyAt - Date.now();
            if (waitMs > 0) {
                await new Promise((resolve) => setTimeout(resolve, waitMs));
            }
            if (socket !== pairingSocket) {
                throw new Error('Pairing socket changed while preparing the request');
            }
            return formatPairingCode(await socket.requestPairingCode(number));
        }
        finally {
            pairingInFlight = null;
        }
    })();
    try {
        const code = await pairingInFlight;
        if (!code) {
            throw new Error('WhatsApp returned an empty pairing code');
        }
        return res.json({ code });
    }
    catch (_error) {
        console.error('[PAIRING] Web pairing request failed');
        return res.status(502).json({
            error: 'WhatsApp could not generate a code right now. Try again shortly.'
        });
    }
});
export { app, server, PORT };
