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
        defaultPlaylist: process.env.SPOTIFY_DEFAULT_PLAYLIST
    },

    // Local music settings
    music: {
        localPath: process.env.LOCAL_MUSIC_PATH
    },

    // Feature flags
    features: {
        weather: process.env.ENABLE_WEATHER !== 'false',
        email: process.env.ENABLE_EMAIL !== 'false',
        music: process.env.ENABLE_MUSIC !== 'false',
        aiSummary: process.env.ENABLE_AI_SUMMARY !== 'false',
        decisionEngine: process.env.ENABLE_DECISION_ENGINE !== 'false'
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
