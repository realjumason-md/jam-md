import { describe, expect, it } from 'vitest';
import { formatPairingCode, normalizePhoneNumber } from '../../lib/pairing.js';

describe('pairing helpers', () => {
    it('normalizes a valid Uganda number', () => {
        expect(normalizePhoneNumber('256 765 309986')).toBe('256765309986');
    });

    it('rejects malformed phone numbers', () => {
        expect(normalizePhoneNumber('123')).toBe('');
        expect(normalizePhoneNumber('+000123456789')).toBe('');
    });

    it('formats pairing codes for WhatsApp', () => {
        expect(formatPairingCode('J38K4PNS')).toBe('J38K-4PNS');
        expect(formatPairingCode('J38K-4PNS')).toBe('J38K-4PNS');
    });

    it('does not return unsafe pairing code content', () => {
        expect(formatPairingCode('<script>')).toBe('');
        expect(formatPairingCode('')).toBe('');
    });
});