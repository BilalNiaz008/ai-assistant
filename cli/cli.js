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
const voice = require('../modules/voice');
const apps = require('../modules/apps');

const log = createModuleLogger('CLI');

function cliVoiceMuted() {
    return process.argv.includes('--no-voice');
}

/** Speak fetched CLI results (plain, factual). */
async function speakCliLine(text) {
    if (cliVoiceMuted() || !text || !String(text).trim()) return;
    try {
        const r = await voice.speak(String(text).trim(), { transform: false });
        if (!r.success) {
            log.warn(`CLI voice: ${r.error}`);
        }
    } catch (e) {
        log.warn(`CLI voice failed: ${e.message}`);
    }
}

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
    apps.registerActions();
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
    .description('Jarvis AI Personal Assistant CLI (pass --no-voice anywhere to skip speech)')
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
                await speakCliLine(weather.formatForecastSpeech(result));
            }
        } else {
            const result = await executeWithSpinner('get_weather', { location: options.location });
            if (result) {
                console.log(result.formatted);
                if (result.weather) {
                    await speakCliLine(weather.formatWeatherSpeech(result.weather));
                }
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

            {
                const n = result.emails.length;
                await speakCliLine(
                    n === 0
                        ? 'You have no unread emails.'
                        : `You have ${n} unread email${n === 1 ? '' : 's'}.`
                );
            }
            
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

                    if (summary.summary) {
                        let spoken = summary.summary.replace(/\s+/g, ' ').trim();
                        if (spoken.length > 500) spoken = `${spoken.slice(0, 500)}...`;
                        await speakCliLine(`Email summary. ${spoken}`);
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
                if (result.message) {
                    await speakCliLine(String(result.message).replace(/spotify-api/gi, 'Spotify'));
                }
            }
        } else {
            const status = await executeWithSpinner('music_status');
            if (status) {
                console.log(chalk.cyan('\n🎵 Music Status:'));
                console.log(`   Playing: ${status.isPlaying ? 'Yes' : 'No'}`);
                console.log(`   Player: ${status.currentPlayer || 'None'}`);
                console.log(`   Spotify configured: ${status.spotifyConfigured}`);
                console.log(`   Local file configured: ${status.localFileConfigured}\n`);
                let line = status.isPlaying ? 'Music is playing.' : 'Music is not playing.';
                if (status.currentTrack?.name) {
                    line += ` Now playing ${status.currentTrack.name}`;
                    if (status.currentTrack.artist) {
                        line += ` by ${status.currentTrack.artist}`;
                    }
                    line += '.';
                }
                await speakCliLine(line);
            }
        }
    });

// Chrome command
program
    .command('chrome [url]')
    .description('Open Google Chrome (optionally with URL)')
    .action(async (url) => {
        registerAllActions();
        const result = await executeWithSpinner('open_chrome', { url });
        if (result?.success) {
            console.log(chalk.green(`\n🌐 ${result.message}\n`));
            await speakCliLine(`Opening Chrome${url ? ' with ' + url : ''}`);
        }
    });

// Basecamp command
program
    .command('basecamp')
    .description('Open Basecamp projects')
    .action(async () => {
        registerAllActions();
        const result = await executeWithSpinner('open_basecamp');
        if (result?.success) {
            console.log(chalk.green(`\n📋 ${result.message}\n`));
            await speakCliLine('Opening Basecamp projects');
        }
    });

// Open URL command
program
    .command('open <url>')
    .description('Open a URL in Chrome')
    .option('-b, --browser <browser>', 'Browser to use (chrome, firefox, edge)', 'chrome')
    .action(async (url, options) => {
        registerAllActions();
        const result = await executeWithSpinner('open_url', { url, browser: options.browser });
        if (result?.success) {
            console.log(chalk.green(`\n🌐 ${result.message}\n`));
            await speakCliLine(`Opening ${url}`);
        }
    });

// App command
program
    .command('app <name>')
    .description('Open an application')
    .action(async (name) => {
        registerAllActions();
        const result = await executeWithSpinner('open_app', { name });
        if (result?.success) {
            console.log(chalk.green(`\n🚀 ${result.message}\n`));
            await speakCliLine(`Opening ${name}`);
        } else {
            console.log(chalk.red(`\n❌ ${result?.error || 'Failed to open app'}\n`));
        }
    });

// Bookmarks command
program
    .command('bookmarks')
    .description('List available bookmarks and apps')
    .action(async () => {
        registerAllActions();
        const result = await executeWithSpinner('list_bookmarks');
        if (result) {
            console.log(chalk.cyan('\n📚 Available Bookmarks:\n'));
            Object.entries(result.bookmarks).forEach(([name, url]) => {
                console.log(`   ${chalk.white(name.padEnd(12))} ${chalk.gray(url)}`);
            });
            console.log(chalk.cyan('\n🚀 Available Apps:\n'));
            console.log(`   ${result.apps.join(', ')}\n`);
        }
    });

// Greeting command
program
    .command('greet')
    .description('Show greeting')
    .option('-v, --voice', 'Speak the greeting')
    .action(async (options) => {
        registerAllActions();
        const result = await executeWithSpinner('greet_user', { speak: options.voice });
        if (result) {
            console.log(result.formatted);
        }
    });

// Voice/Say command
program
    .command('say <text...>')
    .description('Speak text aloud (Jarvis voice)')
    .option('--voice <voice>', 'Voice: alloy, echo, fable, onyx, nova, shimmer', 'onyx')
    .option('--speed <speed>', 'Speed: 0.25 to 4.0', '0.95')
    .option('--raw', 'Speak without expressive transformation')
    .action(async (text, options) => {
        const textToSpeak = text.join(' ');
        console.log(chalk.cyan(`\n🔊 Speaking: "${textToSpeak}"\n`));
        
        const spinner = ora('Generating speech...').start();
        
        try {
            const result = await voice.speak(textToSpeak, {
                voice: options.voice,
                speed: parseFloat(options.speed),
                transform: !options.raw
            });
            
            if (result.success) {
                spinner.succeed(`Spoken via ${result.method}`);
            } else {
                spinner.fail(`Speech failed: ${result.error}`);
            }
        } catch (error) {
            spinner.fail(`Error: ${error.message}`);
        }
    });

// Voice settings command
program
    .command('voice')
    .description('Voice settings and test')
    .option('-t, --test', 'Test voice output')
    .option('-s, --set-voice <voice>', 'Set default voice')
    .option('--speed <speed>', 'Set default speed')
    .action(async (options) => {
        if (options.setVoice) {
            const result = voice.setVoice(options.setVoice);
            if (result.success) {
                console.log(chalk.green(`\n✅ Voice set to: ${result.voice}\n`));
            } else {
                console.log(chalk.red(`\n❌ ${result.error}\n`));
            }
            return;
        }
        
        if (options.speed) {
            const result = voice.setSpeed(parseFloat(options.speed));
            if (result.success) {
                console.log(chalk.green(`\n✅ Speed set to: ${result.speed}\n`));
            } else {
                console.log(chalk.red(`\n❌ ${result.error}\n`));
            }
            return;
        }
        
        if (options.test) {
            console.log(chalk.cyan('\n🔊 Voice Test\n'));
            const spinner = ora('Testing voice...').start();
            
            const result = await voice.speak(
                "Good evening, Sir. All systems are online and ready. How may I assist you today?",
                { transform: true }
            );
            
            if (result.success) {
                spinner.succeed(`Voice test successful (${result.method})`);
            } else {
                spinner.fail(`Voice test failed: ${result.error}`);
            }
            return;
        }
        
        // Show current settings
        const settings = voice.getSettings();
        console.log(chalk.cyan('\n🔊 Voice Settings:\n'));
        console.log(`   Model: ${settings.model}`);
        console.log(`   Voice: ${settings.voice}`);
        console.log(`   Speed: ${settings.speed}`);
        console.log(`   Available voices: ${settings.availableVoices.join(', ')}\n`);
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
            let spoken = String(result).replace(/\s+/g, ' ').trim();
            if (spoken.length > 800) spoken = `${spoken.slice(0, 800)}...`;
            await speakCliLine(`Here's the answer. ${spoken}`);
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
                await speakCliLine(decision.message);
            } else if (decision.reasoning) {
                let r = decision.reasoning.replace(/\s+/g, ' ').trim();
                if (r.length > 400) r = `${r.slice(0, 400)}...`;
                await speakCliLine(r);
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
                    console.log('   weather      - Get weather (speaks summary)');
                    console.log('   email        - Check emails (speaks count)');
                    console.log('   music        - Play music (speaks status)');
                    console.log('   pause        - Pause music');
                    console.log('   greet        - Show greeting');
                    console.log('   say <text>   - Speak text aloud');
                    console.log('   chrome       - Open Google Chrome');
                    console.log('   chrome <url> - Open URL in Chrome');
                    console.log('   basecamp     - Open Basecamp projects');
                    console.log('   open <url>   - Open any URL');
                    console.log('   app <name>   - Open an app (vscode, notepad, etc.)');
                    console.log('   bookmarks    - List saved bookmarks');
                    console.log('   ask <q>      - Ask AI a question');
                    console.log('   actions      - List actions');
                    console.log('   exit         - Exit interactive mode\n');
                    continue;
                }
                
                if (cmd === 'weather') {
                    const result = await executeWithSpinner('get_weather');
                    if (result) {
                        console.log(result.formatted);
                        if (result.weather) {
                            await speakCliLine(weather.formatWeatherSpeech(result.weather));
                        }
                    }
                    continue;
                }
                
                if (cmd === 'email' || cmd === 'emails') {
                    const result = await executeWithSpinner('get_unread_emails', { maxResults: 5 });
                    if (result) {
                        console.log(result.formatted);
                        const n = result.emails.length;
                        await speakCliLine(
                            n === 0
                                ? 'You have no unread emails.'
                                : `You have ${n} unread email${n === 1 ? '' : 's'}.`
                        );
                    }
                    continue;
                }
                
                if (cmd === 'music' || cmd === 'play') {
                    const result = await executeWithSpinner('play_music');
                    if (result?.message) {
                        await speakCliLine(String(result.message).replace(/spotify-api/gi, 'Spotify'));
                    }
                    continue;
                }
                
                if (cmd === 'pause' || cmd === 'stop') {
                    await executeWithSpinner('pause_music');
                    continue;
                }
                
                if (cmd === 'greet') {
                    const result = await executeWithSpinner('greet_user', { speak: true });
                    if (result) console.log(result.formatted);
                    continue;
                }
                
                if (cmd === 'chrome' || cmd.startsWith('chrome ')) {
                    const url = cmd === 'chrome' ? null : cmd.substring(7).trim();
                    const result = await executeWithSpinner('open_chrome', { url });
                    if (result?.success) {
                        console.log(chalk.green(`   ${result.message}`));
                        await speakCliLine(`Opening Chrome${url ? ' with ' + url : ''}`);
                    }
                    continue;
                }
                
                if (cmd === 'basecamp') {
                    const result = await executeWithSpinner('open_basecamp');
                    if (result?.success) {
                        console.log(chalk.green(`   ${result.message}`));
                        await speakCliLine('Opening Basecamp projects');
                    }
                    continue;
                }
                
                if (cmd.startsWith('open ')) {
                    const url = cmd.substring(5).trim();
                    const result = await executeWithSpinner('open_url', { url, browser: 'chrome' });
                    if (result?.success) {
                        console.log(chalk.green(`   ${result.message}`));
                        await speakCliLine(`Opening ${url}`);
                    }
                    continue;
                }
                
                if (cmd.startsWith('app ')) {
                    const appName = cmd.substring(4).trim();
                    const result = await executeWithSpinner('open_app', { name: appName });
                    if (result?.success) {
                        console.log(chalk.green(`   ${result.message}`));
                        await speakCliLine(`Opening ${appName}`);
                    } else {
                        console.log(chalk.red(`   ${result?.error || 'Failed to open app'}`));
                    }
                    continue;
                }
                
                if (cmd === 'bookmarks') {
                    const result = await executeWithSpinner('list_bookmarks');
                    if (result) {
                        console.log(chalk.cyan('\n   Bookmarks:'));
                        Object.entries(result.bookmarks).forEach(([name, url]) => {
                            console.log(`   ${name.padEnd(12)} ${chalk.gray(url)}`);
                        });
                        console.log(chalk.cyan('\n   Apps:'));
                        console.log(`   ${result.apps.join(', ')}\n`);
                    }
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
                        let spoken = String(result).replace(/\s+/g, ' ').trim();
                        if (spoken.length > 800) spoken = `${spoken.slice(0, 800)}...`;
                        await speakCliLine(`Here's the answer. ${spoken}`);
                    }
                    continue;
                }
                
                if (cmd.startsWith('say ')) {
                    const textToSpeak = cmd.substring(4);
                    console.log(chalk.cyan(`\n🔊 Speaking...\n`));
                    if (!cliVoiceMuted()) {
                        await voice.speak(textToSpeak);
                    }
                    continue;
                }
                
                // Try to find matching action
                const matches = registry.findActions(cmd);
                if (matches.length > 0) {
                    const actionName = matches[0].name;
                    const result = await executeWithSpinner(actionName);
                    if (result?.formatted) {
                        console.log(result.formatted);
                        if (actionName === 'get_weather' && result.weather) {
                            await speakCliLine(weather.formatWeatherSpeech(result.weather));
                        }
                        if (actionName === 'get_unread_emails' && result.emails) {
                            const n = result.emails.length;
                            await speakCliLine(
                                n === 0
                                    ? 'You have no unread emails.'
                                    : `You have ${n} unread email${n === 1 ? '' : 's'}.`
                            );
                        }
                    } else if (typeof result === 'string') {
                        console.log(result);
                        await speakCliLine(result.slice(0, 600));
                    } else if (result?.message) {
                        await speakCliLine(String(result.message));
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
            
            if (!cliVoiceMuted()) {
                let spoken = briefing.replace(/\s+/g, ' ').trim();
                if (spoken.length > 1200) spoken = `${spoken.slice(0, 1200)}...`;
                await voice.speak(spoken, { transform: false }).catch(() => {});
            }
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
