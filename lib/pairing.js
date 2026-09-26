import { parsePhoneNumber } from 'awesome-phonenumber';

const MIN_PHONE_DIGITS = 10;
const MAX_PHONE_DIGITS = 15;

export function normalizePhoneNumber(value) {
    const number = String(value ?? '').replace(/\D/g, '');
    if (!new RegExp(`^[1-9]\\d{${MIN_PHONE_DIGITS - 1},${MAX_PHONE_DIGITS - 1}}$`).test(number)) {
        return '';
    }

    const parsed = parsePhoneNumber(`+${number}`);
    return parsed.valid ? number : '';
}

export function formatPairingCode(value) {
    const code = String(value ?? '').replace(/[\s-]/g, '');
    if (!/^[a-z0-9]+$/i.test(code)) {
        return '';
    }
    return code.match(/.{1,4}/g)?.join('-') || '';
}