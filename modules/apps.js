/**
 * Apps Module
 * Handles opening applications, browsers, and URLs
 */

const { exec } = require('child_process');
const open = require('open');
const { createModuleLogger } = require('../core/logger');
const { registry } = require('../core/action-registry');

const log = createModuleLogger('Apps');

// Predefined apps and their paths/commands for Windows
const APP_COMMANDS = {
    chrome: {
        win32: 'start chrome',
        darwin: 'open -a "Google Chrome"',
        linux: 'google-chrome'
    },
    firefox: {
        win32: 'start firefox',
        darwin: 'open -a "Firefox"',
        linux: 'firefox'
    },
    edge: {
        win32: 'start msedge',
        darwin: 'open -a "Microsoft Edge"',
        linux: 'microsoft-edge'
    },
    notepad: {
        win32: 'notepad',
        darwin: 'open -a "TextEdit"',
        linux: 'gedit'
    },
    vscode: {
        win32: 'code',
        darwin: 'code',
        linux: 'code'
    },
    terminal: {
        win32: 'start cmd',
        darwin: 'open -a "Terminal"',
        linux: 'gnome-terminal'
    },
    explorer: {
        win32: 'explorer',
        darwin: 'open .',
        linux: 'nautilus'
    },
    spotify: {
        win32: 'start spotify:',
        darwin: 'open -a "Spotify"',
        linux: 'spotify'
    }
};

// Predefined bookmarks/URLs
const BOOKMARKS = {
    basecamp: 'https://3.basecamp.com/4644022/projects',
    github: 'https://github.com',
    google: 'https://google.com',
    youtube: 'https://youtube.com',
    gmail: 'https://mail.google.com',
    calendar: 'https://calendar.google.com',
    drive: 'https://drive.google.com',
    chatgpt: 'https://chat.openai.com',
    linkedin: 'https://linkedin.com',
    twitter: 'https://twitter.com'
};

/**
 * Opens a URL in the default browser or specified browser
 * @param {string} url - URL to open
 * @param {string} browser - Browser to use (chrome, firefox, edge, or default)
 * @returns {Promise<Object>} Result
 */
async function openUrl(url, browser = 'default') {
    try {
        log.info(`Opening URL: ${url} in ${browser}`);
        
        if (browser === 'default') {
            await open(url);
        } else {
            const platform = process.platform;
            const browserCmd = APP_COMMANDS[browser]?.[platform];
            
            if (browserCmd) {
                const command = platform === 'win32' 
                    ? `${browserCmd} "${url}"`
                    : `${browserCmd} "${url}"`;
                
                await execCommand(command);
            } else {
                await open(url);
            }
        }
        
        return {
            success: true,
            url,
            browser,
            message: `Opened ${url}`
        };
    } catch (error) {
        log.error(`Failed to open URL: ${error.message}`);
        return {
            success: false,
            error: error.message
        };
    }
}

/**
 * Opens a predefined bookmark
 * @param {string} name - Bookmark name
 * @param {string} browser - Browser to use
 * @returns {Promise<Object>} Result
 */
async function openBookmark(name, browser = 'chrome') {
    const url = BOOKMARKS[name.toLowerCase()];
    
    if (!url) {
        return {
            success: false,
            error: `Unknown bookmark: ${name}. Available: ${Object.keys(BOOKMARKS).join(', ')}`
        };
    }
    
    return openUrl(url, browser);
}

/**
 * Opens an application
 * @param {string} appName - Application name
 * @returns {Promise<Object>} Result
 */
async function openApp(appName) {
    try {
        const platform = process.platform;
        const appKey = appName.toLowerCase();
        const command = APP_COMMANDS[appKey]?.[platform];
        
        if (command) {
            log.info(`Opening app: ${appName}`);
            await execCommand(command);
            return {
                success: true,
                app: appName,
                message: `Opened ${appName}`
            };
        }
        
        // Try to open as a generic command
        log.info(`Trying to open: ${appName}`);
        if (platform === 'win32') {
            await execCommand(`start ${appName}`);
        } else if (platform === 'darwin') {
            await execCommand(`open -a "${appName}"`);
        } else {
            await execCommand(appName);
        }
        
        return {
            success: true,
            app: appName,
            message: `Opened ${appName}`
        };
    } catch (error) {
        log.error(`Failed to open app: ${error.message}`);
        return {
            success: false,
            error: error.message
        };
    }
}

/**
 * Opens Google Chrome with optional URL
 * @param {string} url - Optional URL to open
 * @returns {Promise<Object>} Result
 */
async function openChrome(url = null) {
    if (url) {
        return openUrl(url, 'chrome');
    }
    return openApp('chrome');
}

/**
 * Opens Basecamp projects
 * @returns {Promise<Object>} Result
 */
async function openBasecamp() {
    return openUrl(BOOKMARKS.basecamp, 'chrome');
}

/**
 * Executes a shell command
 * @param {string} command - Command to execute
 * @returns {Promise<string>} Output
 */
function execCommand(command) {
    return new Promise((resolve, reject) => {
        exec(command, (error, stdout, stderr) => {
            if (error) {
                reject(error);
            } else {
                resolve(stdout);
            }
        });
    });
}

/**
 * Gets list of available apps
 * @returns {Array<string>} App names
 */
function getAvailableApps() {
    return Object.keys(APP_COMMANDS);
}

/**
 * Gets list of available bookmarks
 * @returns {Object} Bookmarks
 */
function getBookmarks() {
    return { ...BOOKMARKS };
}

/**
 * Adds a custom bookmark
 * @param {string} name - Bookmark name
 * @param {string} url - URL
 */
function addBookmark(name, url) {
    BOOKMARKS[name.toLowerCase()] = url;
    log.info(`Added bookmark: ${name} -> ${url}`);
    return { success: true, name, url };
}

// Register actions
function registerActions() {
    registry.register('open_chrome', {
        handler: async (params) => {
            return await openChrome(params.url);
        },
        description: 'Open Google Chrome browser',
        category: 'apps',
        triggers: ['open chrome', 'chrome', 'browser', 'google chrome'],
        parameters: {
            url: { type: 'string', description: 'Optional URL to open' }
        }
    });

    registry.register('open_url', {
        handler: async (params) => {
            return await openUrl(params.url, params.browser || 'chrome');
        },
        description: 'Open a URL in browser',
        category: 'apps',
        triggers: ['open url', 'open website', 'go to', 'browse'],
        parameters: {
            url: { type: 'string', description: 'URL to open', required: true },
            browser: { type: 'string', description: 'Browser to use (chrome, firefox, edge, default)' }
        }
    });

    registry.register('open_basecamp', {
        handler: async () => {
            return await openBasecamp();
        },
        description: 'Open Basecamp projects',
        category: 'apps',
        triggers: ['open basecamp', 'basecamp', 'projects', 'basecamp projects']
    });

    registry.register('open_bookmark', {
        handler: async (params) => {
            return await openBookmark(params.name, params.browser);
        },
        description: 'Open a saved bookmark',
        category: 'apps',
        triggers: ['open bookmark', 'bookmark'],
        parameters: {
            name: { type: 'string', description: 'Bookmark name', required: true },
            browser: { type: 'string', description: 'Browser to use' }
        }
    });

    registry.register('open_app', {
        handler: async (params) => {
            return await openApp(params.name);
        },
        description: 'Open an application',
        category: 'apps',
        triggers: ['open app', 'launch', 'start', 'run'],
        parameters: {
            name: { type: 'string', description: 'Application name', required: true }
        }
    });

    registry.register('list_bookmarks', {
        handler: async () => {
            return { bookmarks: getBookmarks(), apps: getAvailableApps() };
        },
        description: 'List available bookmarks and apps',
        category: 'apps',
        triggers: ['list bookmarks', 'show bookmarks', 'bookmarks']
    });

    log.info('Apps actions registered');
}

module.exports = {
    openUrl,
    openBookmark,
    openApp,
    openChrome,
    openBasecamp,
    getAvailableApps,
    getBookmarks,
    addBookmark,
    registerActions
};
