import store from './lightweight_store.js';

const AI_STATE_VERSION = 2;
const DEFAULT_STATE = {
    // Natural AI replies are opt-in for direct messages and groups.
    globalEnabled: false,
    provider: 'auto',
    overrides: {},
    keys: {},
    version: AI_STATE_VERSION
};

const PROVIDERS = new Set(['gemini', 'groq', 'xai']);

function isXaiKey(value) {
    return /^xai-/i.test(String(value || '').trim());
}

function normalizeProvider(provider) {
    const value = String(provider || '').trim().toLowerCase();
    if (value === 'available' || value === 'any')
        return 'auto';
    return value === 'gemini' || value === 'groq' || value === 'xai' ? value : 'auto';
}

function mergeState(saved) {
    const hasSavedState = saved && typeof saved === 'object';
    const needsOptInMigration = hasSavedState && Number(saved.version || 0) < AI_STATE_VERSION;
    return {
        ...DEFAULT_STATE,
        ...(hasSavedState ? saved : {}),
        globalEnabled: needsOptInMigration ? false : Boolean(saved?.globalEnabled),
        version: AI_STATE_VERSION,
        overrides: saved?.overrides && typeof saved.overrides === 'object' ? saved.overrides : {},
        keys: saved?.keys && typeof saved.keys === 'object' ? saved.keys : {}
    };
}

export async function loadAiState() {
    const saved = await store.getSetting('global', 'aiConfig');
    const state = mergeState(saved);
    if (saved && Number(saved.version || 0) < AI_STATE_VERSION)
        await saveAiState(state);
    if (!saved?.provider && process.env.AI_PROVIDER)
        state.provider = normalizeProvider(process.env.AI_PROVIDER);
    return state;
}

async function saveAiState(state) {
    await store.saveSetting('global', 'aiConfig', {
        version: AI_STATE_VERSION,
        globalEnabled: Boolean(state.globalEnabled),
        provider: normalizeProvider(state.provider),
        overrides: state.overrides || {},
        keys: state.keys || {}
    });
}

function getEnvironmentKey(provider) {
    if (provider === 'gemini')
        return process.env.GEMINI_API_KEY?.trim() || '';
    if (provider === 'groq') {
        const key = process.env.GROQ_API_KEY?.trim() || '';
        return isXaiKey(key) ? '' : key;
    }
    if (provider === 'xai') {
        return process.env.XAI_API_KEY?.trim() ||
            (isXaiKey(process.env.GROQ_API_KEY) ? process.env.GROQ_API_KEY.trim() : '');
    }
    return '';
}

export async function getAiKey(provider, state) {
    state = state || await loadAiState();
    const normalized = normalizeProvider(provider);
    const configured = String(state.keys?.[normalized] || '').trim();
    if (normalized === 'groq' && isXaiKey(configured))
        return '';
    if (normalized === 'xai') {
        return getEnvironmentKey(normalized) ||
            configured ||
            (isXaiKey(state.keys?.groq) ? String(state.keys.groq).trim() : '');
    }
    return getEnvironmentKey(normalized) || configured;
}

export async function getAvailableProviders(state) {
    state = state || await loadAiState();
    const available = [];
    for (const provider of PROVIDERS) {
        if (await getAiKey(provider, state))
            available.push(provider);
    }
    return available;
}

export async function resolveAiProvider(state) {
    state = state || await loadAiState();
    const requested = normalizeProvider(state.provider);
    const available = await getAvailableProviders(state);
    if (requested !== 'auto') {
        return available.includes(requested) ? requested : null;
    }
    return available[0] || null;
}

export async function setAiProvider(provider) {
    const state = await loadAiState();
    state.provider = normalizeProvider(provider);
    await saveAiState(state);
    return state;
}

export async function setAiKey(provider, key) {
    const normalized = normalizeProvider(provider);
    if (!PROVIDERS.has(normalized))
        throw new Error('Provider must be gemini, groq, or xai');
    const value = String(key || '').trim();
    if (value.length < 10)
        throw new Error('The API key looks too short');
    const state = await loadAiState();
    state.keys[normalized] = value;
    await saveAiState(state);
    return state;
}

export async function clearAiKey(provider) {
    const normalized = normalizeProvider(provider);
    const state = await loadAiState();
    delete state.keys[normalized];
    if (normalized === 'xai' && isXaiKey(state.keys.groq))
        delete state.keys.groq;
    if (normalized === 'groq' && isXaiKey(state.keys.groq))
        delete state.keys.groq;
    await saveAiState(state);
    return state;
}

export async function setAiChatOverride(chatId, mode) {
    const state = await loadAiState();
    if (mode === null) {
        delete state.overrides[chatId];
    }
    else {
        state.overrides[chatId] = mode === 'on' ? 'on' : 'off';
    }
    await saveAiState(state);
    return state;
}

export async function setAiGlobalEnabled(enabled) {
    const state = await loadAiState();
    state.globalEnabled = Boolean(enabled);
    await saveAiState(state);
    return state;
}

export async function getAiStatus() {
    const state = await loadAiState();
    return {
        globalEnabled: Boolean(state.globalEnabled),
        provider: normalizeProvider(state.provider),
        availableProviders: await getAvailableProviders(state)
    };
}

export async function shouldAiReply(chatId, _isGroup, _legacyEnabled = false) {
    const state = await loadAiState();
    const override = state.overrides?.[chatId];
    if (override === 'on')
        return true;
    if (override === 'off')
        return false;
    return Boolean(state.globalEnabled);
}
