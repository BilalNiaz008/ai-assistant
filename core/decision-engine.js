/**
 * Decision Engine Module
 * AI-powered decision layer that determines what actions to take
 * This is the foundation for the autonomous AI agent capability
 */

const { callAI } = require('../modules/ai-summarizer');
const { registry } = require('./action-registry');
const { config, getTimeOfDay } = require('../config/config');
const { createModuleLogger } = require('./logger');

const log = createModuleLogger('DecisionEngine');

/**
 * Context types for decision making
 */
const CONTEXT_TYPES = {
    STARTUP: 'startup',
    USER_REQUEST: 'user_request',
    SCHEDULED: 'scheduled',
    EVENT_TRIGGERED: 'event_triggered'
};

/**
 * Builds system context for AI decision making
 * @returns {Object} Current system context
 */
function buildSystemContext() {
    const now = new Date();
    
    return {
        timestamp: now.toISOString(),
        timeOfDay: getTimeOfDay(),
        dayOfWeek: now.toLocaleDateString('en-US', { weekday: 'long' }),
        isWeekend: [0, 6].includes(now.getDay()),
        hour: now.getHours(),
        userName: config.user.name,
        location: config.user.location,
        enabledFeatures: config.features
    };
}

/**
 * Gets available actions for AI context
 * @returns {Array} Simplified action list
 */
function getAvailableActions() {
    return registry.exportForAI();
}

/**
 * Makes a decision about what actions to take based on context
 * @param {string} contextType - Type of context (startup, user_request, etc.)
 * @param {Object} additionalContext - Additional context data
 * @returns {Promise<Object>} Decision result with actions to execute
 */
async function makeDecision(contextType, additionalContext = {}) {
    log.info(`Making decision for context: ${contextType}`);
    
    const systemContext = buildSystemContext();
    const availableActions = getAvailableActions();
    
    const prompt = buildDecisionPrompt(contextType, systemContext, additionalContext, availableActions);
    
    try {
        const response = await callAI(prompt, {
            systemPrompt: buildSystemPrompt(),
            temperature: 0.3,
            maxTokens: 1500
        });
        
        const decision = parseDecision(response);
        log.info(`Decision made: ${decision.actions.length} actions planned`);
        
        return decision;
    } catch (error) {
        log.error(`Decision making failed: ${error.message}`);
        return getDefaultDecision(contextType);
    }
}

/**
 * Builds the system prompt for decision making
 * @returns {string} System prompt
 */
function buildSystemPrompt() {
    return `You are an AI decision engine for a personal assistant named Jarvis.
Your role is to analyze the current context and decide what actions to take.

Key principles:
1. Be helpful but not intrusive
2. Prioritize user productivity
3. Consider time of day and day of week
4. Don't overwhelm with too many actions
5. Some actions can run in parallel, others should be sequential

Always respond with valid JSON in the specified format.`;
}

/**
 * Builds the decision prompt based on context
 * @param {string} contextType - Context type
 * @param {Object} systemContext - System context
 * @param {Object} additionalContext - Additional context
 * @param {Array} availableActions - Available actions
 * @returns {string} Full prompt
 */
function buildDecisionPrompt(contextType, systemContext, additionalContext, availableActions) {
    const contextDescriptions = {
        [CONTEXT_TYPES.STARTUP]: 'User just started their computer/laptop',
        [CONTEXT_TYPES.USER_REQUEST]: `User made a request: "${additionalContext.userInput || 'unknown'}"`,
        [CONTEXT_TYPES.SCHEDULED]: 'This is a scheduled check-in',
        [CONTEXT_TYPES.EVENT_TRIGGERED]: `An event was triggered: ${additionalContext.event || 'unknown'}`
    };

    return `
CONTEXT TYPE: ${contextType}
SITUATION: ${contextDescriptions[contextType] || contextType}

SYSTEM CONTEXT:
${JSON.stringify(systemContext, null, 2)}

ADDITIONAL CONTEXT:
${JSON.stringify(additionalContext, null, 2)}

AVAILABLE ACTIONS:
${JSON.stringify(availableActions, null, 2)}

Based on this context, decide what actions should be taken.
Consider:
- Is this a good time for the action?
- Is the action relevant to the current context?
- What's the priority of each action?

Respond with JSON in this exact format:
{
    "reasoning": "Brief explanation of your decision",
    "actions": [
        {
            "name": "action_name",
            "params": {},
            "priority": 1,
            "parallel": false
        }
    ],
    "message": "Optional message to show the user"
}

Actions with parallel: true can run simultaneously. 
Priority 1 is highest, 5 is lowest.
Maximum 5 actions.
`;
}

/**
 * Parses the AI response into a structured decision
 * @param {string} response - AI response
 * @returns {Object} Parsed decision
 */
function parseDecision(response) {
    try {
        const jsonMatch = response.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
            log.warn('No JSON found in AI response');
            return {
                reasoning: 'Could not parse AI response',
                actions: [],
                message: null,
                raw: response
            };
        }

        const parsed = JSON.parse(jsonMatch[0]);
        
        // Validate and sanitize actions
        const validActions = (parsed.actions || [])
            .filter(action => {
                if (!action.name) return false;
                if (!registry.getAction(action.name)) {
                    log.warn(`Invalid action in decision: ${action.name}`);
                    return false;
                }
                return true;
            })
            .map(action => ({
                name: action.name,
                params: action.params || {},
                priority: Math.min(5, Math.max(1, action.priority || 3)),
                parallel: !!action.parallel
            }))
            .sort((a, b) => a.priority - b.priority);

        return {
            reasoning: parsed.reasoning || '',
            actions: validActions,
            message: parsed.message || null,
            raw: response
        };
    } catch (error) {
        log.error(`Failed to parse decision: ${error.message}`);
        return {
            reasoning: 'Parse error',
            actions: [],
            message: null,
            error: error.message,
            raw: response
        };
    }
}

/**
 * Gets default decision when AI fails
 * @param {string} contextType - Context type
 * @returns {Object} Default decision
 */
function getDefaultDecision(contextType) {
    const defaults = {
        [CONTEXT_TYPES.STARTUP]: {
            reasoning: 'Default startup sequence (AI unavailable)',
            actions: [
                { name: 'greet_user', params: {}, priority: 1, parallel: false },
                { name: 'get_weather', params: {}, priority: 2, parallel: true },
                { name: 'get_unread_emails', params: { maxResults: 5 }, priority: 2, parallel: true }
            ],
            message: null
        },
        [CONTEXT_TYPES.USER_REQUEST]: {
            reasoning: 'Unable to process request (AI unavailable)',
            actions: [],
            message: 'I apologize, but I cannot process your request at this time.'
        }
    };

    return defaults[contextType] || {
        reasoning: 'No default defined',
        actions: [],
        message: null
    };
}

/**
 * Executes a decision by running the planned actions
 * @param {Object} decision - Decision object from makeDecision
 * @returns {Promise<Object>} Execution results
 */
async function executeDecision(decision) {
    log.info('Executing decision...');
    
    const results = {
        success: true,
        actionsExecuted: 0,
        actionResults: [],
        errors: []
    };

    if (!decision.actions || decision.actions.length === 0) {
        log.info('No actions to execute');
        return results;
    }

    // Group actions by parallel capability
    const parallelActions = decision.actions.filter(a => a.parallel);
    const sequentialActions = decision.actions.filter(a => !a.parallel);

    // Execute parallel actions first
    if (parallelActions.length > 0) {
        log.info(`Executing ${parallelActions.length} parallel actions`);
        const parallelResults = await registry.executeParallel(
            parallelActions.map(a => ({ name: a.name, params: a.params }))
        );
        
        parallelResults.forEach((result, index) => {
            results.actionResults.push({
                action: parallelActions[index].name,
                ...result
            });
            if (result.success) {
                results.actionsExecuted++;
            } else {
                results.errors.push({
                    action: parallelActions[index].name,
                    error: result.error
                });
            }
        });
    }

    // Execute sequential actions
    for (const action of sequentialActions) {
        log.info(`Executing sequential action: ${action.name}`);
        const result = await registry.execute(action.name, action.params);
        
        results.actionResults.push({
            action: action.name,
            ...result
        });
        
        if (result.success) {
            results.actionsExecuted++;
        } else {
            results.errors.push({
                action: action.name,
                error: result.error
            });
        }
    }

    results.success = results.errors.length === 0;
    log.info(`Decision executed: ${results.actionsExecuted}/${decision.actions.length} actions succeeded`);
    
    return results;
}

/**
 * Main entry point for startup decision
 * @returns {Promise<Object>} Startup execution results
 */
async function startupDecision() {
    log.info('Running startup decision...');
    
    if (!config.features.decisionEngine) {
        log.info('Decision engine disabled, using default startup');
        const defaultDecision = getDefaultDecision(CONTEXT_TYPES.STARTUP);
        return await executeDecision(defaultDecision);
    }

    const decision = await makeDecision(CONTEXT_TYPES.STARTUP);
    return {
        decision,
        execution: await executeDecision(decision)
    };
}

/**
 * Processes a user request through the decision engine
 * @param {string} userInput - User's input/request
 * @param {Object} context - Additional context
 * @returns {Promise<Object>} Decision and execution results
 */
async function processUserRequest(userInput, context = {}) {
    log.info(`Processing user request: ${userInput}`);
    
    const decision = await makeDecision(CONTEXT_TYPES.USER_REQUEST, {
        userInput,
        ...context
    });
    
    return {
        decision,
        execution: await executeDecision(decision)
    };
}

// Register decision engine actions
function registerActions() {
    registry.register('ai_decide', {
        handler: async (params) => {
            const decision = await makeDecision(
                params.contextType || CONTEXT_TYPES.USER_REQUEST,
                params.context || {}
            );
            return decision;
        },
        description: 'Make an AI-powered decision about what actions to take',
        category: 'ai',
        triggers: ['decide', 'what should I do', 'help me decide'],
        parameters: {
            contextType: { type: 'string', description: 'Context type' },
            context: { type: 'object', description: 'Additional context' }
        }
    });

    registry.register('execute_decision', {
        handler: async (params) => {
            if (!params.decision) {
                throw new Error('decision object is required');
            }
            return await executeDecision(params.decision);
        },
        description: 'Execute a decision (run planned actions)',
        category: 'system',
        triggers: [],
        parameters: {
            decision: { type: 'object', description: 'Decision object', required: true }
        }
    });

    log.info('Decision engine actions registered');
}

module.exports = {
    CONTEXT_TYPES,
    buildSystemContext,
    makeDecision,
    executeDecision,
    startupDecision,
    processUserRequest,
    getDefaultDecision,
    registerActions
};
