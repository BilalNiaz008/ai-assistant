/**
 * Voice Module
 * High-quality text-to-speech with expressive transformation
 * Transforms plain text into natural, Jarvis-like speech
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { exec, execFile, spawn } = require('child_process');
const { promisify } = require('util');
const execFileAsync = promisify(execFile);
const { config } = require('../config/config');
const { createModuleLogger } = require('../core/logger');

const log = createModuleLogger('Voice');

// Voice settings
const VOICE_SETTINGS = {
    model: 'tts-1-hd',
    voice: 'onyx', // Options: alloy, echo, fable, onyx, nova, shimmer (onyx = deep, authoritative)
    speed: 0.95,
    outputDir: path.join(__dirname, '..', '.voice-cache')
};

// Ensure cache directory exists
if (!fs.existsSync(VOICE_SETTINGS.outputDir)) {
    fs.mkdirSync(VOICE_SETTINGS.outputDir, { recursive: true });
}

/**
 * Transforms plain text into expressive speech text
 * Adds pauses, emphasis, and stretches words for a natural feel
 * @param {string} text - Plain text input
 * @returns {string} Transformed expressive text
 */
function transformToExpressive(text) {
    let expressive = text;

    // Stretch greeting words for warmth
    const stretchWords = {
        'Good': 'Goood',
        'good': 'goood',
        'Hello': 'Hellooo',
        'hello': 'hellooo',
        'Hey': 'Heey',
        'hey': 'heey',
        'Hi': 'Hii',
        'Welcome': 'Welcoome',
        'welcome': 'welcoome',
        'Well': 'Weell',
        'well': 'weell',
        'So': 'Sooo',
        'so': 'sooo',
        'Now': 'Noow',
        'now': 'noow',
        'Alright': 'Alriight',
        'alright': 'alriight',
        'Perfect': 'Peerfect',
        'perfect': 'peerfect',
        'Great': 'Greaaat',
        'great': 'greaaat',
        'Excellent': 'Exceeellent',
        'excellent': 'exceeellent'
    };

    // Apply word stretching (only at word boundaries)
    for (const [word, stretched] of Object.entries(stretchWords)) {
        const regex = new RegExp(`\\b${word}\\b`, 'g');
        expressive = expressive.replace(regex, stretched);
    }

    // Add dramatic pause after greetings
    expressive = expressive.replace(
        /(Goood morning|Goood afternoon|Goood evening|Hellooo|Heey|Hii)\s*,?\s*/gi,
        '$1... '
    );

    // Add pause before names (if preceded by greeting)
    expressive = expressive.replace(
        /\.\.\.\s+([A-Z][a-z]+)([!.,])/g,
        '... $1$2'
    );

    // Add slight pause after "Sir" or names at the end
    expressive = expressive.replace(/(\w+)(!)(\s|$)/g, '$1$2$3');

    // Add pause before questions
    expressive = expressive.replace(/([.!])\s+(How|What|Where|When|Why|Would|Could|Can|Shall|Is|Are)/g, '$1 ... $2');

    // Add pause after transitional phrases
    const transitions = [
        'However', 'Therefore', 'Furthermore', 'Additionally', 'Meanwhile',
        'In fact', 'Actually', 'By the way', 'Speaking of which', 'On that note',
        'First', 'Second', 'Third', 'Finally', 'Lastly', 'Also', 'Next'
    ];
    
    for (const transition of transitions) {
        const regex = new RegExp(`\\b${transition}\\b,?`, 'gi');
        expressive = expressive.replace(regex, `${transition}...`);
    }

    // Add emphasis pauses around important words
    expressive = expressive.replace(/\b(important|urgent|critical|warning|alert|attention)\b/gi, '... $1 ...');

    // Soften periods into slight pauses for flow (but not too many)
    expressive = expressive.replace(/\.\s+([A-Z])/g, '. ... $1');

    // Clean up multiple pauses
    expressive = expressive.replace(/\.{4,}/g, '...');
    expressive = expressive.replace(/(\.\.\.\s*){2,}/g, '... ');

    // Add slight dramatic flair to farewells
    expressive = expressive.replace(/\b(Goodbye|Farewell|See you|Take care)\b/gi, '... $1');

    return expressive.trim();
}

/**
 * Generates speech audio using OpenAI TTS API
 * @param {string} text - Text to convert to speech
 * @returns {Promise<string>} Path to generated audio file
 */
async function generateSpeechOpenAI(text) {
    const OpenAI = require('openai');
    
    if (!config.ai.openai.apiKey) {
        throw new Error('OpenAI API key not configured');
    }

    const openai = new OpenAI({ apiKey: config.ai.openai.apiKey });
    
    const fileName = `speech_${Date.now()}.mp3`;
    const filePath = path.join(VOICE_SETTINGS.outputDir, fileName);

    log.debug(`Generating speech with OpenAI TTS (voice: ${VOICE_SETTINGS.voice})...`);

    const response = await openai.audio.speech.create({
        model: VOICE_SETTINGS.model,
        voice: VOICE_SETTINGS.voice,
        input: text,
        speed: VOICE_SETTINGS.speed
    });

    const buffer = Buffer.from(await response.arrayBuffer());
    fs.writeFileSync(filePath, buffer);

    log.debug(`Speech generated: ${filePath}`);
    return filePath;
}

/**
 * Generates speech using Windows SAPI (fallback)
 * @param {string} text - Text to speak
 * @returns {Promise<void>}
 */
async function speakWithSAPI(text) {
    const tmpBase = path.join(os.tmpdir(), `jarvis-sapi-${process.pid}-${Date.now()}`);
    const txtPath = `${tmpBase}.txt`;
    const ps1Path = `${tmpBase}.ps1`;
    const txtLiteral = txtPath.replace(/'/g, "''");

    const ps1Content = [
        'Add-Type -AssemblyName System.Speech',
        '$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer',
        '$synth.Rate = 0',
        '$synth.Volume = 100',
        `$txt = Get-Content -LiteralPath '${txtLiteral}' -Raw -Encoding UTF8`,
        '$null = $synth.Speak($txt)'
    ].join('\r\n');

    await fs.promises.writeFile(txtPath, text, 'utf8');
    await fs.promises.writeFile(ps1Path, ps1Content, 'utf8');

    try {
        await execFileAsync('powershell.exe', [
            '-NoProfile',
            '-NonInteractive',
            '-ExecutionPolicy',
            'Bypass',
            '-File',
            ps1Path
        ]);
    } finally {
        await fs.promises.unlink(txtPath).catch(() => {});
        await fs.promises.unlink(ps1Path).catch(() => {});
    }
}

/**
 * Plays an audio file using the system's default player
 * @param {string} filePath - Path to audio file
 * @returns {Promise<void>}
 */
function tryPlayWithFfplay(normalizedPath) {
    return new Promise((resolve, reject) => {
        const child = spawn('ffplay', [
            '-nodisp',
            '-autoexit',
            '-loglevel',
            'quiet',
            normalizedPath
        ], { stdio: 'ignore', windowsHide: true });
        child.on('error', () => reject(new Error('ffplay not available')));
        child.on('close', (code) => {
            if (code === 0 || code === null) resolve();
            else reject(new Error(`ffplay exited ${code}`));
        });
    });
}

function tryPlayWithVlc(normalizedPath) {
    return new Promise((resolve, reject) => {
        const child = spawn('vlc', [
            '--intf', 'dummy',
            '--play-and-exit',
            '--quiet',
            normalizedPath
        ], { stdio: 'ignore', windowsHide: true });
        child.on('error', () => reject(new Error('vlc not available')));
        child.on('close', () => resolve());
    });
}

/**
 * Windows: play MP3/WAV and wait until done (PresentationCore MediaPlayer).
 */
function playAudioWindowsMediaPlayer(normalizedPath) {
    const ps1Path = path.join(os.tmpdir(), `jarvis-play-${process.pid}-${Date.now()}.ps1`);
    const ps1 = [
        'param([string]$Path)',
        'Add-Type -AssemblyName PresentationCore',
        '$mp = New-Object System.Windows.Media.MediaPlayer',
        '$mp.Volume = 1.0',
        '$full = [System.IO.Path]::GetFullPath($Path)',
        '$mp.Open([uri]$full)',
        '$mp.Play()',
        'Start-Sleep -Milliseconds 600',
        '$deadline = [datetime]::UtcNow.AddMinutes(3)',
        'while ([datetime]::UtcNow -lt $deadline) {',
        '  Start-Sleep -Milliseconds 300',
        '  if ($mp.NaturalDuration.HasTimeSpan -and $mp.NaturalDuration.TimeSpan.TotalSeconds -gt 0 -and $mp.Position -ge $mp.NaturalDuration.TimeSpan) { break }',
        '}',
        '$mp.Close()'
    ].join('\r\n');

    return new Promise((resolve, reject) => {
        fs.writeFile(ps1Path, ps1, 'utf8', (writeErr) => {
            if (writeErr) {
                reject(writeErr);
                return;
            }
            execFile(
                'powershell.exe',
                ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', ps1Path, '-Path', normalizedPath],
                { windowsHide: false },
                (err) => {
                    fs.unlink(ps1Path, () => {});
                    if (err) reject(err);
                    else resolve();
                }
            );
        });
    });
}

async function playAudio(filePath) {
    return new Promise((resolve, reject) => {
        const platform = process.platform;
        const normalizedPath = path.resolve(filePath);

        log.info(`Playing audio: ${normalizedPath}`);

        if (platform === 'win32') {
            (async () => {
                try {
                    await tryPlayWithFfplay(normalizedPath);
                    resolve();
                } catch {
                    try {
                        await tryPlayWithVlc(normalizedPath);
                        resolve();
                    } catch {
                        try {
                            await playAudioWindowsMediaPlayer(normalizedPath);
                            resolve();
                        } catch (e) {
                            log.warn(`Windows audio playback failed: ${e.message}`);
                            reject(e);
                        }
                    }
                }
            })();
        } else if (platform === 'darwin') {
            exec(`afplay "${normalizedPath}"`, (error) => {
                if (error) {
                    log.error(`Audio playback error: ${error.message}`);
                    reject(error);
                } else {
                    resolve();
                }
            });
        } else {
            // Linux
            exec(`mpv --no-video "${normalizedPath}" 2>/dev/null || ffplay -nodisp -autoexit "${normalizedPath}" 2>/dev/null || aplay "${normalizedPath}"`, (error) => {
                if (error) {
                    log.error(`Audio playback error: ${error.message}`);
                    reject(error);
                } else {
                    resolve();
                }
            });
        }
    });
}

/**
 * Main speak function - converts text to expressive speech and plays it
 * @param {string} text - Text to speak
 * @param {Object} options - Speech options
 * @param {boolean} options.transform - Whether to apply expressive transformation (default: true)
 * @param {string} options.voice - Voice to use (alloy, echo, fable, onyx, nova, shimmer)
 * @param {number} options.speed - Speech speed (0.25 to 4.0, default: 0.95)
 * @param {boolean} options.cache - Whether to cache audio (default: false)
 * @returns {Promise<Object>} Result with success status
 */
async function speak(text, options = {}) {
    const {
        transform = true,
        voice = VOICE_SETTINGS.voice,
        speed = VOICE_SETTINGS.speed,
        cache = false
    } = options;

    if (!text || text.trim().length === 0) {
        log.warn('Empty text provided to speak()');
        return { success: false, error: 'Empty text' };
    }

    try {
        // Transform text for expressive speech
        const expressiveText = transform ? transformToExpressive(text) : text;
        log.info(`Speaking: "${text.substring(0, 50)}${text.length > 50 ? '...' : ''}"`);
        log.debug(`Transformed: "${expressiveText.substring(0, 80)}${expressiveText.length > 80 ? '...' : ''}"`);

        // Try OpenAI TTS first (high quality)
        if (config.ai.openai.apiKey) {
            try {
                // Temporarily override voice settings if provided
                const originalVoice = VOICE_SETTINGS.voice;
                const originalSpeed = VOICE_SETTINGS.speed;
                VOICE_SETTINGS.voice = voice;
                VOICE_SETTINGS.speed = speed;

                const audioPath = await generateSpeechOpenAI(expressiveText);
                
                // Restore settings
                VOICE_SETTINGS.voice = originalVoice;
                VOICE_SETTINGS.speed = originalSpeed;

                try {
                    await playAudio(audioPath);
                } catch (playErr) {
                    log.warn(`OpenAI MP3 playback failed, falling back to SAPI: ${playErr.message}`);
                    if (fs.existsSync(audioPath)) {
                        try { fs.unlinkSync(audioPath); } catch (_) { /* ignore */ }
                    }
                    if (process.platform === 'win32') {
                        await speakWithSAPI(expressiveText);
                        return {
                            success: true,
                            method: 'windows-sapi',
                            text: expressiveText
                        };
                    }
                    throw playErr;
                }

                // Clean up if not caching
                if (!cache && fs.existsSync(audioPath)) {
                    fs.unlinkSync(audioPath);
                }

                return { 
                    success: true, 
                    method: 'openai-tts',
                    text: expressiveText 
                };
            } catch (openaiError) {
                log.warn(`OpenAI TTS failed, falling back to SAPI: ${openaiError.message}`);
            }
        }

        // Fallback to Windows SAPI
        if (process.platform === 'win32') {
            await speakWithSAPI(expressiveText);
            return { 
                success: true, 
                method: 'windows-sapi',
                text: expressiveText 
            };
        }

        throw new Error('No TTS method available');

    } catch (error) {
        log.error(`Speech failed: ${error.message}`);
        return { 
            success: false, 
            error: error.message 
        };
    }
}

/**
 * Speaks a greeting based on time of day
 * @param {string} name - Name to greet
 * @returns {Promise<Object>} Result
 */
async function speakGreeting(name = 'Sir') {
    const hour = new Date().getHours();
    let greeting;

    if (hour >= 5 && hour < 12) {
        greeting = `Good morning, ${name}! Ready to start the day?`;
    } else if (hour >= 12 && hour < 17) {
        greeting = `Good afternoon, ${name}. How can I assist you?`;
    } else if (hour >= 17 && hour < 21) {
        greeting = `Good evening, ${name}! How was your day?`;
    } else {
        greeting = `Hello, ${name}. Working late I see. How may I help?`;
    }

    return speak(greeting);
}

/**
 * Speaks a notification/alert
 * @param {string} message - Notification message
 * @param {string} type - Type: 'info', 'warning', 'success', 'error'
 * @returns {Promise<Object>} Result
 */
async function speakNotification(message, type = 'info') {
    const prefixes = {
        info: 'Just to let you know,',
        warning: 'Attention,',
        success: 'Excellent news,',
        error: 'I apologize, but'
    };

    const prefix = prefixes[type] || '';
    const fullMessage = prefix ? `${prefix} ${message}` : message;
    
    return speak(fullMessage);
}

/**
 * Speaks with a specific personality/tone
 * @param {string} text - Text to speak
 * @param {string} personality - 'formal', 'casual', 'enthusiastic', 'calm'
 * @returns {Promise<Object>} Result
 */
async function speakWithPersonality(text, personality = 'formal') {
    const settings = {
        formal: { voice: 'onyx', speed: 0.9 },
        casual: { voice: 'alloy', speed: 1.0 },
        enthusiastic: { voice: 'nova', speed: 1.1 },
        calm: { voice: 'shimmer', speed: 0.85 }
    };

    const { voice, speed } = settings[personality] || settings.formal;
    return speak(text, { voice, speed });
}

/**
 * Queue for sequential speech
 */
let speechQueue = [];
let isSpeaking = false;

/**
 * Adds text to speech queue and processes sequentially
 * @param {string} text - Text to speak
 * @param {Object} options - Speech options
 * @returns {Promise<Object>} Result
 */
async function queueSpeak(text, options = {}) {
    return new Promise((resolve) => {
        speechQueue.push({ text, options, resolve });
        processQueue();
    });
}

async function processQueue() {
    if (isSpeaking || speechQueue.length === 0) return;

    isSpeaking = true;
    const { text, options, resolve } = speechQueue.shift();
    
    try {
        const result = await speak(text, options);
        resolve(result);
    } catch (error) {
        resolve({ success: false, error: error.message });
    }

    isSpeaking = false;
    processQueue();
}

/**
 * Clears the speech cache directory
 */
function clearCache() {
    try {
        const files = fs.readdirSync(VOICE_SETTINGS.outputDir);
        for (const file of files) {
            fs.unlinkSync(path.join(VOICE_SETTINGS.outputDir, file));
        }
        log.info('Voice cache cleared');
        return { success: true };
    } catch (error) {
        log.error(`Failed to clear cache: ${error.message}`);
        return { success: false, error: error.message };
    }
}

/**
 * Sets the default voice
 * @param {string} voice - Voice name (alloy, echo, fable, onyx, nova, shimmer)
 */
function setVoice(voice) {
    const validVoices = ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer'];
    if (validVoices.includes(voice)) {
        VOICE_SETTINGS.voice = voice;
        log.info(`Voice set to: ${voice}`);
        return { success: true, voice };
    }
    return { success: false, error: `Invalid voice. Choose from: ${validVoices.join(', ')}` };
}

/**
 * Sets the speech speed
 * @param {number} speed - Speed (0.25 to 4.0)
 */
function setSpeed(speed) {
    if (speed >= 0.25 && speed <= 4.0) {
        VOICE_SETTINGS.speed = speed;
        log.info(`Speed set to: ${speed}`);
        return { success: true, speed };
    }
    return { success: false, error: 'Speed must be between 0.25 and 4.0' };
}

/**
 * Gets current voice settings
 * @returns {Object} Current settings
 */
function getSettings() {
    return {
        voice: VOICE_SETTINGS.voice,
        speed: VOICE_SETTINGS.speed,
        model: VOICE_SETTINGS.model,
        availableVoices: ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer']
    };
}

module.exports = {
    speak,
    speakGreeting,
    speakNotification,
    speakWithPersonality,
    queueSpeak,
    transformToExpressive,
    setVoice,
    setSpeed,
    getSettings,
    clearCache
};
