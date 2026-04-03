/**
 * Greeting Module
 * Handles personalized greetings based on time of day and context
 */

const { config, getTimeOfDay } = require('../config/config');
const { createModuleLogger } = require('../core/logger');
const { registry } = require('../core/action-registry');

const log = createModuleLogger('Greeting');

// Greeting templates for different times of day
const greetingTemplates = {
    morning: [
        "Good morning, {name}! Ready to conquer the day?",
        "Rise and shine, {name}! Let's make today productive.",
        "Good morning, {name}! Hope you had a great rest.",
        "Morning, {name}! What shall we accomplish today?",
        "Good morning, {name}! Your personal assistant is online."
    ],
    afternoon: [
        "Good afternoon, {name}! How's your day going?",
        "Hey {name}! Hope your afternoon is going well.",
        "Good afternoon, {name}! Ready to tackle the rest of the day?",
        "Afternoon, {name}! Your assistant is here to help."
    ],
    evening: [
        "Good evening, {name}! Wrapping up for the day?",
        "Evening, {name}! How was your day?",
        "Good evening, {name}! Time to wind down.",
        "Hey {name}! Hope you had a productive day."
    ],
    night: [
        "Hello, {name}! Working late tonight?",
        "Good evening, {name}! Burning the midnight oil?",
        "Hey {name}! Ready for a late-night session?",
        "Hello, {name}! Your assistant is here whenever you need."
    ]
};

// Special occasion greetings
const specialGreetings = {
    monday: "Happy Monday! Let's start the week strong.",
    friday: "Happy Friday! Almost weekend time.",
    weekend: "Enjoy your weekend!"
};

/**
 * Gets a random greeting for the time of day
 * @param {string} timeOfDay - 'morning', 'afternoon', 'evening', or 'night'
 * @returns {string} Random greeting template
 */
function getRandomGreeting(timeOfDay) {
    const templates = greetingTemplates[timeOfDay] || greetingTemplates.morning;
    return templates[Math.floor(Math.random() * templates.length)];
}

/**
 * Generates personalized greeting
 * @param {Object} options - Greeting options
 * @param {string} options.name - User name override
 * @param {string} options.timeOfDay - Time of day override
 * @param {boolean} options.includeDate - Include current date
 * @returns {Object} Greeting data
 */
function generateGreeting(options = {}) {
    const name = options.name || config.user.name;
    const timeOfDay = options.timeOfDay || getTimeOfDay();
    const includeDate = options.includeDate !== false;

    const greetingTemplate = getRandomGreeting(timeOfDay);
    const greeting = greetingTemplate.replace('{name}', name);

    const now = new Date();
    const dayOfWeek = now.toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();
    const isWeekend = dayOfWeek === 'saturday' || dayOfWeek === 'sunday';

    let additionalMessage = '';
    if (dayOfWeek === 'monday') {
        additionalMessage = specialGreetings.monday;
    } else if (dayOfWeek === 'friday') {
        additionalMessage = specialGreetings.friday;
    } else if (isWeekend) {
        additionalMessage = specialGreetings.weekend;
    }

    const dateString = now.toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });

    const timeString = now.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit'
    });

    const result = {
        greeting,
        timeOfDay,
        additionalMessage,
        date: dateString,
        time: timeString,
        dayOfWeek,
        isWeekend,
        userName: name
    };

    log.info(`Generated greeting for ${name} (${timeOfDay})`);
    return result;
}

/**
 * Formats greeting for display
 * @param {Object} greetingData - Greeting data from generateGreeting
 * @returns {string} Formatted greeting string
 */
function formatGreeting(greetingData) {
    const lines = [
        '',
        '═'.repeat(50),
        `  ${greetingData.greeting}`,
        '',
        `  📅 ${greetingData.date}`,
        `  🕐 ${greetingData.time}`,
    ];

    if (greetingData.additionalMessage) {
        lines.push(`  ✨ ${greetingData.additionalMessage}`);
    }

    lines.push('═'.repeat(50));
    lines.push('');

    return lines.join('\n');
}

/**
 * Generates greeting with context (weather, emails, etc.)
 * @param {Object} context - Additional context data
 * @returns {Object} Enhanced greeting data
 */
function generateContextualGreeting(context = {}) {
    const baseGreeting = generateGreeting();
    
    const contextLines = [];
    
    if (context.weather) {
        contextLines.push(`Weather: ${context.weather.temperature}°${context.weather.units}, ${context.weather.description}`);
    }
    
    if (context.emailCount !== undefined) {
        if (context.emailCount === 0) {
            contextLines.push('No unread emails - inbox zero! 🎉');
        } else {
            contextLines.push(`You have ${context.emailCount} unread email${context.emailCount > 1 ? 's' : ''}`);
        }
    }
    
    if (context.tasks && context.tasks.length > 0) {
        contextLines.push(`${context.tasks.length} task${context.tasks.length > 1 ? 's' : ''} on your agenda`);
    }

    return {
        ...baseGreeting,
        context: contextLines,
        hasContext: contextLines.length > 0
    };
}

/**
 * Formats contextual greeting for display
 * @param {Object} greetingData - Contextual greeting data
 * @returns {string} Formatted greeting with context
 */
function formatContextualGreeting(greetingData) {
    const lines = [
        '',
        '╔' + '═'.repeat(58) + '╗',
        '║' + `  ${greetingData.greeting}`.padEnd(58) + '║',
        '║' + ' '.repeat(58) + '║',
        '║' + `  📅 ${greetingData.date}`.padEnd(58) + '║',
        '║' + `  🕐 ${greetingData.time}`.padEnd(58) + '║',
    ];

    if (greetingData.additionalMessage) {
        lines.push('║' + `  ✨ ${greetingData.additionalMessage}`.padEnd(58) + '║');
    }

    if (greetingData.hasContext) {
        lines.push('║' + '─'.repeat(58) + '║');
        greetingData.context.forEach(line => {
            lines.push('║' + `  • ${line}`.padEnd(58) + '║');
        });
    }

    lines.push('╚' + '═'.repeat(58) + '╝');
    lines.push('');

    return lines.join('\n');
}

/**
 * Generates quick summary for AI decision engine
 * @returns {string} Summary string for AI context
 */
function getGreetingContext() {
    const now = new Date();
    const timeOfDay = getTimeOfDay();
    const dayOfWeek = now.toLocaleDateString('en-US', { weekday: 'long' });
    const isWeekend = dayOfWeek === 'Saturday' || dayOfWeek === 'Sunday';
    
    return `Time: ${timeOfDay}, Day: ${dayOfWeek}, Weekend: ${isWeekend}`;
}

// Register actions
function registerActions() {
    registry.register('greet_user', {
        handler: async (params) => {
            const greeting = generateGreeting(params);
            return { ...greeting, formatted: formatGreeting(greeting) };
        },
        description: 'Generate personalized greeting',
        category: 'interaction',
        triggers: ['hello', 'hi', 'hey', 'greet', 'good morning', 'good afternoon', 'good evening'],
        parameters: {
            name: { type: 'string', description: 'User name override' },
            timeOfDay: { type: 'string', enum: ['morning', 'afternoon', 'evening', 'night'] }
        }
    });

    registry.register('contextual_greeting', {
        handler: async (params) => {
            const greeting = generateContextualGreeting(params.context || {});
            return { ...greeting, formatted: formatContextualGreeting(greeting) };
        },
        description: 'Generate greeting with context (weather, emails)',
        category: 'interaction',
        triggers: ['briefing', 'status', 'overview'],
        parameters: {
            context: { type: 'object', description: 'Context data (weather, emailCount, tasks)' }
        }
    });

    log.info('Greeting actions registered');
}

module.exports = {
    generateGreeting,
    formatGreeting,
    generateContextualGreeting,
    formatContextualGreeting,
    getGreetingContext,
    registerActions
};
