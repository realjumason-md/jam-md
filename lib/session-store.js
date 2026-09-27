import fs from 'fs';
import path from 'path';
import { SESSION_DIR } from './paths.js';

const SESSION_STORE_MODE = String(process.env.SESSION_STORE || 'auto').trim().toLowerCase();
const SESSION_STORE_KEY = String(
    process.env.SESSION_STORE_KEY ||
    `${process.env.BOT_NAME || 'jam-md'}:whatsapp`
).trim();
const SESSION_TABLE = 'jam_md_whatsapp_sessions';
const SNAPSHOT_VERSION = 1;

let adapterPromise = null;
let adapter = null;
let watcher = null;
let syncTimer = null;
let syncQueue = Promise.resolve();
let lastSnapshot = '';
let persistenceStarted = false;

function sessionFiles(directory = SESSION_DIR) {
    if (!fs.existsSync(directory))
        return [];

    const files = [];
    const walk = (currentDirectory) => {
        for (const entry of fs.readdirSync(currentDirectory, { withFileTypes: true })) {
            const absolutePath = path.join(currentDirectory, entry.name);
            if (entry.isDirectory()) {
                walk(absolutePath);
                continue;
            }
            if (entry.name === '.reset-required')
                continue;
            files.push(absolutePath);
        }
    };
    walk(directory);
    return files;
}

export function createSessionSnapshot(directory = SESSION_DIR) {
    const files = {};
    for (const filePath of sessionFiles(directory)) {
        const relativePath = path.relative(directory, filePath);
        files[relativePath] = fs.readFileSync(filePath).toString('base64');
    }
    return {
        version: SNAPSHOT_VERSION,
        files
    };
}

export function restoreSessionSnapshot(snapshot, directory = SESSION_DIR) {
    if (!snapshot || snapshot.version !== SNAPSHOT_VERSION || !snapshot.files ||
        typeof snapshot.files !== 'object') {
        throw new Error('Stored WhatsApp session snapshot is invalid');
    }

    fs.mkdirSync(directory, { recursive: true });
    for (const [relativePath, encoded] of Object.entries(snapshot.files)) {
        const destination = path.resolve(directory, relativePath);
        const relativeDestination = path.relative(directory, destination);
        if (relativeDestination.startsWith('..') || path.isAbsolute(relativeDestination)) {
            throw new Error('Stored WhatsApp session contains an unsafe file path');
        }
        if (typeof encoded !== 'string')
            throw new Error('Stored WhatsApp session contains invalid file data');
        fs.mkdirSync(path.dirname(destination), { recursive: true });
        fs.writeFileSync(destination, Buffer.from(encoded, 'base64'));
    }
}

function hasCompleteLocalSession() {
    return sessionFiles().length > 1 &&
        fs.existsSync(path.join(SESSION_DIR, 'creds.json'));
}

function hasAnyLocalSession() {
    return fs.existsSync(path.join(SESSION_DIR, 'creds.json'));
}

function selectedBackend() {
    if (SESSION_STORE_MODE === 'none' || SESSION_STORE_MODE === 'local')
        return null;
    if (SESSION_STORE_MODE !== 'auto')
        return SESSION_STORE_MODE;
    if (process.env.MONGO_URL)
        return 'mongo';
    if (process.env.POSTGRES_URL || process.env.DATABASE_URL)
        return 'postgres';
    if (process.env.MYSQL_URL)
        return 'mysql';
    return null;
}

async function createAdapter() {
    const backend = selectedBackend();
    if (!backend)
        return null;

    if (backend === 'mongo') {
        const mongoose = (await import('mongoose')).default;
        const connection = await mongoose.createConnection(process.env.MONGO_URL, {
            serverSelectionTimeoutMS: 10000
        }).asPromise();
        const collection = connection.db.collection(SESSION_TABLE);
        await collection.createIndex({ key: 1 }, { unique: true });
        return {
            name: 'MongoDB',
            async load() {
                const record = await collection.findOne({ key: SESSION_STORE_KEY });
                return record?.snapshot || null;
            },
            async save(snapshot) {
                await collection.replaceOne(
                    { key: SESSION_STORE_KEY },
                    {
                        key: SESSION_STORE_KEY,
                        snapshot,
                        updatedAt: new Date()
                    },
                    { upsert: true }
                );
            },
            async clear() {
                await collection.deleteOne({ key: SESSION_STORE_KEY });
            },
            async close() {
                await connection.close();
            }
        };
    }

    if (backend === 'postgres') {
        const pg = await import('pg');
        const Pool = pg.default?.Pool || pg.Pool;
        const pool = new Pool({
            connectionString: process.env.POSTGRES_URL || process.env.DATABASE_URL,
            max: 1,
            connectionTimeoutMillis: 10000
        });
        await pool.query(`
            CREATE TABLE IF NOT EXISTS ${SESSION_TABLE} (
                session_key TEXT PRIMARY KEY,
                snapshot JSONB NOT NULL,
                updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            )
        `);
        return {
            name: 'PostgreSQL',
            async load() {
                const result = await pool.query(
                    `SELECT snapshot FROM ${SESSION_TABLE} WHERE session_key = $1`,
                    [SESSION_STORE_KEY]
                );
                return result.rows[0]?.snapshot || null;
            },
            async save(snapshot) {
                await pool.query(`
                    INSERT INTO ${SESSION_TABLE} (session_key, snapshot, updated_at)
                    VALUES ($1, $2::jsonb, NOW())
                    ON CONFLICT (session_key)
                    DO UPDATE SET snapshot = EXCLUDED.snapshot, updated_at = NOW()
                `, [SESSION_STORE_KEY, JSON.stringify(snapshot)]);
            },
            async clear() {
                await pool.query(
                    `DELETE FROM ${SESSION_TABLE} WHERE session_key = $1`,
                    [SESSION_STORE_KEY]
                );
            },
            async close() {
                await pool.end();
            }
        };
    }

    if (backend === 'mysql') {
        const mysql = await import('mysql2/promise');
        const pool = mysql.createPool(process.env.MYSQL_URL);
        await pool.query(`
            CREATE TABLE IF NOT EXISTS ${SESSION_TABLE} (
                session_key VARCHAR(255) PRIMARY KEY,
                snapshot LONGTEXT NOT NULL,
                updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            )
        `);
        return {
            name: 'MySQL',
            async load() {
                const [rows] = await pool.query(
                    `SELECT snapshot FROM ${SESSION_TABLE} WHERE session_key = ?`,
                    [SESSION_STORE_KEY]
                );
                const value = rows[0]?.snapshot;
                return value ? JSON.parse(value) : null;
            },
            async save(snapshot) {
                await pool.query(`
                    INSERT INTO ${SESSION_TABLE} (session_key, snapshot)
                    VALUES (?, ?)
                    ON DUPLICATE KEY UPDATE snapshot = VALUES(snapshot)
                `, [SESSION_STORE_KEY, JSON.stringify(snapshot)]);
            },
            async clear() {
                await pool.query(
                    `DELETE FROM ${SESSION_TABLE} WHERE session_key = ?`,
                    [SESSION_STORE_KEY]
                );
            },
            async close() {
                await pool.end();
            }
        };
    }

    throw new Error(`Unsupported SESSION_STORE backend: ${backend}`);
}

async function getAdapter() {
    if (!adapterPromise) {
        adapterPromise = createAdapter().then((createdAdapter) => {
            adapter = createdAdapter;
            return createdAdapter;
        }).catch((error) => {
            adapterPromise = null;
            throw error;
        });
    }
    return adapterPromise;
}

async function restoreRemoteSession() {
    let remoteAdapter;
    try {
        remoteAdapter = await getAdapter();
    }
    catch (error) {
        console.error(`[SESSION] Could not initialize persistent session storage: ${error.message}`);
        return false;
    }
    if (!remoteAdapter)
        return false;

    if (hasCompleteLocalSession()) {
        console.log(`[SESSION] Using the local WhatsApp auth state; ${remoteAdapter.name} remains available as backup`);
        return true;
    }

    try {
        const snapshot = await remoteAdapter.load();
        if (!snapshot?.files || Object.keys(snapshot.files).length === 0) {
            if (hasAnyLocalSession()) {
                console.log('[SESSION] Local credentials found; waiting for the remaining auth keys to be saved');
            }
            return false;
        }
        const restoreDirectory = `${SESSION_DIR}.restore-${process.pid}`;
        fs.rmSync(restoreDirectory, { recursive: true, force: true });
        restoreSessionSnapshot(snapshot, restoreDirectory);
        fs.rmSync(SESSION_DIR, { recursive: true, force: true });
        fs.renameSync(restoreDirectory, SESSION_DIR);
        console.log(`[SESSION] Restored WhatsApp auth state from ${remoteAdapter.name}`);
        return true;
    }
    catch (error) {
        console.error(`[SESSION] Could not restore the persistent WhatsApp session: ${error.message}`);
        return false;
    }
}

function queueSessionSync() {
    if (!adapter)
        return Promise.resolve();

    syncQueue = syncQueue.then(async () => {
        const snapshot = createSessionSnapshot();
        const serialized = JSON.stringify(snapshot);
        if (serialized === lastSnapshot)
            return;
        if (!snapshot.files['creds.json'])
            return;
        await adapter.save(snapshot);
        lastSnapshot = serialized;
    }).catch((error) => {
        console.error(`[SESSION] Could not save the persistent WhatsApp session: ${error.message}`);
    });
    return syncQueue;
}

export function scheduleSessionSync() {
    if (!adapter)
        return;
    if (syncTimer)
        clearTimeout(syncTimer);
    syncTimer = setTimeout(() => {
        syncTimer = null;
        void queueSessionSync();
    }, 750);
}

export async function flushSessionPersistence() {
    if (syncTimer) {
        clearTimeout(syncTimer);
        syncTimer = null;
    }
    await queueSessionSync();
}

export async function initializeSessionPersistence() {
    return restoreRemoteSession();
}

export async function startSessionPersistence() {
    if (!adapter || persistenceStarted)
        return;
    persistenceStarted = true;
    fs.mkdirSync(SESSION_DIR, { recursive: true });
    watcher = fs.watch(SESSION_DIR, { persistent: false }, () => {
        scheduleSessionSync();
    });
    watcher.on('error', (error) => {
        console.error(`[SESSION] Auth-state watcher stopped: ${error.message}`);
        watcher = null;
    });
    scheduleSessionSync();
}

export async function stopSessionPersistence() {
    if (syncTimer) {
        clearTimeout(syncTimer);
        syncTimer = null;
    }
    if (watcher) {
        watcher.close();
        watcher = null;
    }
    persistenceStarted = false;
    await flushSessionPersistence();
}

export async function clearPersistentSession() {
    if (!adapter)
        return;
    try {
        await adapter.clear();
        lastSnapshot = '';
        console.log(`[SESSION] Removed the saved WhatsApp auth state from ${adapter.name}`);
    }
    catch (error) {
        console.error(`[SESSION] Could not remove the saved WhatsApp session: ${error.message}`);
    }
}

export async function closeSessionPersistence() {
    await stopSessionPersistence();
    if (adapter) {
        await adapter.close().catch(() => { });
        adapter = null;
        adapterPromise = null;
    }
}