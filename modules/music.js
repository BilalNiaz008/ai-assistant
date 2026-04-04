/**
 * Music Module
 * Handles music playback via Spotify API or local files
 */

const open = require('open');
const { exec } = require('child_process');
const path = require('path');
const fs = require('fs').promises;
const { config } = require('../config/config');
const { createModuleLogger } = require('../core/logger');
const { registry } = require('../core/action-registry');
const spotifyApi = require('./spotify-api');

const log = createModuleLogger('Music');

// Music player state
let currentPlayer = null;
let isPlaying = false;

/**
 * Waits for Spotify to load, then triggers playback via media keys
 * Used as fallback when Spotify API is not authenticated
 */
async function triggerPlayback() {
    // Wait for Spotify app to fully load the track
    await new Promise(resolve => setTimeout(resolve, 1500));
    
    if (process.platform === 'win32') {
        // Send media play key on Windows using PowerShell
        // Character 179 is the Play/Pause media key
        return new Promise((resolve) => {
            exec('powershell -c "(New-Object -ComObject WScript.Shell).SendKeys([char]179)"', (error) => {
                if (error) {
                    log.debug(`Play trigger error: ${error.message}`);
                }
                resolve();
            });
        });
    } else if (process.platform === 'darwin') {
        // macOS: Use AppleScript to tell Spotify to play
        return new Promise((resolve) => {
            exec('osascript -e "tell application \\"Spotify\\" to play"', (error) => {
                if (error) {
                    log.debug(`Play trigger error: ${error.message}`);
                }
                resolve();
            });
        });
    } else {
        // Linux: Try dbus or playerctl
        return new Promise((resolve) => {
            exec('playerctl play || dbus-send --print-reply --dest=org.mpris.MediaPlayer2.spotify /org/mpris/MediaPlayer2 org.mpris.MediaPlayer2.Player.Play', (error) => {
                if (error) {
                    log.debug(`Play trigger error: ${error.message}`);
                }
                resolve();
            });
        });
    }
}

/**
 * Plays music via Spotify Web API with actual playback control
 * @param {Object} options - Playback options
 * @param {string} options.uri - Spotify URI (playlist, track, album, artist)
 * @param {string} options.url - Spotify URL (will be converted to URI)
 * @param {boolean} options.shuffle - Enable shuffle
 * @returns {Promise<Object>} Playback result
 */
async function playSpotify(options = {}) {
    let uri = options.uri || config.spotify.defaultPlaylist;
    
    // Convert URL to URI if provided
    if (options.url) {
        uri = spotifyApi.urlToUri(options.url);
        if (!uri) {
            throw new Error('Invalid Spotify URL');
        }
    }

    try {
        // Check if Spotify API is authenticated
        if (spotifyApi.isAuthenticated()) {
            log.info('Starting Spotify playback via API...');
            
            // Determine content type and play
            if (uri) {
                const uriParts = uri.split(':');
                const type = uriParts[1]; // track, album, artist, playlist
                
                if (type === 'track') {
                    await spotifyApi.playTrack(uri);
                } else {
                    await spotifyApi.play({ context_uri: uri });
                }

                // Enable shuffle if requested
                if (options.shuffle) {
                    await spotifyApi.setShuffle(true);
                }

                log.info(`Playing via Spotify API: ${uri}`);
            } else {
                // Resume playback
                await spotifyApi.play();
                log.info('Resumed Spotify playback');
            }

            isPlaying = true;
            currentPlayer = 'spotify-api';

            // Get current track info
            const currentTrack = await spotifyApi.getCurrentTrack();
            const trackInfo = currentTrack?.item ? {
                name: currentTrack.item.name,
                artist: currentTrack.item.artists?.map(a => a.name).join(', '),
                album: currentTrack.item.album?.name
            } : null;

            return {
                success: true,
                player: 'spotify-api',
                uri,
                track: trackInfo,
                message: trackInfo 
                    ? `Now playing: ${trackInfo.name} by ${trackInfo.artist}`
                    : 'Spotify playback started'
            };
        }

        // Fallback: Open Spotify app with URI and trigger playback
        log.info('Spotify API not authenticated, opening app with auto-play...');
        
        if (uri) {
            await open(uri);
            log.info(`Opened Spotify with URI: ${uri}`);
            
            // Wait for Spotify to load, then send play command via media keys
            await triggerPlayback();
        } else {
            await open('spotify:');
            log.info('Opened Spotify app');
        }

        isPlaying = true;
        currentPlayer = 'spotify';

        return {
            success: true,
            player: 'spotify',
            uri,
            message: 'Spotify opened and playback started (authenticate for full control)',
            needsAuth: true
        };
    } catch (error) {
        log.error(`Failed to start Spotify: ${error.message}`);
        
        // If API fails due to no device, try opening the app and trigger playback
        if (error.message.includes('No active Spotify devices')) {
            log.info('No active devices, opening Spotify app with auto-play...');
            await open(uri || 'spotify:');
            
            if (uri) {
                await triggerPlayback();
            }
            
            return {
                success: true,
                player: 'spotify',
                uri,
                message: 'Opened Spotify and triggered playback',
                needsDevice: true
            };
        }
        
        throw error;
    }
}

/**
 * Plays a local audio file
 * @param {Object} options - Playback options
 * @param {string} options.filePath - Path to audio file
 * @returns {Promise<Object>} Playback result
 */
async function playLocalFile(options = {}) {
    const filePath = options.filePath || config.music.localPath;
    
    if (!filePath) {
        throw new Error('No music file path specified');
    }

    try {
        // Check if file exists
        await fs.access(filePath);
        
        log.info(`Playing local file: ${filePath}`);

        // Platform-specific playback
        const platform = process.platform;
        
        if (platform === 'win32') {
            // Windows: Use default media player
            exec(`start "" "${filePath}"`, (error) => {
                if (error) {
                    log.error(`Playback error: ${error.message}`);
                }
            });
        } else if (platform === 'darwin') {
            // macOS: Use afplay or open
            exec(`open "${filePath}"`, (error) => {
                if (error) {
                    log.error(`Playback error: ${error.message}`);
                }
            });
        } else {
            // Linux: Try common players
            exec(`xdg-open "${filePath}" || mpv "${filePath}" || vlc "${filePath}"`, (error) => {
                if (error) {
                    log.error(`Playback error: ${error.message}`);
                }
            });
        }

        isPlaying = true;
        currentPlayer = 'local';

        return {
            success: true,
            player: 'local',
            filePath,
            message: `Playing: ${path.basename(filePath)}`
        };
    } catch (error) {
        log.error(`Failed to play local file: ${error.message}`);
        throw error;
    }
}

/**
 * Plays music with automatic fallback
 * Tries Spotify first, falls back to local file
 * @param {Object} options - Playback options
 * @returns {Promise<Object>} Playback result
 */
async function playMusic(options = {}) {
    const preferLocal = options.preferLocal || false;
    
    try {
        if (preferLocal && config.music.localPath) {
            return await playLocalFile(options);
        }

        // Try Spotify first
        if (config.spotify.defaultPlaylist || config.spotify.clientId) {
            try {
                return await playSpotify(options);
            } catch (spotifyError) {
                log.warn(`Spotify failed, trying local fallback: ${spotifyError.message}`);
            }
        }

        // Fallback to local file
        if (config.music.localPath) {
            return await playLocalFile(options);
        }

        throw new Error('No music source configured');
    } catch (error) {
        log.error(`Music playback failed: ${error.message}`);
        return {
            success: false,
            error: error.message
        };
    }
}

/**
 * Pauses/stops music playback
 * Uses Spotify API if authenticated, otherwise falls back to media keys
 * @returns {Promise<Object>} Result
 */
async function pauseMusic() {
    try {
        log.info('Pausing music...');
        
        // Try Spotify API first
        if (spotifyApi.isAuthenticated()) {
            await spotifyApi.pause();
            isPlaying = false;
            return { success: true, message: 'Playback paused' };
        }
        
        // Fallback to media keys
        if (process.platform === 'win32') {
            exec('powershell -c "(New-Object -ComObject WScript.Shell).SendKeys([char]179)"', (error) => {
                if (error) {
                    log.error(`Pause error: ${error.message}`);
                }
            });
        } else if (process.platform === 'darwin') {
            exec('osascript -e "tell application \\"Spotify\\" to pause"', (error) => {
                if (error) {
                    log.debug(`Spotify pause error: ${error.message}`);
                }
            });
        }

        isPlaying = false;
        return { success: true, message: 'Playback paused' };
    } catch (error) {
        log.error(`Failed to pause: ${error.message}`);
        return { success: false, error: error.message };
    }
}

/**
 * Resumes music playback
 * @returns {Promise<Object>} Result
 */
async function resumeMusic() {
    try {
        log.info('Resuming music...');
        
        if (spotifyApi.isAuthenticated()) {
            await spotifyApi.play();
            isPlaying = true;
            
            const currentTrack = await spotifyApi.getCurrentTrack();
            const trackName = currentTrack?.item?.name;
            
            return { 
                success: true, 
                message: trackName ? `Resumed: ${trackName}` : 'Playback resumed'
            };
        }
        
        // Fallback to media keys
        if (process.platform === 'win32') {
            exec('powershell -c "(New-Object -ComObject WScript.Shell).SendKeys([char]179)"', (error) => {
                if (error) {
                    log.error(`Resume error: ${error.message}`);
                }
            });
        }

        isPlaying = true;
        return { success: true, message: 'Playback resumed' };
    } catch (error) {
        log.error(`Failed to resume: ${error.message}`);
        return { success: false, error: error.message };
    }
}

/**
 * Skips to next track
 * @returns {Promise<Object>} Result
 */
async function nextTrack() {
    try {
        log.info('Skipping to next track...');
        
        // Try Spotify API first
        if (spotifyApi.isAuthenticated()) {
            await spotifyApi.next();
            
            // Wait briefly and get new track info
            await new Promise(resolve => setTimeout(resolve, 300));
            const currentTrack = await spotifyApi.getCurrentTrack();
            const trackInfo = currentTrack?.item ? {
                name: currentTrack.item.name,
                artist: currentTrack.item.artists?.map(a => a.name).join(', ')
            } : null;

            return { 
                success: true, 
                message: trackInfo 
                    ? `Now playing: ${trackInfo.name} by ${trackInfo.artist}`
                    : 'Skipped to next track',
                track: trackInfo
            };
        }
        
        // Fallback to media keys
        if (process.platform === 'win32') {
            exec('powershell -c "(New-Object -ComObject WScript.Shell).SendKeys([char]176)"', (error) => {
                if (error) {
                    log.error(`Next track error: ${error.message}`);
                }
            });
        } else if (process.platform === 'darwin') {
            exec('osascript -e "tell application \\"Spotify\\" to next track"', (error) => {
                if (error) {
                    log.debug(`Spotify next error: ${error.message}`);
                }
            });
        }

        return { success: true, message: 'Skipped to next track' };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

/**
 * Goes to previous track
 * @returns {Promise<Object>} Result
 */
async function previousTrack() {
    try {
        log.info('Going to previous track...');
        
        if (spotifyApi.isAuthenticated()) {
            await spotifyApi.previous();
            
            await new Promise(resolve => setTimeout(resolve, 300));
            const currentTrack = await spotifyApi.getCurrentTrack();
            const trackInfo = currentTrack?.item ? {
                name: currentTrack.item.name,
                artist: currentTrack.item.artists?.map(a => a.name).join(', ')
            } : null;

            return { 
                success: true, 
                message: trackInfo 
                    ? `Now playing: ${trackInfo.name} by ${trackInfo.artist}`
                    : 'Went to previous track',
                track: trackInfo
            };
        }
        
        // Fallback to media keys
        if (process.platform === 'win32') {
            exec('powershell -c "(New-Object -ComObject WScript.Shell).SendKeys([char]177)"', (error) => {
                if (error) {
                    log.error(`Previous track error: ${error.message}`);
                }
            });
        }

        return { success: true, message: 'Went to previous track' };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

/**
 * Sets volume level
 * @param {number} level - Volume level (0-100)
 * @returns {Promise<Object>} Result
 */
async function setVolume(level) {
    try {
        if (spotifyApi.isAuthenticated()) {
            await spotifyApi.setVolume(level);
            return { success: true, message: `Volume set to ${level}%` };
        }
        return { success: false, error: 'Spotify API not authenticated' };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

/**
 * Searches Spotify and plays first result
 * @param {string} query - Search query
 * @param {string} type - 'track', 'artist', 'album', 'playlist'
 * @returns {Promise<Object>} Result
 */
async function searchAndPlay(query, type = 'track') {
    try {
        if (!spotifyApi.isAuthenticated()) {
            throw new Error('Spotify API not authenticated. Run spotify auth first.');
        }

        log.info(`Searching for ${type}: ${query}`);
        const results = await spotifyApi.search(query, type, 1);
        
        const items = results[`${type}s`]?.items;
        if (!items || items.length === 0) {
            return { success: false, error: `No ${type} found for: ${query}` };
        }

        const item = items[0];
        const uri = item.uri;

        if (type === 'track') {
            await spotifyApi.playTrack(uri);
        } else {
            await spotifyApi.play({ context_uri: uri });
        }

        isPlaying = true;
        currentPlayer = 'spotify-api';

        return {
            success: true,
            type,
            name: item.name,
            artist: item.artists?.map(a => a.name).join(', ') || item.owner?.display_name,
            uri,
            message: `Now playing: ${item.name}`
        };
    } catch (error) {
        log.error(`Search and play failed: ${error.message}`);
        return { success: false, error: error.message };
    }
}

/**
 * Authenticates with Spotify API
 * @returns {Promise<Object>} Result
 */
async function authenticateSpotify() {
    try {
        if (!spotifyApi.isConfigured()) {
            return { 
                success: false, 
                error: 'Spotify not configured. Add SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET to .env'
            };
        }

        if (spotifyApi.isAuthenticated()) {
            return { success: true, message: 'Already authenticated with Spotify' };
        }

        log.info('Starting Spotify authorization...');
        await spotifyApi.authorize();
        
        return { success: true, message: 'Successfully authenticated with Spotify!' };
    } catch (error) {
        log.error(`Spotify auth failed: ${error.message}`);
        return { success: false, error: error.message };
    }
}

/**
 * Gets current playback status
 * @returns {Promise<Object>} Playback status
 */
async function getStatus() {
    const status = {
        isPlaying,
        currentPlayer,
        spotifyConfigured: spotifyApi.isConfigured(),
        spotifyAuthenticated: spotifyApi.isAuthenticated(),
        localFileConfigured: !!config.music.localPath
    };

    // Get detailed info from Spotify API if authenticated
    if (spotifyApi.isAuthenticated()) {
        try {
            const playbackState = await spotifyApi.getPlaybackState();
            if (playbackState) {
                status.isPlaying = playbackState.is_playing;
                status.device = playbackState.device?.name;
                status.volume = playbackState.device?.volume_percent;
                status.shuffle = playbackState.shuffle_state;
                status.repeat = playbackState.repeat_state;
                
                if (playbackState.item) {
                    status.currentTrack = {
                        name: playbackState.item.name,
                        artist: playbackState.item.artists?.map(a => a.name).join(', '),
                        album: playbackState.item.album?.name,
                        duration: playbackState.item.duration_ms,
                        progress: playbackState.progress_ms
                    };
                }
            }
        } catch (error) {
            log.debug(`Could not get Spotify status: ${error.message}`);
        }
    }

    return status;
}

/**
 * Gets recommended morning playlists
 * @returns {Array<Object>} Playlist suggestions
 */
function getMorningPlaylists() {
    return [
        { name: 'Morning Motivation', uri: 'spotify:playlist:37i9dQZF1DX0UrRvztWcAU' },
        { name: 'Peaceful Morning', uri: 'spotify:playlist:37i9dQZF1DX6ziVCJnEm59' },
        { name: 'Morning Commute', uri: 'spotify:playlist:37i9dQZF1DWWEJlAGA9gs0' },
        { name: 'Wake Up Happy', uri: 'spotify:playlist:37i9dQZF1DX0BcQWzuB7ZO' },
        { name: 'Jazz for Work', uri: 'spotify:playlist:37i9dQZF1DX0SM0LYsmbMT' }
    ];
}

// Register actions
function registerActions() {
    registry.register('play_music', {
        handler: async (params) => {
            return await playMusic(params);
        },
        description: 'Play music via Spotify or local file',
        category: 'entertainment',
        triggers: ['play music', 'music', 'spotify', 'songs', 'playlist', 'tunes'],
        parameters: {
            uri: { type: 'string', description: 'Spotify URI (optional)' },
            url: { type: 'string', description: 'Spotify URL (optional)' },
            preferLocal: { type: 'boolean', description: 'Prefer local file over Spotify' }
        }
    });

    registry.register('play_spotify', {
        handler: async (params) => {
            return await playSpotify(params);
        },
        description: 'Play music on Spotify',
        category: 'entertainment',
        triggers: ['spotify', 'open spotify', 'play spotify'],
        parameters: {
            uri: { type: 'string', description: 'Spotify URI' },
            url: { type: 'string', description: 'Spotify URL' }
        }
    });

    registry.register('pause_music', {
        handler: async () => {
            return await pauseMusic();
        },
        description: 'Pause music playback',
        category: 'entertainment',
        triggers: ['pause', 'stop music', 'pause music', 'quiet']
    });

    registry.register('resume_music', {
        handler: async () => {
            return await resumeMusic();
        },
        description: 'Resume music playback',
        category: 'entertainment',
        triggers: ['resume', 'play', 'continue', 'unpause']
    });

    registry.register('next_track', {
        handler: async () => {
            return await nextTrack();
        },
        description: 'Skip to next track',
        category: 'entertainment',
        triggers: ['next', 'skip', 'next song', 'next track']
    });

    registry.register('previous_track', {
        handler: async () => {
            return await previousTrack();
        },
        description: 'Go to previous track',
        category: 'entertainment',
        triggers: ['previous', 'back', 'previous song', 'previous track']
    });

    registry.register('set_volume', {
        handler: async (params) => {
            return await setVolume(params.level || 50);
        },
        description: 'Set music volume',
        category: 'entertainment',
        triggers: ['volume', 'set volume', 'louder', 'quieter'],
        parameters: {
            level: { type: 'number', description: 'Volume level 0-100' }
        }
    });

    registry.register('search_play', {
        handler: async (params) => {
            return await searchAndPlay(params.query, params.type || 'track');
        },
        description: 'Search and play music on Spotify',
        category: 'entertainment',
        triggers: ['search music', 'find song', 'play song'],
        parameters: {
            query: { type: 'string', description: 'Search query', required: true },
            type: { type: 'string', description: 'track, artist, album, or playlist' }
        }
    });

    registry.register('music_status', {
        handler: async () => {
            return await getStatus();
        },
        description: 'Get music playback status',
        category: 'entertainment',
        triggers: ['music status', 'what\'s playing', 'now playing']
    });

    registry.register('spotify_auth', {
        handler: async () => {
            return await authenticateSpotify();
        },
        description: 'Authenticate with Spotify',
        category: 'entertainment',
        triggers: ['spotify auth', 'connect spotify', 'login spotify', 'authenticate spotify']
    });

    log.info('Music actions registered');
}

/**
 * Initializes the music module
 */
async function initializeMusic() {
    await spotifyApi.initialize();
    registerActions();
}

module.exports = {
    playMusic,
    playSpotify,
    playLocalFile,
    pauseMusic,
    resumeMusic,
    nextTrack,
    previousTrack,
    setVolume,
    searchAndPlay,
    authenticateSpotify,
    getStatus,
    getMorningPlaylists,
    registerActions,
    initializeMusic
};
