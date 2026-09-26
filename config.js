import 'dotenv/config';
const _prefixes = process.env.PREFIXES ? process.env.PREFIXES.split(',').map((prefix) => prefix.trim()).filter(Boolean) : ['.', '!', '£', '✨️', '👀'];
const config = {
    // Bot Identity
    botName: process.env.BOT_NAME || 'jam-md',
    botOwner: process.env.BOT_OWNER || 'Jaiton',
    ownerNumber: process.env.OWNER_NUMBER || '923051391007',
    author: process.env.AUTHOR || 'Jaiton',
    packname: process.env.PACKNAME || 'jam-md',
    description: process.env.DESCRIPTION || 'High performance multi-device WhatsApp bot',
    version: '6.0.0',
    // Bot Config
    prefixes: _prefixes,
    prefix: _prefixes[0],
    commandMode: process.env.COMMAND_MODE || 'public',
    timeZone: process.env.TIMEZONE || 'Asia/Karachi',
    // Links
    channelLink: process.env.CHANNEL_LINK || '',
    updateZipUrl: process.env.UPDATE_URL || 'https://github.com/realjumason-md/jam-md/archive/refs/heads/main.zip',
    ytChannel: process.env.YT_CHANNEL || 'jam-md',
    // Session
    sessionId: process.env.SESSION_ID || '',
    // Performance
    port: Number(process.env.PORT) || 5000,
    maxStoreMessages: Number(process.env.MAX_STORE_MESSAGES) || 20,
    tempCleanupInterval: Number(process.env.CLEANUP_INTERVAL) || 1 * 60 * 60 * 1000,
    storeWriteInterval: Number(process.env.STORE_WRITE_INTERVAL) || 10000,
    // API Keys
    // Never ship third-party credentials in the repository. Set these in the
    // deployment environment instead.
    giphyApiKey: process.env.GIPHY_API_KEY || '',
    removeBgKey: process.env.REMOVEBG_KEY || '',
    geminiApiKey: process.env.GEMINI_API_KEY || '',
    groqApiKey: process.env.GROQ_API_KEY || '',
    xaiApiKey: process.env.XAI_API_KEY || '',
    aiProvider: process.env.AI_PROVIDER || 'auto',
    tenorApiKey: process.env.TENOR_API_KEY || '',
    weatherApiKey: process.env.WEATHER_API_KEY || '',
    newsApiKey: process.env.NEWS_API_KEY || '',
    freeimageApiKey: process.env.FREEIMAGE_API_KEY || '',
    acrcloud: {
        host: process.env.ACRCLOUD_HOST || 'identify-eu-west-1.acrcloud.com',
        accessKey: process.env.ACRCLOUD_ACCESS_KEY || '',
        accessSecret: process.env.ACRCLOUD_ACCESS_SECRET || ''
    },
    // Warn system
    warnCount: 3,
    // External APIs
    APIs: {
        xteam: 'https://api.xteam.xyz',
        dzx: 'https://api.dhamzxploit.my.id',
        lol: 'https://api.lolhuman.xyz',
        violetics: 'https://violetics.pw',
        neoxr: 'https://api.neoxr.my.id',
        zenzapis: 'https://zenzapis.xyz',
        akuari: 'https://api.akuari.my.id',
        akuari2: 'https://apimu.my.id',
        nrtm: 'https://fg-nrtm.ddns.net',
        fgmods: 'https://api-fgmods.ddns.net'
    },
    APIKeys: {
        'https://api.xteam.xyz': process.env.XTEAM_API_KEY || '',
        'https://api.lolhuman.xyz': process.env.LOLHUMAN_API_KEY || '',
        'https://api.neoxr.my.id': process.env.NEOXR_KEY || '',
        'https://violetics.pw': process.env.VIOLETICS_API_KEY || '',
        'https://zenzapis.xyz': process.env.ZENZAPIS_KEY || '',
        'https://api-fgmods.ddns.net': process.env.FGMODS_API_KEY || ''
    }
};
export default config;
