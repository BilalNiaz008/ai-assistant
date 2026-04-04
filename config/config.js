/**
 * Configuration Module
 * Centralizes all configuration with validation and defaults
 */

require('dotenv').config();

const config = {
    // User settings
    user: {
        name: process.env.USER_NAME || 'User',
        timezone: process.env.USER_TIMEZONE || 'UTC',
        location: process.env.USER_LOCATION || 'London,UK'
    },

    // AI Provider settings
    ai: {
        provider: process.env.AI_PROVIDER || 'OPENAI',
        openai: {
            apiKey: process.env.OPENAI_API_KEY,
            model: process.env.OPENAI_MODEL || 'gpt-4-turbo-preview'
        },
        anthropic: {
            apiKey: process.env.ANTHROPIC_API_KEY,
            model: process.env.ANTHROPIC_MODEL || 'claude-3-opus-20240229'
        }
    },

    // Weather settings
    weather: {
        apiKey: process.env.OPENWEATHER_API_KEY,
        units: process.env.WEATHER_UNITS || 'metric',
        baseUrl: 'https://api.openweathermap.org/data/2.5'
    },

    // Gmail settings
    gmail: {
        clientId: process.env.GMAIL_CLIENT_ID,
        clientSecret: process.env.GMAIL_CLIENT_SECRET,
        redirectUri: process.env.GMAIL_REDIRECT_URI || 'http://localhost:3000/oauth2callback',
        scopes: ['https://www.googleapis.com/auth/gmail.readonly']
    },

    // Spotify settings
    spotify: {
        clientId: process.env.SPOTIFY_CLIENT_ID,
        clientSecret: process.env.SPOTIFY_CLIENT_SECRET,
        redirectUri: process.env.SPOTIFY_REDIRECT_URI || 'http://localhost:3000/spotify-callback',
        defaultPlaylist: process.env.SPOTIFY_DEFAULT_PLAYLIST || 'spotify:album:6mUdeDZCsExyJLMdAfDuwh',
        /** 0–100; applied via Web API when Jarvis starts playback (Premium + active device) */
        playbackVolumePercent: Math.min(
            100,
            Math.max(0, parseInt(process.env.SPOTIFY_PLAYBACK_VOLUME, 10) || 28)
        ),
        setVolumeOnPlay: process.env.SPOTIFY_SET_VOLUME_ON_PLAY !== 'false'
    },

    // Assistant TTS / playback loudness (separate from Spotify)
    voice: {
        /** Windows SAPI 0–100 */
        sapiVolume: Math.min(
            100,
            Math.max(0, parseInt(process.env.VOICE_SAPI_VOLUME, 10) || 100)
        ),
        /** WPF MediaPlayer 0–100 → 0.0–1.0 (OpenAI MP3 path on Windows) */
        playerVolumePercent: Math.min(
            100,
            Math.max(0, parseInt(process.env.VOICE_PLAYER_VOLUME, 10) || 100)
        ),
        /** Linear gain for ffplay when playing TTS MP3 (1 = normal, 1.5 ≈ +3.5 dB) */
        mp3Gain: Math.min(
            3,
            Math.max(0.25, parseFloat(process.env.VOICE_MP3_GAIN) || 1.45)
        )
    },

    // Local music settings
    music: {
        localPath: process.env.LOCAL_MUSIC_PATH
    },

    // Browser (Chrome → Basecamp, etc.)
    browser: {
        /** Your team Basecamp home or project URL */
        basecampUrl: (process.env.BASECAMP_URL || '').trim(),
        /** Optional full path to chrome.exe if not auto-detected */
        chromePath: (process.env.CHROME_PATH || '').trim()
    },

    // Feature flags
    features: {
        weather: process.env.ENABLE_WEATHER !== 'false',
        email: process.env.ENABLE_EMAIL !== 'false',
        music: process.env.ENABLE_MUSIC !== 'false',
        aiSummary: process.env.ENABLE_AI_SUMMARY !== 'false',
        decisionEngine: process.env.ENABLE_DECISION_ENGINE !== 'false',
        /** Open Basecamp in Chrome during assistant startup (npm start / npm run dev) */
        openBasecampOnStartup: process.env.OPEN_BASECAMP_ON_STARTUP !== 'false'
    },

    // Server settings
    server: {
        port: parseInt(process.env.SERVER_PORT, 10) || 3000
    },

    // Logging
    logging: {
        level: process.env.LOG_LEVEL || 'info',
        toFile: process.env.LOG_TO_FILE === 'true'
    }
};

/**
 * Validates required configuration
 * @returns {Object} Validation result with isValid flag and missing keys
 */
function validateConfig() {
    const missing = [];
    const warnings = [];

    // Check AI configuration
    if (config.ai.provider === 'OPENAI' && !config.ai.openai.apiKey) {
        missing.push('OPENAI_API_KEY');
    }
    if (config.ai.provider === 'ANTHROPIC' && !config.ai.anthropic.apiKey) {
        missing.push('ANTHROPIC_API_KEY');
    }

    // Check weather (warn if missing)
    if (config.features.weather && !config.weather.apiKey) {
        warnings.push('OPENWEATHER_API_KEY (weather feature will be disabled)');
        config.features.weather = false;
    }

    // Check Gmail (warn if missing)
    if (config.features.email && (!config.gmail.clientId || !config.gmail.clientSecret)) {
        warnings.push('GMAIL_CLIENT_ID/GMAIL_CLIENT_SECRET (email feature will be disabled)');
        config.features.email = false;
    }

    return {
        isValid: missing.length === 0,
        missing,
        warnings
    };
}

/**
 * Gets the time of day for greeting
 * @returns {string} 'morning', 'afternoon', 'evening', or 'night'
 */
function getTimeOfDay() {
    const hour = new Date().getHours();
    if (hour >= 5 && hour < 12) return 'morning';
    if (hour >= 12 && hour < 17) return 'afternoon';
    if (hour >= 17 && hour < 21) return 'evening';
    return 'night';
}

module.exports = {
    config,
    validateConfig,
    getTimeOfDay
};
