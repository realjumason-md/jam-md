import store from './lightweight_store.js';

const DEFAULT_STATE = {
    globalEnabled: false,
    provider: 'auto',
    overrides: {},
    keys: {}
};

const PROVIDERS = new Set(['gemini', 'groq']);

function normalizeProvider(provider) {
    const value = String(provider || '').trim().toLowerCase();
    if (value === 'available' || value === 'any')
        return 'auto';
    return value === 'gemini' || value === 'groq' ? value : 'auto';
}

function mergeState(saved) {
    return {
        ...DEFAULT_STATE,
        ...(saved && typeof saved === 'object' ? saved : {}),
        overrides: saved?.overrides && typeof saved.overrides === 'object' ? saved.overrides : {},
        keys: saved?.keys && typeof saved.keys === 'object' ? saved.keys : {}
    };
}

export async function loadAiState() {
    const saved = await store.getSetting('global', 'aiConfig');
    const state = mergeState(saved);
    if (!saved?.provider && process.env.AI_PROVIDER)
        state.provider = normalizeProvider(process.env.AI_PROVIDER);
    return state;
}

async function saveAiState(state) {
    await store.saveSetting('global', 'aiConfig', {
        globalEnabled: Boolean(state.globalEnabled),
        provider: normalizeProvider(state.provider),
        overrides: state.overrides || {},
        keys: state.keys || {}
    });
}

function getEnvironmentKey(provider) {
    if (provider === 'gemini')
        return process.env.GEMINI_API_KEY?.trim() || '';
    if (provider === 'groq')
        return process.env.GROQ_API_KEY?.trim() || '';
    return '';
}

export async function getAiKey(provider, state) {
    state = state || await loadAiState();
    const normalized = normalizeProvider(provider);
    return getEnvironmentKey(normalized) || String(state.keys?.[normalized] || '').trim();
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
        throw new Error('Provider must be gemini or groq');
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

export async function shouldAiReply(chatId, isGroup, legacyEnabled = false) {
    const state = await loadAiState();
    const override = state.overrides?.[chatId];
    if (override === 'on')
        return true;
    if (override === 'off')
        return false;
    if (legacyEnabled)
        return true;
    return Boolean(state.globalEnabled && !isGroup);
}
