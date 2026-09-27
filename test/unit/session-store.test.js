import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import { createSessionSnapshot, restoreSessionSnapshot } from '../../lib/session-store.js';

const temporaryDirectories = [];

function makeTemporaryDirectory() {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'jam-md-session-'));
    temporaryDirectories.push(directory);
    return directory;
}

afterEach(() => {
    while (temporaryDirectories.length > 0) {
        fs.rmSync(temporaryDirectories.pop(), { recursive: true, force: true });
    }
});

describe('persistent WhatsApp session snapshots', () => {
    it('captures every auth file as portable data', () => {
        const source = makeTemporaryDirectory();
        fs.mkdirSync(path.join(source, 'nested'), { recursive: true });
        fs.writeFileSync(path.join(source, 'creds.json'), '{"registered":true}');
        fs.writeFileSync(path.join(source, 'nested', 'app-state.json'), 'key data');
        fs.writeFileSync(path.join(source, '.reset-required'), 'do not persist');

        const snapshot = createSessionSnapshot(source);

        expect(Object.keys(snapshot.files).sort()).toEqual([
            'creds.json',
            path.join('nested', 'app-state.json')
        ].sort());
        expect(Buffer.from(snapshot.files['creds.json'], 'base64').toString()).toBe('{"registered":true}');
    });

    it('restores the snapshot without allowing path traversal', () => {
        const source = makeTemporaryDirectory();
        const restored = makeTemporaryDirectory();
        fs.writeFileSync(path.join(source, 'creds.json'), 'credentials');
        fs.writeFileSync(path.join(source, 'keys.json'), 'keys');

        restoreSessionSnapshot(createSessionSnapshot(source), restored);

        expect(fs.readFileSync(path.join(restored, 'creds.json'), 'utf8')).toBe('credentials');
        expect(fs.readFileSync(path.join(restored, 'keys.json'), 'utf8')).toBe('keys');
        expect(() => restoreSessionSnapshot({
            version: 1,
            files: { '../outside.txt': Buffer.from('bad').toString('base64') }
        }, restored)).toThrow('unsafe file path');
    });
});