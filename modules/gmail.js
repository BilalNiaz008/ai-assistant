/**
 * Gmail Module
 * Handles Gmail API integration with OAuth2 authentication
 */

const { google } = require('googleapis');
const fs = require('fs').promises;
const path = require('path');
const http = require('http');
const url = require('url');
const { config } = require('../config/config');
const { createModuleLogger } = require('../core/logger');
const { registry } = require('../core/action-registry');

const log = createModuleLogger('Gmail');

const TOKEN_PATH = path.join(__dirname, '..', 'credentials', 'gmail-token.json');
const SCOPES = config.gmail.scopes;

let oauth2Client = null;

/**
 * Initializes the OAuth2 client
 * @returns {Object} OAuth2 client instance
 */
function getOAuth2Client() {
    if (!oauth2Client) {
        oauth2Client = new google.auth.OAuth2(
            config.gmail.clientId,
            config.gmail.clientSecret,
            config.gmail.redirectUri
        );
    }
    return oauth2Client;
}

/**
 * Checks if valid tokens exist
 * @returns {Promise<boolean>} True if authenticated
 */
async function isAuthenticated() {
    try {
        const tokenData = await fs.readFile(TOKEN_PATH, 'utf-8');
        const tokens = JSON.parse(tokenData);
        const client = getOAuth2Client();
        client.setCredentials(tokens);
        
        // Check if token is expired
        if (tokens.expiry_date && tokens.expiry_date < Date.now()) {
            if (tokens.refresh_token) {
                log.info('Token expired, refreshing...');
                const { credentials } = await client.refreshAccessToken();
                await saveTokens(credentials);
                return true;
            }
            return false;
        }
        return true;
    } catch (error) {
        return false;
    }
}

/**
 * Saves tokens to file
 * @param {Object} tokens - OAuth tokens
 */
async function saveTokens(tokens) {
    await fs.mkdir(path.dirname(TOKEN_PATH), { recursive: true });
    await fs.writeFile(TOKEN_PATH, JSON.stringify(tokens, null, 2));
    log.info('Gmail tokens saved');
}

/**
 * Generates authorization URL
 * @returns {string} Authorization URL
 */
function getAuthUrl() {
    const client = getOAuth2Client();
    return client.generateAuthUrl({
        access_type: 'offline',
        scope: SCOPES,
        prompt: 'consent'
    });
}

/**
 * Starts local server to handle OAuth callback
 * @returns {Promise<Object>} OAuth tokens
 */
async function authenticate() {
    return new Promise((resolve, reject) => {
        const client = getOAuth2Client();
        const authUrl = getAuthUrl();
        
        log.info('Starting OAuth flow...');
        console.log('\n📧 Gmail Authentication Required');
        console.log('Please visit this URL to authorize Gmail access:\n');
        console.log(authUrl);
        console.log('\nWaiting for authorization...\n');

        const server = http.createServer(async (req, res) => {
            try {
                const parsedUrl = url.parse(req.url, true);
                
                if (parsedUrl.pathname === '/oauth2callback') {
                    const code = parsedUrl.query.code;
                    
                    if (code) {
                        res.writeHead(200, { 'Content-Type': 'text/html' });
                        res.end('<html><body><h1>✅ Authorization successful!</h1><p>You can close this window.</p></body></html>');
                        
                        const { tokens } = await client.getToken(code);
                        client.setCredentials(tokens);
                        await saveTokens(tokens);
                        
                        server.close();
                        log.info('Gmail authentication successful');
                        resolve(tokens);
                    } else {
                        res.writeHead(400, { 'Content-Type': 'text/html' });
                        res.end('<html><body><h1>❌ Authorization failed</h1></body></html>');
                        server.close();
                        reject(new Error('No authorization code received'));
                    }
                }
            } catch (error) {
                res.writeHead(500, { 'Content-Type': 'text/html' });
                res.end('<html><body><h1>❌ Error during authorization</h1></body></html>');
                server.close();
                reject(error);
            }
        });

        server.listen(config.server.port, () => {
            log.info(`OAuth callback server listening on port ${config.server.port}`);
        });

        // Auto-open browser (optional - works on Windows)
        const open = require('open');
        open(authUrl).catch(() => {
            log.debug('Could not auto-open browser');
        });
    });
}

/**
 * Ensures Gmail client is authenticated
 * @returns {Promise<Object>} Gmail API client
 */
async function getGmailClient() {
    const client = getOAuth2Client();
    
    if (!(await isAuthenticated())) {
        await authenticate();
    } else {
        const tokenData = await fs.readFile(TOKEN_PATH, 'utf-8');
        client.setCredentials(JSON.parse(tokenData));
    }
    
    return google.gmail({ version: 'v1', auth: client });
}

/**
 * Fetches unread emails
 * @param {Object} options - Fetch options
 * @param {number} options.maxResults - Maximum emails to fetch (default: 10)
 * @param {string} options.query - Additional Gmail search query
 * @returns {Promise<Array>} Array of email objects
 */
async function getUnreadEmails(options = {}) {
    const maxResults = options.maxResults || 10;
    const additionalQuery = options.query || '';
    
    try {
        const gmail = await getGmailClient();
        
        log.info('Fetching unread emails...');
        
        const query = `is:unread ${additionalQuery}`.trim();
        const listResponse = await gmail.users.messages.list({
            userId: 'me',
            q: query,
            maxResults
        });

        const messages = listResponse.data.messages || [];
        
        if (messages.length === 0) {
            log.info('No unread emails found');
            return [];
        }

        const emails = await Promise.all(
            messages.map(async (message) => {
                const detail = await gmail.users.messages.get({
                    userId: 'me',
                    id: message.id,
                    format: 'metadata',
                    metadataHeaders: ['From', 'Subject', 'Date']
                });

                const headers = detail.data.payload.headers;
                const getHeader = (name) => headers.find(h => h.name === name)?.value || '';

                return {
                    id: message.id,
                    threadId: message.threadId,
                    from: getHeader('From'),
                    subject: getHeader('Subject'),
                    date: getHeader('Date'),
                    snippet: detail.data.snippet,
                    labelIds: detail.data.labelIds || []
                };
            })
        );

        log.info(`Fetched ${emails.length} unread emails`);
        return emails;
    } catch (error) {
        log.error(`Failed to fetch emails: ${error.message}`);
        throw error;
    }
}

/**
 * Gets full email content by ID
 * @param {string} messageId - Gmail message ID
 * @returns {Promise<Object>} Full email details
 */
async function getEmailContent(messageId) {
    try {
        const gmail = await getGmailClient();
        
        const response = await gmail.users.messages.get({
            userId: 'me',
            id: messageId,
            format: 'full'
        });

        const message = response.data;
        const headers = message.payload.headers;
        const getHeader = (name) => headers.find(h => h.name === name)?.value || '';

        // Extract body
        let body = '';
        if (message.payload.body.data) {
            body = Buffer.from(message.payload.body.data, 'base64').toString('utf-8');
        } else if (message.payload.parts) {
            const textPart = message.payload.parts.find(p => p.mimeType === 'text/plain');
            if (textPart && textPart.body.data) {
                body = Buffer.from(textPart.body.data, 'base64').toString('utf-8');
            }
        }

        return {
            id: message.id,
            threadId: message.threadId,
            from: getHeader('From'),
            to: getHeader('To'),
            subject: getHeader('Subject'),
            date: getHeader('Date'),
            body,
            snippet: message.snippet,
            labelIds: message.labelIds || []
        };
    } catch (error) {
        log.error(`Failed to get email content: ${error.message}`);
        throw error;
    }
}

/**
 * Marks an email as read
 * @param {string} messageId - Gmail message ID
 */
async function markAsRead(messageId) {
    try {
        const gmail = await getGmailClient();
        
        await gmail.users.messages.modify({
            userId: 'me',
            id: messageId,
            requestBody: {
                removeLabelIds: ['UNREAD']
            }
        });
        
        log.debug(`Marked email ${messageId} as read`);
    } catch (error) {
        log.error(`Failed to mark email as read: ${error.message}`);
        throw error;
    }
}

/**
 * Formats emails for display
 * @param {Array} emails - Array of email objects
 * @returns {string} Formatted email list
 */
function formatEmails(emails) {
    if (emails.length === 0) {
        return '📭 No unread emails';
    }

    const formatted = emails.map((email, index) => {
        const from = email.from.replace(/<.*>/, '').trim();
        return `${index + 1}. From: ${from}\n   Subject: ${email.subject}\n   Preview: ${email.snippet.substring(0, 100)}...`;
    }).join('\n\n');

    return `📬 You have ${emails.length} unread email(s):\n\n${formatted}`;
}

/**
 * Gets email summary for AI context
 * @returns {Promise<string>} Email summary
 */
async function getEmailSummary() {
    try {
        const emails = await getUnreadEmails({ maxResults: 10 });
        
        if (emails.length === 0) {
            return 'No unread emails.';
        }

        const summary = emails.map(e => ({
            from: e.from.replace(/<.*>/, '').trim(),
            subject: e.subject,
            snippet: e.snippet
        }));

        return JSON.stringify(summary, null, 2);
    } catch (error) {
        return `Email fetch failed: ${error.message}`;
    }
}

// Register actions
function registerActions() {
    registry.register('get_unread_emails', {
        handler: async (params) => {
            const emails = await getUnreadEmails(params);
            return { emails, formatted: formatEmails(emails), count: emails.length };
        },
        description: 'Fetch unread emails from Gmail',
        category: 'communication',
        triggers: ['email', 'emails', 'inbox', 'mail', 'unread', 'messages'],
        parameters: {
            maxResults: { type: 'number', description: 'Maximum emails to fetch', default: 10 },
            query: { type: 'string', description: 'Additional search query' }
        }
    });

    registry.register('read_email', {
        handler: async (params) => {
            if (!params.messageId) {
                throw new Error('messageId is required');
            }
            return await getEmailContent(params.messageId);
        },
        description: 'Get full content of a specific email',
        category: 'communication',
        triggers: ['read email', 'open email', 'email content'],
        parameters: {
            messageId: { type: 'string', description: 'Gmail message ID', required: true }
        }
    });

    registry.register('gmail_authenticate', {
        handler: async () => {
            if (await isAuthenticated()) {
                return { success: true, message: 'Already authenticated' };
            }
            await authenticate();
            return { success: true, message: 'Authentication successful' };
        },
        description: 'Authenticate with Gmail (OAuth2)',
        category: 'setup',
        triggers: ['gmail login', 'authenticate gmail', 'connect gmail']
    });

    log.info('Gmail actions registered');
}

module.exports = {
    getUnreadEmails,
    getEmailContent,
    markAsRead,
    formatEmails,
    getEmailSummary,
    isAuthenticated,
    authenticate,
    getAuthUrl,
    registerActions
};
