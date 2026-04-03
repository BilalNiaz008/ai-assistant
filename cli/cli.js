#!/usr/bin/env node

/**
 * Jarvis CLI Interface
 * Interactive command-line interface for the assistant
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const { Command } = require('commander');
const inquirer = require('inquirer');
const chalk = require('chalk');
const ora = require('ora');

const { config } = require('../config/config');
const { registry } = require('../core/action-registry');
const { createModuleLogger } = require('../core/logger');

// Import and register all modules
const weather = require('../modules/weather');
const gmail = require('../modules/gmail');
const music = require('../modules/music');
const greeting = require('../modules/greeting');
const aiSummarizer = require('../modules/ai-summarizer');
const decisionEngine = require('../core/decision-engine');

const log = createModuleLogger('CLI');

const program = new Command();

/**
 * Registers all module actions
 */
function registerAllActions() {
    weather.registerActions();
    gmail.registerActions();
    music.registerActions();
    greeting.registerActions();
    aiSummarizer.registerActions();
    decisionEngine.registerActions();
}

/**
 * Executes an action with spinner
 * @param {string} actionName - Action to execute
 * @param {Object} params - Action parameters
 */
async function executeWithSpinner(actionName, params = {}) {
    const action = registry.getAction(actionName);
    const spinner = ora(`Executing: ${action?.description || actionName}...`).start();
    
    try {
        const result = await registry.execute(actionName, params);
        
        if (result.success) {
            spinner.succeed(`${actionName} completed (${result.duration}ms)`);
            return result.result;
        } else {
            spinner.fail(`${actionName} failed: ${result.error}`);
            return null;
        }
    } catch (error) {
        spinner.fail(`Error: ${error.message}`);
        return null;
    }
}

// Configure CLI program
program
    .name('jarvis')
    .description('Jarvis AI Personal Assistant CLI')
    .version('1.0.0');

// Weather command
program
    .command('weather')
    .description('Get current weather')
    .option('-l, --location <location>', 'Location (city,country)')
    .option('-f, --forecast', 'Show forecast')
    .action(async (options) => {
        registerAllActions();
        
        if (options.forecast) {
            const result = await executeWithSpinner('get_forecast', { location: options.location });
            if (result) {
                console.log(chalk.cyan('\n📅 Weather Forecast:\n'));
                result.forecasts.slice(0, 8).forEach(f => {
                    console.log(`   ${f.datetime.toLocaleString()}: ${f.temperature}°${result.units}, ${f.description}`);
                });
            }
        } else {
            const result = await executeWithSpinner('get_weather', { location: options.location });
            if (result) {
                console.log(result.formatted);
            }
        }
    });

// Email command
program
    .command('email')
    .description('Check Gmail inbox')
    .option('-n, --max <number>', 'Maximum emails to fetch', '10')
    .option('-s, --summarize', 'AI summarize emails')
    .action(async (options) => {
        registerAllActions();
        
        const result = await executeWithSpinner('get_unread_emails', { 
            maxResults: parseInt(options.max, 10) 
        });
        
        if (result) {
            console.log(result.formatted);
            
            if (options.summarize && result.emails.length > 0) {
                console.log('');
                const summary = await executeWithSpinner('summarize_emails', { 
                    emails: result.emails 
                });
                
                if (summary) {
                    console.log(chalk.cyan('\n📊 AI Summary:'));
                    console.log(chalk.white(`   ${summary.summary}\n`));
                    
                    if (summary.important?.length > 0) {
                        console.log(chalk.yellow('   Important:'));
                        summary.important.forEach(i => {
                            console.log(chalk.yellow(`   • Email #${i.index}: ${i.reason}`));
                        });
                    }
                    
                    if (summary.actionItems?.length > 0) {
                        console.log(chalk.green('\n   Action Items:'));
                        summary.actionItems.forEach(i => {
                            console.log(chalk.green(`   • ${i.action}`));
                        });
                    }
                }
            }
        }
    });

// Music command
program
    .command('music')
    .description('Music controls')
    .option('-p, --play', 'Play music')
    .option('-s, --stop', 'Stop/pause music')
    .option('-n, --next', 'Skip to next track')
    .option('-u, --uri <uri>', 'Spotify URI to play')
    .option('--local', 'Play local file')
    .action(async (options) => {
        registerAllActions();
        
        if (options.stop) {
            await executeWithSpinner('pause_music');
        } else if (options.next) {
            await executeWithSpinner('next_track');
        } else if (options.play || options.uri) {
            const result = await executeWithSpinner('play_music', {
                uri: options.uri,
                preferLocal: options.local
            });
            if (result) {
                console.log(chalk.green(`\n🎵 ${result.message}\n`));
            }
        } else {
            const status = await executeWithSpinner('music_status');
            if (status) {
                console.log(chalk.cyan('\n🎵 Music Status:'));
                console.log(`   Playing: ${status.isPlaying ? 'Yes' : 'No'}`);
                console.log(`   Player: ${status.currentPlayer || 'None'}`);
                console.log(`   Spotify configured: ${status.spotifyConfigured}`);
                console.log(`   Local file configured: ${status.localFileConfigured}\n`);
            }
        }
    });

// Greeting command
program
    .command('greet')
    .description('Show greeting')
    .action(async () => {
        registerAllActions();
        const result = await executeWithSpinner('greet_user');
        if (result) {
            console.log(result.formatted);
        }
    });

// Ask command (AI)
program
    .command('ask <question...>')
    .description('Ask the AI assistant a question')
    .action(async (question) => {
        registerAllActions();
        const questionText = question.join(' ');
        const result = await executeWithSpinner('ask_ai', { question: questionText });
        if (result) {
            console.log(chalk.cyan('\n🤖 AI Response:\n'));
            console.log(chalk.white(`   ${result}\n`));
        }
    });

// Decide command (AI Decision Engine)
program
    .command('decide')
    .description('Let AI decide what to do')
    .option('-c, --context <context>', 'Additional context')
    .action(async (options) => {
        registerAllActions();
        
        const spinner = ora('AI is thinking...').start();
        
        try {
            const decision = await decisionEngine.makeDecision(
                decisionEngine.CONTEXT_TYPES.USER_REQUEST,
                { userInput: options.context || 'User wants help deciding what to do' }
            );
            
            spinner.succeed('Decision made');
            
            console.log(chalk.cyan('\n🤖 AI Decision:\n'));
            console.log(chalk.gray(`   Reasoning: ${decision.reasoning}\n`));
            
            if (decision.actions.length > 0) {
                console.log(chalk.white('   Suggested actions:'));
                decision.actions.forEach((action, i) => {
                    const actionInfo = registry.getAction(action.name);
                    console.log(chalk.white(`   ${i + 1}. ${action.name}: ${actionInfo?.description || ''}`));
                });
                
                const { execute } = await inquirer.prompt([{
                    type: 'confirm',
                    name: 'execute',
                    message: 'Execute these actions?',
                    default: true
                }]);
                
                if (execute) {
                    const result = await decisionEngine.executeDecision(decision);
                    console.log(chalk.green(`\n✅ Executed ${result.actionsExecuted} actions\n`));
                }
            }
            
            if (decision.message) {
                console.log(chalk.cyan(`\n💬 ${decision.message}\n`));
            }
        } catch (error) {
            spinner.fail(`Error: ${error.message}`);
        }
    });

// Actions command (list available actions)
program
    .command('actions')
    .description('List available actions')
    .option('-c, --category <category>', 'Filter by category')
    .action(async (options) => {
        registerAllActions();
        
        const actions = registry.listActions(options.category);
        const categories = registry.getCategories();
        
        console.log(chalk.cyan('\n📋 Available Actions:\n'));
        
        if (options.category) {
            console.log(chalk.gray(`   Category: ${options.category}\n`));
        } else {
            console.log(chalk.gray(`   Categories: ${categories.join(', ')}\n`));
        }
        
        actions.forEach(action => {
            const status = action.enabled ? chalk.green('✓') : chalk.red('✗');
            console.log(`   ${status} ${chalk.white(action.name)}`);
            console.log(chalk.gray(`      ${action.description}`));
            if (action.triggers.length > 0) {
                console.log(chalk.gray(`      Triggers: ${action.triggers.join(', ')}`));
            }
        });
        
        console.log('');
    });

// Setup Gmail command
program
    .command('setup-gmail')
    .description('Authenticate with Gmail')
    .action(async () => {
        console.log(chalk.cyan('\n📧 Gmail Authentication Setup\n'));
        
        try {
            await gmail.authenticate();
            console.log(chalk.green('\n✅ Gmail authentication successful!\n'));
        } catch (error) {
            console.log(chalk.red(`\n❌ Authentication failed: ${error.message}\n`));
        }
    });

// Interactive mode
program
    .command('interactive')
    .alias('i')
    .description('Start interactive mode')
    .action(async () => {
        registerAllActions();
        
        console.log(chalk.cyan('\n🤖 Jarvis Interactive Mode\n'));
        console.log(chalk.gray('   Type "help" for commands, "exit" to quit\n'));
        
        const runInteractive = async () => {
            while (true) {
                const { input } = await inquirer.prompt([{
                    type: 'input',
                    name: 'input',
                    message: chalk.cyan('Jarvis>')
                }]);
                
                const cmd = input.trim().toLowerCase();
                
                if (cmd === 'exit' || cmd === 'quit' || cmd === 'q') {
                    console.log(chalk.yellow('\n👋 Goodbye!\n'));
                    break;
                }
                
                if (cmd === 'help') {
                    console.log(chalk.cyan('\n   Available commands:'));
                    console.log('   weather    - Get weather');
                    console.log('   email      - Check emails');
                    console.log('   music      - Play music');
                    console.log('   pause      - Pause music');
                    console.log('   greet      - Show greeting');
                    console.log('   ask <q>    - Ask AI a question');
                    console.log('   actions    - List actions');
                    console.log('   exit       - Exit interactive mode\n');
                    continue;
                }
                
                if (cmd === 'weather') {
                    const result = await executeWithSpinner('get_weather');
                    if (result) console.log(result.formatted);
                    continue;
                }
                
                if (cmd === 'email' || cmd === 'emails') {
                    const result = await executeWithSpinner('get_unread_emails', { maxResults: 5 });
                    if (result) console.log(result.formatted);
                    continue;
                }
                
                if (cmd === 'music' || cmd === 'play') {
                    await executeWithSpinner('play_music');
                    continue;
                }
                
                if (cmd === 'pause' || cmd === 'stop') {
                    await executeWithSpinner('pause_music');
                    continue;
                }
                
                if (cmd === 'greet') {
                    const result = await executeWithSpinner('greet_user');
                    if (result) console.log(result.formatted);
                    continue;
                }
                
                if (cmd === 'actions') {
                    const actions = registry.listActions();
                    actions.forEach(a => console.log(`   • ${a.name}: ${a.description}`));
                    continue;
                }
                
                if (cmd.startsWith('ask ')) {
                    const question = cmd.substring(4);
                    const result = await executeWithSpinner('ask_ai', { question });
                    if (result) {
                        console.log(chalk.cyan('\n🤖 ') + chalk.white(result) + '\n');
                    }
                    continue;
                }
                
                // Try to find matching action
                const matches = registry.findActions(cmd);
                if (matches.length > 0) {
                    const result = await executeWithSpinner(matches[0].name);
                    if (result?.formatted) {
                        console.log(result.formatted);
                    } else if (typeof result === 'string') {
                        console.log(result);
                    }
                } else {
                    console.log(chalk.yellow(`   Unknown command: ${cmd}. Type "help" for available commands.\n`));
                }
            }
        };
        
        await runInteractive();
    });

// Briefing command
program
    .command('briefing')
    .description('Get morning briefing')
    .action(async () => {
        registerAllActions();
        
        console.log(chalk.cyan('\n📋 Generating your briefing...\n'));
        
        const data = {};
        
        // Gather data
        const weatherResult = await executeWithSpinner('get_weather');
        if (weatherResult) data.weather = weatherResult.weather;
        
        const emailResult = await executeWithSpinner('get_unread_emails', { maxResults: 5 });
        if (emailResult) data.emails = emailResult.emails;
        
        const greetingResult = await executeWithSpinner('greet_user');
        if (greetingResult) data.greeting = greetingResult;
        
        // Generate AI briefing
        const spinner = ora('AI generating briefing...').start();
        try {
            const briefing = await aiSummarizer.generateMorningBriefing(data);
            spinner.succeed('Briefing ready');
            
            console.log(chalk.cyan('\n' + '═'.repeat(50)));
            console.log(chalk.cyan('   YOUR DAILY BRIEFING'));
            console.log(chalk.cyan('═'.repeat(50) + '\n'));
            console.log(chalk.white(`   ${briefing}\n`));
            console.log(chalk.cyan('═'.repeat(50) + '\n'));
        } catch (error) {
            spinner.fail('Could not generate AI briefing');
        }
    });

// Parse command line arguments
program.parse();

// If no command provided, show help
if (process.argv.length <= 2) {
    program.help();
}
