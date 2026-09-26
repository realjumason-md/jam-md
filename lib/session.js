import { fileURLToPath } from 'url';
import path, { dirname } from 'path';
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
import fs from 'fs';
import axios from 'axios';
import { SESSION_DIR } from './paths.js';

function resolveCredentialsUrl(value) {
    const input = String(value || '').trim();
    if (!input)
        return '';

    // A full URL is useful for private deployments and avoids coupling the
    // bot to one person's GitHub account.
    if (/^https?:\/\//i.test(input)) {
        return input.endsWith('/creds.json') ? input : `${input.replace(/\/+$/, '')}/creds.json`;
    }

    const gistOwner = process.env.SESSION_GIST_OWNER?.trim() || 'stormfiber';
    const gistId = input.replace(/^[^/]+\/[^_]+_/, '');
    return `https://gist.githubusercontent.com/${gistOwner}/${gistId}/raw/creds.json`;
}
/**
 * Save credentials from GitHub Gist to session/creds.json
 * @param {string} txt - Gist ID with optional prefix
 */
async function SaveCreds(txt) {
    const gistUrl = resolveCredentialsUrl(txt);
    if (!gistUrl)
        throw new Error('SESSION_ID is empty');
    try {
        const response = await axios.get(gistUrl, {
            timeout: 30000,
            validateStatus: (status) => status >= 200 && status < 300
        });
        const data = typeof response.data === 'string' ? response.data : JSON.stringify(response.data);
        const sessionDir = SESSION_DIR;
        if (!fs.existsSync(sessionDir)) {
            fs.mkdirSync(sessionDir, { recursive: true });
        }
        const credsPath = path.join(sessionDir, 'creds.json');
        const parsed = JSON.parse(data);
        if (!parsed || typeof parsed !== 'object' || !parsed.noiseKey || !parsed.signedIdentityKey || !parsed.signedPreKey) {
            throw new Error('Downloaded session credentials are incomplete');
        }
        fs.writeFileSync(credsPath, JSON.stringify(parsed));
    }
    catch (error) {
        console.error('❌ Error downloading or saving credentials:', error.message);
        if (error.response) {
            console.error('❌ Status:', error.response.status);
            console.error('❌ Response:', error.response.data);
        }
        throw error;
    }
}
export default SaveCreds;
