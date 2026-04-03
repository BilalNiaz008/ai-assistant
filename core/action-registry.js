/**
 * Action Registry Module
 * Central registry for all assistant actions, enabling dynamic action execution
 * This is the foundation for the plugin-based architecture
 */

const { createModuleLogger } = require('./logger');
const log = createModuleLogger('ActionRegistry');

class ActionRegistry {
    constructor() {
        this.actions = new Map();
        this.categories = new Map();
    }

    /**
     * Registers a new action
     * @param {string} name - Unique action identifier
     * @param {Object} actionConfig - Action configuration
     * @param {Function} actionConfig.handler - Async function to execute
     * @param {string} actionConfig.description - Human-readable description
     * @param {string} actionConfig.category - Action category (e.g., 'communication', 'entertainment')
     * @param {Array<string>} actionConfig.triggers - Keywords that can trigger this action
     * @param {Object} actionConfig.parameters - Parameter definitions for the action
     */
    register(name, actionConfig) {
        if (this.actions.has(name)) {
            log.warn(`Action "${name}" already registered, overwriting...`);
        }

        const action = {
            name,
            handler: actionConfig.handler,
            description: actionConfig.description || '',
            category: actionConfig.category || 'general',
            triggers: actionConfig.triggers || [],
            parameters: actionConfig.parameters || {},
            enabled: actionConfig.enabled !== false,
            priority: actionConfig.priority || 5
        };

        this.actions.set(name, action);

        // Update category index
        if (!this.categories.has(action.category)) {
            this.categories.set(action.category, new Set());
        }
        this.categories.get(action.category).add(name);

        log.debug(`Registered action: ${name} [${action.category}]`);
    }

    /**
     * Unregisters an action
     * @param {string} name - Action identifier to remove
     */
    unregister(name) {
        const action = this.actions.get(name);
        if (action) {
            this.categories.get(action.category)?.delete(name);
            this.actions.delete(name);
            log.debug(`Unregistered action: ${name}`);
        }
    }

    /**
     * Executes an action by name
     * @param {string} name - Action identifier
     * @param {Object} params - Parameters to pass to the action handler
     * @returns {Promise<Object>} Action result
     */
    async execute(name, params = {}) {
        const action = this.actions.get(name);
        
        if (!action) {
            log.error(`Action not found: ${name}`);
            return { success: false, error: `Action "${name}" not found` };
        }

        if (!action.enabled) {
            log.warn(`Action "${name}" is disabled`);
            return { success: false, error: `Action "${name}" is disabled` };
        }

        try {
            log.info(`Executing action: ${name}`);
            const startTime = Date.now();
            const result = await action.handler(params);
            const duration = Date.now() - startTime;
            log.info(`Action "${name}" completed in ${duration}ms`);
            
            return {
                success: true,
                action: name,
                result,
                duration
            };
        } catch (error) {
            log.error(`Action "${name}" failed: ${error.message}`);
            return {
                success: false,
                action: name,
                error: error.message
            };
        }
    }

    /**
     * Executes multiple actions in sequence
     * @param {Array<{name: string, params: Object}>} actionList - List of actions to execute
     * @returns {Promise<Array<Object>>} Results from all actions
     */
    async executeSequence(actionList) {
        const results = [];
        for (const { name, params } of actionList) {
            const result = await this.execute(name, params);
            results.push(result);
            
            // Stop on critical failure if needed
            if (!result.success && params?.stopOnError) {
                break;
            }
        }
        return results;
    }

    /**
     * Executes multiple actions in parallel
     * @param {Array<{name: string, params: Object}>} actionList - List of actions to execute
     * @returns {Promise<Array<Object>>} Results from all actions
     */
    async executeParallel(actionList) {
        const promises = actionList.map(({ name, params }) => this.execute(name, params));
        return Promise.all(promises);
    }

    /**
     * Gets action by name
     * @param {string} name - Action identifier
     * @returns {Object|null} Action configuration or null
     */
    getAction(name) {
        return this.actions.get(name) || null;
    }

    /**
     * Lists all registered actions
     * @param {string} category - Optional category filter
     * @returns {Array<Object>} List of action configurations
     */
    listActions(category = null) {
        let actionNames;
        
        if (category && this.categories.has(category)) {
            actionNames = Array.from(this.categories.get(category));
        } else {
            actionNames = Array.from(this.actions.keys());
        }

        return actionNames.map(name => {
            const action = this.actions.get(name);
            return {
                name: action.name,
                description: action.description,
                category: action.category,
                enabled: action.enabled,
                triggers: action.triggers
            };
        });
    }

    /**
     * Finds actions that match given triggers/keywords
     * @param {string} query - Search query
     * @returns {Array<Object>} Matching actions sorted by relevance
     */
    findActions(query) {
        const queryLower = query.toLowerCase();
        const matches = [];

        for (const [name, action] of this.actions) {
            if (!action.enabled) continue;

            let score = 0;
            
            // Check action name
            if (name.toLowerCase().includes(queryLower)) {
                score += 10;
            }
            
            // Check triggers
            for (const trigger of action.triggers) {
                if (trigger.toLowerCase().includes(queryLower) || 
                    queryLower.includes(trigger.toLowerCase())) {
                    score += 5;
                }
            }
            
            // Check description
            if (action.description.toLowerCase().includes(queryLower)) {
                score += 2;
            }

            if (score > 0) {
                matches.push({ ...action, score });
            }
        }

        return matches.sort((a, b) => b.score - a.score);
    }

    /**
     * Gets all categories
     * @returns {Array<string>} List of category names
     */
    getCategories() {
        return Array.from(this.categories.keys());
    }

    /**
     * Enables or disables an action
     * @param {string} name - Action identifier
     * @param {boolean} enabled - Enable state
     */
    setEnabled(name, enabled) {
        const action = this.actions.get(name);
        if (action) {
            action.enabled = enabled;
            log.info(`Action "${name}" ${enabled ? 'enabled' : 'disabled'}`);
        }
    }

    /**
     * Gets registry statistics
     * @returns {Object} Statistics about registered actions
     */
    getStats() {
        const enabledCount = Array.from(this.actions.values()).filter(a => a.enabled).length;
        return {
            totalActions: this.actions.size,
            enabledActions: enabledCount,
            disabledActions: this.actions.size - enabledCount,
            categories: this.categories.size,
            categoryCounts: Object.fromEntries(
                Array.from(this.categories.entries()).map(([cat, actions]) => [cat, actions.size])
            )
        };
    }

    /**
     * Exports actions for AI context (LLM can use this to understand available actions)
     * @returns {Array<Object>} Simplified action list for AI consumption
     */
    exportForAI() {
        return Array.from(this.actions.values())
            .filter(a => a.enabled)
            .map(action => ({
                action: action.name,
                description: action.description,
                category: action.category,
                parameters: action.parameters,
                triggers: action.triggers
            }));
    }
}

// Singleton instance
const registry = new ActionRegistry();

module.exports = {
    ActionRegistry,
    registry
};
