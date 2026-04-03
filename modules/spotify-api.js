/**
 * Spotify Web API Module
 * Handles OAuth authentication and playback control
 */

const axios = require('axios');
const http = require('http');
const url = require('url');
const fs = require('fs').promises;
const path = require('path');
const open = require('open');
const { config } = require('../config/config');
const { createModuleLogger } = require('../core/logger');

const log = createModuleLogger('SpotifyAPI');

const SPOTIFY_AUTH_URL = 'https://accounts.spotify.com/authorize';
const SPOTIFY_TOKEN_URL = 'https://accounts.spotify.com/api/token';
const SPOTIFY_API_URL = 'https://api.spotify.com/v1';
const TOKEN_FILE = path.join(__dirname, '..', '.spotify-tokens.json');

const SCOPES = [
    'user-read-playback-state',
    'user-modify-playback-state',
    'user-read-currently-playing',
    'streaming',
    'app-remote-control',
    'playlist-read-private',
    'user-library-read'
].join(' ');

let tokens = null;
let authServer = null;

/**
 * Loads saved tokens from file
 */
async function loadTokens() {
    try {
        const data = await fs.readFile(TOKEN_FILE, 'utf8');
        tokens = JSON.parse(data);
        log.info('Loaded saved Spotify tokens');
        return true;
    } catch (error) {
        log.debug('No saved tokens found');
        return false;
    }
}

/**
 * Saves tokens to file
 */
async function saveTokens() {
    try {
        await fs.writeFile(TOKEN_FILE, JSON.stringify(tokens, null, 2));
        log.debug('Tokens saved');
    } catch (error) {
        log.error(`Failed to save tokens: ${error.message}`);
    }
}

/**
 * Checks if we have valid credentials configured
 */
function isConfigured() {
    return !!(config.spotify.clientId && config.spotify.clientSecret);
}

/**
 * Checks if we're authenticated
 */
function isAuthenticated() {
    return !!(tokens && tokens.access_token);
}

/**
 * Refreshes the access token using refresh token
 */
async function refreshAccessToken() {
    if (!tokens?.refresh_token) {
        throw new Error('No refresh token available');
    }

    try {
        const response = await axios.post(SPOTIFY_TOKEN_URL, 
            new URLSearchParams({
                grant_type: 'refresh_token',
                refresh_token: tokens.refresh_token
            }).toString(),
            {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Authorization': 'Basic ' + Buffer.from(
                        `${config.spotify.clientId}:${config.spotify.clientSecret}`
                    ).toString('base64')
                }
            }
        );

        tokens.access_token = response.data.access_token;
        tokens.expires_at = Date.now() + (response.data.expires_in * 1000);
        
        if (response.data.refresh_token) {
            tokens.refresh_token = response.data.refresh_token;
        }

        await saveTokens();
        log.info('Access token refreshed');
        return true;
    } catch (error) {
        log.error(`Token refresh failed: ${error.message}`);
        tokens = null;
        return false;
    }
}

/**
 * Gets a valid access token, refreshing if needed
 */
async function getAccessToken() {
    if (!tokens?.access_token) {
        throw new Error('Not authenticated. Run spotify auth first.');
    }

    if (tokens.expires_at && Date.now() > tokens.expires_at - 60000) {
        await refreshAccessToken();
    }

    return tokens.access_token;
}

/**
 * Makes an authenticated API request
 */
async function apiRequest(method, endpoint, data = null) {
    const accessToken = await getAccessToken();
    
    try {
        const response = await axios({
            method,
            url: `${SPOTIFY_API_URL}${endpoint}`,
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
            },
            data
        });
        return response.data;
    } catch (error) {
        if (error.response?.status === 401) {
            log.warn('Token expired, refreshing...');
            await refreshAccessToken();
            return apiRequest(method, endpoint, data);
        }
        throw error;
    }
}

/**
 * Starts OAuth authorization flow
 */
async function authorize() {
    if (!isConfigured()) {
        throw new Error('Spotify credentials not configured. Add SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET to .env');
    }

    return new Promise((resolve, reject) => {
        const authUrl = `${SPOTIFY_AUTH_URL}?` + new URLSearchParams({
            client_id: config.spotify.clientId,
            response_type: 'code',
            redirect_uri: config.spotify.redirectUri,
            scope: SCOPES,
            show_dialog: 'true'
        }).toString();

        authServer = http.createServer(async (req, res) => {
            const parsedUrl = url.parse(req.url, true);
            
            if (parsedUrl.pathname === '/spotify-callback') {
                const code = parsedUrl.query.code;
                const error = parsedUrl.query.error;

                if (error) {
                    res.writeHead(400, { 'Content-Type': 'text/html' });
                    res.end('<h1>Authorization Failed</h1><p>You can close this window.</p>');
                    authServer.close();
                    reject(new Error(`Authorization denied: ${error}`));
                    return;
                }

                try {
                    const tokenResponse = await axios.post(SPOTIFY_TOKEN_URL,
                        new URLSearchParams({
                            grant_type: 'authorization_code',
                            code,
                            redirect_uri: config.spotify.redirectUri
                        }).toString(),
                        {
                            headers: {
                                'Content-Type': 'application/x-www-form-urlencoded',
                                'Authorization': 'Basic ' + Buffer.from(
                                    `${config.spotify.clientId}:${config.spotify.clientSecret}`
                                ).toString('base64')
                            }
                        }
                    );

                    tokens = {
                        access_token: tokenResponse.data.access_token,
                        refresh_token: tokenResponse.data.refresh_token,
                        expires_at: Date.now() + (tokenResponse.data.expires_in * 1000)
                    };

                    await saveTokens();

                    res.writeHead(200, { 'Content-Type': 'text/html' });
                    res.end(`
                        <html>
                        <body style="font-family: Arial; text-align: center; padding: 50px; background: #1DB954;">
                            <h1 style="color: white;">✓ Spotify Connected!</h1>
                            <p style="color: white;">You can close this window and return to Jarvis.</p>
                        </body>
                        </html>
                    `);

                    authServer.close();
                    log.info('Spotify authorization successful');
                    resolve(true);
                } catch (tokenError) {
                    res.writeHead(500, { 'Content-Type': 'text/html' });
                    res.end('<h1>Token Exchange Failed</h1>');
                    authServer.close();
                    reject(tokenError);
                }
            }
        });

        const port = new URL(config.spotify.redirectUri).port || 3000;
        authServer.listen(port, () => {
            log.info(`Auth server listening on port ${port}`);
            log.info('Opening browser for Spotify authorization...');
            open(authUrl);
        });

        setTimeout(() => {
            if (authServer.listening) {
                authServer.close();
                reject(new Error('Authorization timeout (2 minutes)'));
            }
        }, 120000);
    });
}

/**
 * Gets available playback devices
 */
async function getDevices() {
    const response = await apiRequest('GET', '/me/player/devices');
    return response.devices || [];
}

/**
 * Gets current playback state
 */
async function getPlaybackState() {
    try {
        const response = await apiRequest('GET', '/me/player');
        return response;
    } catch (error) {
        if (error.response?.status === 204) {
            return null;
        }
        throw error;
    }
}

/**
 * Gets currently playing track
 */
async function getCurrentTrack() {
    try {
        const response = await apiRequest('GET', '/me/player/currently-playing');
        return response;
    } catch (error) {
        if (error.response?.status === 204) {
            return null;
        }
        throw error;
    }
}

/**
 * Starts or resumes playback
 * @param {Object} options - Playback options
 * @param {string} options.context_uri - Spotify URI (album, artist, playlist)
 * @param {Array<string>} options.uris - Array of track URIs
 * @param {string} options.device_id - Target device
 */
async function play(options = {}) {
    const devices = await getDevices();
    
    if (devices.length === 0) {
        throw new Error('No active Spotify devices found. Open Spotify on any device first.');
    }

    const deviceId = options.device_id || devices.find(d => d.is_active)?.id || devices[0].id;
    
    const body = {};
    if (options.context_uri) {
        body.context_uri = options.context_uri;
    }
    if (options.uris) {
        body.uris = options.uris;
    }
    if (options.offset) {
        body.offset = options.offset;
    }

    await apiRequest('PUT', `/me/player/play?device_id=${deviceId}`, Object.keys(body).length ? body : undefined);
    
    log.info('Playback started');
    return { success: true, device_id: deviceId };
}

/**
 * Pauses playback
 */
async function pause() {
    await apiRequest('PUT', '/me/player/pause');
    log.info('Playback paused');
    return { success: true };
}

/**
 * Skips to next track
 */
async function next() {
    await apiRequest('POST', '/me/player/next');
    log.info('Skipped to next track');
    return { success: true };
}

/**
 * Goes to previous track
 */
async function previous() {
    await apiRequest('POST', '/me/player/previous');
    log.info('Went to previous track');
    return { success: true };
}

/**
 * Sets playback volume
 * @param {number} volumePercent - Volume level (0-100)
 */
async function setVolume(volumePercent) {
    const volume = Math.max(0, Math.min(100, volumePercent));
    await apiRequest('PUT', `/me/player/volume?volume_percent=${volume}`);
    log.info(`Volume set to ${volume}%`);
    return { success: true, volume };
}

/**
 * Toggles shuffle mode
 * @param {boolean} state - Shuffle state
 */
async function setShuffle(state) {
    await apiRequest('PUT', `/me/player/shuffle?state=${state}`);
    log.info(`Shuffle ${state ? 'enabled' : 'disabled'}`);
    return { success: true, shuffle: state };
}

/**
 * Sets repeat mode
 * @param {string} state - 'track', 'context', or 'off'
 */
async function setRepeat(state) {
    await apiRequest('PUT', `/me/player/repeat?state=${state}`);
    log.info(`Repeat set to ${state}`);
    return { success: true, repeat: state };
}

/**
 * Searches Spotify
 * @param {string} query - Search query
 * @param {string} type - 'track', 'album', 'artist', 'playlist'
 * @param {number} limit - Result limit
 */
async function search(query, type = 'track', limit = 10) {
    const response = await apiRequest('GET', `/search?q=${encodeURIComponent(query)}&type=${type}&limit=${limit}`);
    return response;
}

/**
 * Plays an artist by URI or search
 * @param {string} artistUri - Spotify artist URI
 */
async function playArtist(artistUri) {
    return play({ context_uri: artistUri });
}

/**
 * Plays a playlist by URI
 * @param {string} playlistUri - Spotify playlist URI
 */
async function playPlaylist(playlistUri) {
    return play({ context_uri: playlistUri });
}

/**
 * Plays a specific track
 * @param {string} trackUri - Spotify track URI
 */
async function playTrack(trackUri) {
    return play({ uris: [trackUri] });
}

/**
 * Converts Spotify URL to URI
 * @param {string} spotifyUrl - Spotify web URL
 * @returns {string} Spotify URI
 */
function urlToUri(spotifyUrl) {
    const match = spotifyUrl.match(/open\.spotify\.com\/(track|album|artist|playlist)\/([a-zA-Z0-9]+)/);
    if (match) {
        return `spotify:${match[1]}:${match[2]}`;
    }
    return null;
}

/**
 * Adds track to queue
 * @param {string} trackUri - Track URI to add
 */
async function addToQueue(trackUri) {
    await apiRequest('POST', `/me/player/queue?uri=${encodeURIComponent(trackUri)}`);
    log.info('Track added to queue');
    return { success: true };
}

/**
 * Initializes the Spotify module
 */
async function initialize() {
    if (!isConfigured()) {
        log.warn('Spotify not configured - add credentials to .env');
        return false;
    }

    const hasTokens = await loadTokens();
    
    if (hasTokens && tokens.refresh_token) {
        try {
            await refreshAccessToken();
            log.info('Spotify API initialized with saved tokens');
            return true;
        } catch (error) {
            log.warn('Saved tokens invalid, re-authorization needed');
            tokens = null;
        }
    }

    return false;
}

module.exports = {
    initialize,
    isConfigured,
    isAuthenticated,
    authorize,
    getDevices,
    getPlaybackState,
    getCurrentTrack,
    play,
    pause,
    next,
    previous,
    setVolume,
    setShuffle,
    setRepeat,
    search,
    playArtist,
    playPlaylist,
    playTrack,
    urlToUri,
    addToQueue
};
