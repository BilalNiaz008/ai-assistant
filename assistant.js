/**
 * Jarvis AI Assistant - Main Orchestrator
 * 
 * Production-ready personal AI desktop assistant
 * Runs on system startup and provides intelligent assistance
 */

require('dotenv').config();

const chalk = require('chalk');
const ora = require('ora');
const { config, validateConfig, getTimeOfDay } = require('./config/config');
const { logger, createModuleLogger } = require('./core/logger');
const { registry } = require('./core/action-registry');

// Import modules
const weather = require('./modules/weather');
const gmail = require('./modules/gmail');
const music = require('./modules/music');
const greeting = require('./modules/greeting');
const aiSummarizer = require('./modules/ai-summarizer');
const decisionEngine = require('./core/decision-engine');
const voice = require('./modules/voice');

const log = createModuleLogger('Assistant');

// Voice mode (enabled by default)
let voiceEnabled = true;

/** Speak a factual startup line (no “expressive” word stretching). */
async function speakStartupLine(text) {
    if (!voiceEnabled || !text || !String(text).trim()) return;
    try {
        const r = await voice.speak(String(text).trim(), { transform: false });
        if (!r.success) {
            log.warn(`Startup voice: ${r.error}`);
        }
    } catch (e) {
        log.warn(`Startup voice failed: ${e.message}`);
    }
}

/**
 * Displays the Jarvis banner
 */
function displayBanner() {
    console.log(chalk.cyan(`
     ██╗ █████╗ ██████╗ ██╗   ██╗██╗███████╗
     ██║██╔══██╗██╔══██╗██║   ██║██║██╔════╝
     ██║███████║██████╔╝██║   ██║██║███████╗
██   ██║██╔══██║██╔══██╗╚██╗ ██╔╝██║╚════██║
╚█████╔╝██║  ██║██║  ██║ ╚████╔╝ ██║███████║
 ╚════╝ ╚═╝  ╚═╝╚═╝  ╚═╝  ╚═══╝  ╚═╝╚══════╝
    `));
    console.log(chalk.gray('    Personal AI Assistant v1.0.0'));
    console.log(chalk.gray('    ─'.repeat(25)));
    console.log('');
}

/**
 * Registers all module actions with the registry
 */
function registerAllActions() {
    log.info('Registering module actions...');
    
    weather.registerActions();
    gmail.registerActions();
    music.registerActions();
    greeting.registerActions();
    aiSummarizer.registerActions();
    decisionEngine.registerActions();
    
    const stats = registry.getStats();
    log.info(`Registered ${stats.totalActions} actions in ${stats.categories} categories`);
}

/**
 * Validates configuration and displays warnings
 * @returns {boolean} True if critical config is valid
 */
function checkConfiguration() {
    const validation = validateConfig();
    
    if (validation.warnings.length > 0) {
        console.log(chalk.yellow('\n⚠️  Configuration Warnings:'));
        validation.warnings.forEach(warning => {
            console.log(chalk.yellow(`   - ${warning}`));
        });
    }
    
    if (!validation.isValid) {
        console.log(chalk.red('\n❌ Missing Required Configuration:'));
        validation.missing.forEach(key => {
            console.log(chalk.red(`   - ${key}`));
        });
        console.log(chalk.gray('\n   Please check your .env file and add the missing values.'));
        return false;
    }
    
    return true;
}

/**
 * Runs the default startup sequence without AI decision engine
 * @returns {Promise<Object>} Startup results
 */
async function runDefaultStartup() {
    const results = {
        greeting: null,
        weather: null,
        emails: null,
        emailSummary: null,
        music: null
    };

    // Step 1: Generate greeting (and speak if voice enabled)
    const greetingSpinner = ora('Generating greeting...').start();
    try {
        const greetingData = greeting.generateGreeting();
        results.greeting = greetingData;
        greetingSpinner.succeed('Greeting ready');
        console.log(greeting.formatGreeting(greetingData));
        
        // Speak the greeting
        if (voiceEnabled) {
            const voiceSpinner = ora('Speaking greeting...').start();
            try {
                const voiceResult = await greeting.speakGreeting();
                if (voiceResult.speechResult?.success) {
                    voiceSpinner.succeed(`Voice: ${voiceResult.speechResult.method}`);
                } else {
                    voiceSpinner.warn(`Voice unavailable: ${voiceResult.speechResult?.error || 'unknown'}`);
                }
            } catch (voiceErr) {
                voiceSpinner.warn(`Voice error: ${voiceErr.message}`);
                log.debug(`Voice greeting failed: ${voiceErr.message}`);
            }
        }
    } catch (error) {
        greetingSpinner.fail('Greeting failed');
        log.error(`Greeting error: ${error.message}`);
    }

    // Step 2: Fetch weather (if enabled)
    if (config.features.weather) {
        const weatherSpinner = ora('Fetching weather...').start();
        try {
            const weatherData = await weather.getWeather();
            results.weather = weatherData;
            weatherSpinner.succeed('Weather fetched');
            console.log(weather.formatWeather(weatherData));
            console.log('');
            await speakStartupLine(weather.formatWeatherSpeech(weatherData));
        } catch (error) {
            weatherSpinner.fail(`Weather unavailable: ${error.message}`);
            log.error(`Weather error: ${error.message}`);
        }
    }

    // Step 3: Fetch emails (if enabled)
    if (config.features.email) {
        const emailSpinner = ora('Checking emails...').start();
        try {
            const emails = await gmail.getUnreadEmails({ maxResults: 10 });
            results.emails = emails;
            emailSpinner.succeed(`Found ${emails.length} unread emails`);
            
            {
                const n = emails.length;
                const line = n === 0
                    ? 'You have no unread emails.'
                    : `You have ${n} unread email${n === 1 ? '' : 's'}.`;
                await speakStartupLine(line);
            }

            if (emails.length > 0) {
                console.log(gmail.formatEmails(emails));
                console.log('');
                
                // Step 4: Summarize emails (if AI is enabled)
                if (config.features.aiSummary && emails.length > 0) {
                    const summarySpinner = ora('AI analyzing emails...').start();
                    try {
                        const summary = await aiSummarizer.summarizeEmails(emails);
                        results.emailSummary = summary;
                        summarySpinner.succeed('Email analysis complete');
                        
                        console.log(chalk.cyan('\n📊 AI Email Summary:'));
                        console.log(chalk.white(`   ${summary.summary}`));
                        
                        if (summary.important && summary.important.length > 0) {
                            console.log(chalk.yellow('\n   ⚠️  Important:'));
                            summary.important.forEach(item => {
                                console.log(chalk.yellow(`      • Email #${item.index}: ${item.reason}`));
                            });
                        }
                        
                        if (summary.actionItems && summary.actionItems.length > 0) {
                            console.log(chalk.green('\n   ✅ Action Items:'));
                            summary.actionItems.forEach(item => {
                                console.log(chalk.green(`      • ${item.action}`));
                            });
                        }
                        console.log('');

                        if (summary?.summary) {
                            let spoken = summary.summary.replace(/\s+/g, ' ').trim();
                            if (spoken.length > 500) {
                                spoken = `${spoken.slice(0, 500)}...`;
                            }
                            await speakStartupLine(`Email summary. ${spoken}`);
                        }
                    } catch (error) {
                        summarySpinner.fail('Email analysis unavailable');
                        log.error(`Summary error: ${error.message}`);
                    }
                }
            }
        } catch (error) {
            if (error.message.includes('authenticate')) {
                emailSpinner.warn('Gmail requires authentication');
                console.log(chalk.yellow('   Run with --setup-gmail to authenticate'));
            } else {
                emailSpinner.fail(`Email check failed: ${error.message}`);
            }
            log.error(`Email error: ${error.message}`);
        }
    }

    // Step 5: Play music (if enabled)
    if (config.features.music) {
        const musicSpinner = ora('Starting music...').start();
        try {
            const musicResult = await music.playMusic();
            results.music = musicResult;
            if (musicResult.success) {
                musicSpinner.succeed(`Music started (${musicResult.player})`);
                if (musicResult.message) {
                    const msg = String(musicResult.message)
                        .replace(/spotify-api/gi, 'Spotify')
                        .replace(/\bspotify\b/gi, 'Spotify');
                    await speakStartupLine(msg);
                }
            } else {
                musicSpinner.warn('Music unavailable');
            }
        } catch (error) {
            musicSpinner.fail('Music playback failed');
            log.error(`Music error: ${error.message}`);
        }
    }

    return results;
}

/**
 * Runs the AI-powered startup sequence
 * @returns {Promise<Object>} Startup results
 */
async function runAIStartup() {
    console.log(chalk.cyan('\n🤖 AI Decision Engine Active\n'));
    
    const spinner = ora('AI is deciding what to do...').start();
    
    try {
        const result = await decisionEngine.startupDecision();
        spinner.succeed('AI decision complete');
        
        if (result.decision.message) {
            console.log(chalk.cyan(`\n💬 ${result.decision.message}`));
        }
        
        console.log(chalk.gray(`\n   Reasoning: ${result.decision.reasoning}`));
        console.log(chalk.gray(`   Actions executed: ${result.execution.actionsExecuted}`));
        
        // Display action results (and speak each fetched item when voice is on)
        for (const actionResult of result.execution.actionResults) {
            if (actionResult.success) {
                if (actionResult.action === 'greet_user' && actionResult.result?.formatted) {
                    console.log(actionResult.result.formatted);
                    if (voiceEnabled) {
                        const r = actionResult.result;
                        let line = r.greeting || '';
                        if (r.additionalMessage) line += ` ${r.additionalMessage}`;
                        await speakStartupLine(line.trim());
                    }
                } else if (actionResult.action === 'get_weather' && actionResult.result?.formatted) {
                    console.log(actionResult.result.formatted);
                    if (voiceEnabled && actionResult.result.weather) {
                        await speakStartupLine(weather.formatWeatherSpeech(actionResult.result.weather));
                    }
                } else if (actionResult.action === 'get_unread_emails') {
                    const emails = actionResult.result?.emails || [];
                    console.log(gmail.formatEmails(emails));
                    if (voiceEnabled) {
                        const n = emails.length;
                        await speakStartupLine(
                            n === 0
                                ? 'You have no unread emails.'
                                : `You have ${n} unread email${n === 1 ? '' : 's'}.`
                        );
                    }
                } else if (actionResult.action === 'play_music' && voiceEnabled && actionResult.result?.message) {
                    const msg = String(actionResult.result.message)
                        .replace(/spotify-api/gi, 'Spotify');
                    await speakStartupLine(msg);
                }
            }
        }

        return result;
    } catch (error) {
        spinner.fail('AI startup failed, falling back to default');
        log.error(`AI startup error: ${error.message}`);
        return await runDefaultStartup();
    }
}

/**
 * Main startup function
 */
async function startup() {
    displayBanner();
    
    log.info('Jarvis starting up...');
    console.log(chalk.gray('   Initializing...\n'));
    
    // Check configuration
    if (!checkConfiguration()) {
        console.log(chalk.red('\n   Cannot start without required configuration.\n'));
        process.exit(1);
    }
    
    // Register all actions
    registerAllActions();
    
    // Run startup sequence
    let results;
    if (config.features.decisionEngine && config.features.aiSummary) {
        results = await runAIStartup();
    } else {
        results = await runDefaultStartup();
    }
    
    // Final status
    console.log(chalk.green('\n✨ Jarvis is ready to assist you!\n'));
    console.log(chalk.gray('   Type "jarvis --help" for available commands'));
    console.log(chalk.gray('   Press Ctrl+C to exit\n'));
    
    return results;
}

/**
 * Handles command line arguments
 */
function handleArgs() {
    const args = process.argv.slice(2);
    
    if (args.includes('--help') || args.includes('-h')) {
        console.log(`
Jarvis AI Assistant

Usage: node assistant.js [options]

Options:
  --help, -h          Show this help message
  --setup-gmail       Run Gmail OAuth authentication
  --no-music          Skip music playback
  --no-weather        Skip weather fetch
  --no-email          Skip email check
  --no-ai             Disable AI features
  --no-voice          Disable voice output
  --voice-only        Test voice output and exit
  --quiet             Minimal output

Examples:
  node assistant.js                    # Normal startup with voice
  node assistant.js --setup-gmail      # Authenticate Gmail
  node assistant.js --no-music         # Start without music
  node assistant.js --no-voice         # Start without voice
  node assistant.js --voice-only       # Test voice output
        `);
        process.exit(0);
    }
    
    if (args.includes('--setup-gmail')) {
        console.log(chalk.cyan('\n📧 Gmail Authentication Setup\n'));
        gmail.authenticate()
            .then(() => {
                console.log(chalk.green('\n✅ Gmail authentication successful!\n'));
                process.exit(0);
            })
            .catch((error) => {
                console.log(chalk.red(`\n❌ Authentication failed: ${error.message}\n`));
                process.exit(1);
            });
        return true;
    }
    
    // Voice test mode
    if (args.includes('--voice-only')) {
        console.log(chalk.cyan('\n🔊 Voice Test Mode\n'));
        const testText = "Good evening, Sir. Your voice assistant is now online and ready to serve. How may I assist you today?";
        console.log(chalk.gray(`   Speaking: "${testText}"\n`));
        voice.speak(testText)
            .then((result) => {
                if (result.success) {
                    console.log(chalk.green(`\n✅ Voice test successful (${result.method})\n`));
                } else {
                    console.log(chalk.red(`\n❌ Voice test failed: ${result.error}\n`));
                }
                process.exit(0);
            })
            .catch((error) => {
                console.log(chalk.red(`\n❌ Voice test failed: ${error.message}\n`));
                process.exit(1);
            });
        return true;
    }
    
    // Apply feature flags from args
    if (args.includes('--no-music')) {
        config.features.music = false;
    }
    if (args.includes('--no-weather')) {
        config.features.weather = false;
    }
    if (args.includes('--no-email')) {
        config.features.email = false;
    }
    if (args.includes('--no-ai')) {
        config.features.aiSummary = false;
        config.features.decisionEngine = false;
    }
    if (args.includes('--no-voice')) {
        voiceEnabled = false;
    }
    
    return false;
}

/**
 * Graceful shutdown handler
 */
function setupShutdownHandlers() {
    process.on('SIGINT', async () => {
        console.log(chalk.yellow('\n\n👋 Goodbye! Jarvis shutting down...\n'));
        log.info('Jarvis shutting down (SIGINT)');
        
        // Speak goodbye if voice enabled (quick, don't wait too long)
        if (voiceEnabled) {
            try {
                await Promise.race([
                    voice.speak("Goodbye, Sir. Until next time.", { transform: false }),
                    new Promise(resolve => setTimeout(resolve, 3000))
                ]);
            } catch (e) { /* ignore */ }
        }
        
        process.exit(0);
    });
    
    process.on('SIGTERM', () => {
        log.info('Jarvis shutting down (SIGTERM)');
        process.exit(0);
    });
    
    process.on('uncaughtException', (error) => {
        log.error(`Uncaught exception: ${error.message}`, { stack: error.stack });
        console.error(chalk.red(`\n❌ Fatal error: ${error.message}\n`));
        process.exit(1);
    });
    
    process.on('unhandledRejection', (reason, promise) => {
        log.error(`Unhandled rejection: ${reason}`);
        console.error(chalk.red(`\n⚠️  Unhandled promise rejection: ${reason}\n`));
    });
}

// Main execution
if (require.main === module) {
    setupShutdownHandlers();
    
    const isSetupMode = handleArgs();
    
    if (!isSetupMode) {
        startup().catch((error) => {
            log.error(`Startup failed: ${error.message}`);
            console.error(chalk.red(`\n❌ Startup failed: ${error.message}\n`));
            process.exit(1);
        });
    }
}

module.exports = {
    startup,
    registerAllActions,
    registry,
    voice,
    isVoiceEnabled: () => voiceEnabled
};
