/**
 * AI Summarizer Module
 * Handles LLM-based summarization using OpenAI or Anthropic APIs
 */

const OpenAI = require('openai');
const axios = require('axios');
const { config } = require('../config/config');
const { createModuleLogger } = require('../core/logger');
const { registry } = require('../core/action-registry');

const log = createModuleLogger('AI-Summarizer');

let openaiClient = null;

/**
 * Initializes OpenAI client
 * @returns {Object} OpenAI client instance
 */
function getOpenAIClient() {
    if (!openaiClient && config.ai.openai.apiKey) {
        openaiClient = new OpenAI({
            apiKey: config.ai.openai.apiKey
        });
    }
    return openaiClient;
}

/**
 * Calls OpenAI API for completion
 * @param {string} prompt - The prompt to send
 * @param {Object} options - API options
 * @returns {Promise<string>} AI response
 */
async function callOpenAI(prompt, options = {}) {
    const client = getOpenAIClient();
    if (!client) {
        throw new Error('OpenAI API key not configured');
    }

    const response = await client.chat.completions.create({
        model: options.model || config.ai.openai.model,
        messages: [
            {
                role: 'system',
                content: options.systemPrompt || 'You are a helpful personal assistant that provides concise, actionable summaries.'
            },
            {
                role: 'user',
                content: prompt
            }
        ],
        temperature: options.temperature || 0.7,
        max_tokens: options.maxTokens || 1000
    });

    return response.choices[0].message.content;
}

/**
 * Calls Anthropic Claude API for completion
 * @param {string} prompt - The prompt to send
 * @param {Object} options - API options
 * @returns {Promise<string>} AI response
 */
async function callAnthropic(prompt, options = {}) {
    const apiKey = config.ai.anthropic.apiKey;
    if (!apiKey) {
        throw new Error('Anthropic API key not configured');
    }

    const response = await axios.post(
        'https://api.anthropic.com/v1/messages',
        {
            model: options.model || config.ai.anthropic.model,
            max_tokens: options.maxTokens || 1000,
            system: options.systemPrompt || 'You are a helpful personal assistant that provides concise, actionable summaries.',
            messages: [
                {
                    role: 'user',
                    content: prompt
                }
            ]
        },
        {
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01'
            },
            timeout: 30000
        }
    );

    return response.data.content[0].text;
}

/**
 * Calls the configured AI provider
 * @param {string} prompt - The prompt to send
 * @param {Object} options - API options
 * @returns {Promise<string>} AI response
 */
async function callAI(prompt, options = {}) {
    const provider = config.ai.provider.toUpperCase();
    
    log.info(`Calling ${provider} API...`);
    
    try {
        let response;
        if (provider === 'ANTHROPIC') {
            response = await callAnthropic(prompt, options);
        } else {
            response = await callOpenAI(prompt, options);
        }
        
        log.info('AI response received');
        return response;
    } catch (error) {
        log.error(`AI API call failed: ${error.message}`);
        throw error;
    }
}

/**
 * Summarizes a list of emails
 * @param {Array<Object>} emails - Array of email objects
 * @returns {Promise<Object>} Summary with important emails and action items
 */
async function summarizeEmails(emails) {
    if (!emails || emails.length === 0) {
        return {
            summary: 'No emails to summarize.',
            important: [],
            actionItems: [],
            count: 0
        };
    }

    const emailData = emails.map((email, index) => ({
        index: index + 1,
        from: email.from,
        subject: email.subject,
        preview: email.snippet
    }));

    const prompt = `Analyze these unread emails and provide:
1. A brief summary (2-3 sentences)
2. List any IMPORTANT emails (urgent, from boss/important contacts, deadlines)
3. List ACTION ITEMS that need attention

Emails:
${JSON.stringify(emailData, null, 2)}

Respond in this JSON format:
{
    "summary": "Brief overview of inbox",
    "important": [{"index": 1, "reason": "Why it's important"}],
    "actionItems": [{"action": "What needs to be done", "email": 1}],
    "canWait": [{"index": 2, "reason": "Why it can wait"}]
}`;

    try {
        const response = await callAI(prompt, {
            systemPrompt: 'You are an email triage assistant. Analyze emails and identify priorities. Always respond with valid JSON.',
            temperature: 0.3
        });

        // Parse JSON response
        const jsonMatch = response.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            return {
                ...parsed,
                count: emails.length,
                raw: response
            };
        }

        return {
            summary: response,
            important: [],
            actionItems: [],
            count: emails.length
        };
    } catch (error) {
        log.error(`Email summarization failed: ${error.message}`);
        return {
            summary: `Failed to summarize ${emails.length} emails: ${error.message}`,
            important: [],
            actionItems: [],
            count: emails.length,
            error: error.message
        };
    }
}

/**
 * Generates a morning briefing summary
 * @param {Object} data - Data to summarize
 * @param {Object} data.weather - Weather data
 * @param {Array} data.emails - Email list
 * @param {Object} data.greeting - Greeting data
 * @returns {Promise<string>} Morning briefing summary
 */
async function generateMorningBriefing(data) {
    const parts = [];
    
    if (data.greeting) {
        parts.push(`Time: ${data.greeting.timeOfDay}, ${data.greeting.date}`);
    }
    
    if (data.weather) {
        parts.push(`Weather: ${data.weather.temperature}°${data.weather.units}, ${data.weather.description}`);
    }
    
    if (data.emails && data.emails.length > 0) {
        parts.push(`Emails: ${data.emails.length} unread`);
        parts.push('Email details: ' + JSON.stringify(data.emails.slice(0, 5).map(e => ({
            from: e.from,
            subject: e.subject
        }))));
    }

    const prompt = `Based on this morning context, create a brief, friendly morning briefing:

${parts.join('\n')}

Keep it conversational, highlight what's important, and suggest priorities for the day.
Maximum 3-4 sentences.`;

    try {
        const briefing = await callAI(prompt, {
            systemPrompt: 'You are a friendly personal assistant giving a morning briefing. Be concise and helpful.',
            temperature: 0.7
        });
        
        return briefing;
    } catch (error) {
        log.error(`Morning briefing generation failed: ${error.message}`);
        return 'Good morning! Unable to generate personalized briefing at this time.';
    }
}

/**
 * Summarizes arbitrary text content
 * @param {string} content - Content to summarize
 * @param {Object} options - Summarization options
 * @returns {Promise<string>} Summary
 */
async function summarizeText(content, options = {}) {
    const maxLength = options.maxLength || 'brief';
    const style = options.style || 'bullet points';
    
    const prompt = `Summarize the following content in a ${maxLength} format using ${style}:

${content}`;

    return await callAI(prompt, {
        temperature: 0.5
    });
}

/**
 * Answers a question using AI
 * @param {string} question - User question
 * @param {Object} context - Additional context
 * @returns {Promise<string>} AI response
 */
async function answerQuestion(question, context = {}) {
    let contextStr = '';
    if (Object.keys(context).length > 0) {
        contextStr = `\n\nContext:\n${JSON.stringify(context, null, 2)}`;
    }

    const prompt = `${question}${contextStr}`;

    return await callAI(prompt, {
        temperature: 0.7
    });
}

// Register actions
function registerActions() {
    registry.register('summarize_emails', {
        handler: async (params) => {
            return await summarizeEmails(params.emails || []);
        },
        description: 'Summarize emails and identify action items',
        category: 'ai',
        triggers: ['summarize emails', 'email summary', 'triage inbox'],
        parameters: {
            emails: { type: 'array', description: 'Array of email objects' }
        }
    });

    registry.register('morning_briefing', {
        handler: async (params) => {
            return await generateMorningBriefing(params);
        },
        description: 'Generate personalized morning briefing',
        category: 'ai',
        triggers: ['briefing', 'morning update', 'daily brief'],
        parameters: {
            weather: { type: 'object', description: 'Weather data' },
            emails: { type: 'array', description: 'Email list' },
            greeting: { type: 'object', description: 'Greeting data' }
        }
    });

    registry.register('summarize_text', {
        handler: async (params) => {
            if (!params.content) {
                throw new Error('content is required');
            }
            return await summarizeText(params.content, params);
        },
        description: 'Summarize any text content',
        category: 'ai',
        triggers: ['summarize', 'tldr', 'summary'],
        parameters: {
            content: { type: 'string', description: 'Text to summarize', required: true },
            maxLength: { type: 'string', enum: ['brief', 'detailed'], description: 'Summary length' },
            style: { type: 'string', description: 'Output style (bullet points, paragraph, etc.)' }
        }
    });

    registry.register('ask_ai', {
        handler: async (params) => {
            if (!params.question) {
                throw new Error('question is required');
            }
            return await answerQuestion(params.question, params.context);
        },
        description: 'Ask the AI assistant a question',
        category: 'ai',
        triggers: ['ask', 'question', 'help'],
        parameters: {
            question: { type: 'string', description: 'Question to ask', required: true },
            context: { type: 'object', description: 'Additional context' }
        }
    });

    log.info('AI Summarizer actions registered');
}

module.exports = {
    callAI,
    callOpenAI,
    callAnthropic,
    summarizeEmails,
    generateMorningBriefing,
    summarizeText,
    answerQuestion,
    registerActions
};
