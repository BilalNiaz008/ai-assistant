# Jarvis AI Assistant

A production-ready personal AI desktop assistant that automatically runs when you start your laptop. Built with Node.js, featuring a modular plugin architecture designed to evolve into a full AI agent.

![Version](https://img.shields.io/badge/version-1.0.0-blue.svg)
![Node](https://img.shields.io/badge/node-%3E%3D18.0.0-green.svg)
![Platform](https://img.shields.io/badge/platform-Windows-lightgrey.svg)

## Features

- 🌅 **Smart Greeting** - Personalized greetings based on time of day
- 🌤️ **Weather Integration** - Current weather and forecasts via OpenWeather API
- 📧 **Gmail Integration** - Fetch and display unread emails with OAuth2
- 🤖 **AI Summarization** - LLM-powered email summaries and action items
- 🎵 **Music Playback** - Spotify integration or local file playback
- 🧠 **AI Decision Engine** - Intelligent action planning (agent foundation)
- 💻 **CLI Interface** - Full command-line interface for manual control
- 🚀 **Auto-Start** - Runs automatically on Windows startup

## Architecture

```
jarvis-assistant/
├── assistant.js          # Main orchestrator
├── config/
│   └── config.js         # Centralized configuration
├── core/
│   ├── logger.js         # Winston-based logging
│   ├── action-registry.js # Plugin action registry
│   └── decision-engine.js # AI decision layer
├── modules/
│   ├── weather.js        # OpenWeather integration
│   ├── gmail.js          # Gmail API integration
│   ├── music.js          # Spotify/local playback
│   ├── greeting.js       # Personalized greetings
│   └── ai-summarizer.js  # LLM summarization
├── cli/
│   └── cli.js            # Command-line interface
├── scripts/
│   ├── startup.bat       # Windows startup script
│   ├── startup-silent.vbs # Silent startup option
│   └── setup-startup.ps1  # Startup configuration
├── credentials/          # OAuth tokens (git-ignored)
└── logs/                 # Application logs
```

## Quick Start

### 1. Prerequisites

- **Node.js** 18.0.0 or higher ([Download](https://nodejs.org/))
- **Windows** 10/11
- API keys (see API Setup below)

### 2. Installation

```bash
# Clone or download the project
cd C:\Documents\jarvis-assistant

# Install dependencies
npm install

# Copy environment template
copy .env.example .env

# Edit .env with your configuration
notepad .env
```

### 3. Configure Environment

Edit `.env` file with your credentials:

```env
# Required
USER_NAME=YourName
OPENAI_API_KEY=sk-your-openai-key

# Optional but recommended
OPENWEATHER_API_KEY=your-weather-key
GMAIL_CLIENT_ID=your-gmail-client-id
GMAIL_CLIENT_SECRET=your-gmail-secret
```

### 4. Run Jarvis

```bash
# Start the assistant
npm start

# Or run directly
node assistant.js
```

### 5. Setup Gmail (Optional)

```bash
# Run Gmail authentication
node assistant.js --setup-gmail
```

### 6. Configure Auto-Start

```powershell
# Run PowerShell as Administrator
.\scripts\setup-startup.ps1
```

## API Setup Guides

### OpenAI API

1. Go to [OpenAI Platform](https://platform.openai.com/)
2. Create an account or log in
3. Navigate to API Keys section
4. Create a new API key
5. Copy to `.env` as `OPENAI_API_KEY`

### Anthropic Claude API (Alternative)

1. Go to [Anthropic Console](https://console.anthropic.com/)
2. Create an account
3. Generate an API key
4. Set `AI_PROVIDER=ANTHROPIC` in `.env`
5. Add key as `ANTHROPIC_API_KEY`

### OpenWeather API

1. Go to [OpenWeather](https://openweathermap.org/api)
2. Sign up for free account
3. Go to "API Keys" tab
4. Copy your API key to `.env` as `OPENWEATHER_API_KEY`

### Gmail API

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project
3. Enable the Gmail API:
   - Navigate to "APIs & Services" > "Enable APIs"
   - Search for "Gmail API" and enable it
4. Configure OAuth consent screen:
   - Go to "OAuth consent screen"
   - Select "External" user type
   - Fill in app name (e.g., "Jarvis Assistant")
   - Add your email as test user
5. Create OAuth credentials:
   - Go to "Credentials"
   - Click "Create Credentials" > "OAuth client ID"
   - Select "Web application"
   - Add `http://localhost:3000/oauth2callback` as redirect URI
   - Copy Client ID and Client Secret to `.env`
6. Run `node assistant.js --setup-gmail` to authenticate

### Spotify (Optional)

1. Go to [Spotify Developer Dashboard](https://developer.spotify.com/dashboard)
2. Create a new app
3. Note the Client ID and Client Secret
4. Add `http://localhost:3000/spotify-callback` as redirect URI
5. Copy credentials to `.env`
6. Set `SPOTIFY_DEFAULT_PLAYLIST` to your preferred playlist URI

## CLI Commands

```bash
# Show help
node cli/cli.js --help

# Weather
node cli/cli.js weather
node cli/cli.js weather --forecast
node cli/cli.js weather --location "London,UK"

# Email
node cli/cli.js email
node cli/cli.js email --max 5
node cli/cli.js email --summarize

# Music
node cli/cli.js music --play
node cli/cli.js music --stop
node cli/cli.js music --next

# AI
node cli/cli.js ask "What should I focus on today?"
node cli/cli.js decide
node cli/cli.js briefing

# Interactive mode
node cli/cli.js interactive

# List available actions
node cli/cli.js actions
```

## Command Line Options

```bash
# Main assistant
node assistant.js --help          # Show help
node assistant.js --setup-gmail   # Gmail authentication
node assistant.js --no-music      # Skip music
node assistant.js --no-weather    # Skip weather
node assistant.js --no-email      # Skip email
node assistant.js --no-ai         # Disable AI features
```

## Windows Auto-Start Setup

### Method 1: PowerShell Script (Recommended)

```powershell
# Run as Administrator
powershell -ExecutionPolicy Bypass -File .\scripts\setup-startup.ps1
```

This provides an interactive menu to:
- Set up via Task Scheduler (recommended)
- Set up via Startup Folder
- Remove from startup

### Method 2: Manual Task Scheduler

1. Press `Win + R`, type `taskschd.msc`
2. Click "Create Basic Task"
3. Name: "Jarvis AI Assistant"
4. Trigger: "When I log on"
5. Action: Start a program
6. Program: `C:\Documents\jarvis-assistant\scripts\startup.bat`
7. Start in: `C:\Documents\jarvis-assistant`

### Method 3: Startup Folder

1. Press `Win + R`, type `shell:startup`
2. Create shortcut to `scripts\startup.bat`

## Extending Jarvis

### Adding a New Module

1. Create a new file in `modules/`:

```javascript
// modules/my-module.js
const { createModuleLogger } = require('../core/logger');
const { registry } = require('../core/action-registry');

const log = createModuleLogger('MyModule');

async function myFunction(params) {
    // Your logic here
    return { success: true, data: 'result' };
}

function registerActions() {
    registry.register('my_action', {
        handler: async (params) => myFunction(params),
        description: 'Description of what this does',
        category: 'custom',
        triggers: ['keyword1', 'keyword2'],
        parameters: {
            param1: { type: 'string', description: 'Parameter description' }
        }
    });
    log.info('My module actions registered');
}

module.exports = { myFunction, registerActions };
```

2. Import and register in `assistant.js`:

```javascript
const myModule = require('./modules/my-module');
// In registerAllActions():
myModule.registerActions();
```

### Understanding the Decision Engine

The decision engine (`core/decision-engine.js`) is the foundation for AI agent capabilities:

```javascript
// It receives context like this:
{
    contextType: 'startup',  // or 'user_request', 'scheduled', 'event_triggered'
    systemContext: {
        timeOfDay: 'morning',
        dayOfWeek: 'Monday',
        userName: 'Bilal',
        // ...
    },
    availableActions: [
        { action: 'get_weather', description: '...', triggers: [...] },
        // ...
    ]
}

// And returns decisions like this:
{
    reasoning: 'It\'s Monday morning, user just started laptop',
    actions: [
        { name: 'greet_user', params: {}, priority: 1 },
        { name: 'get_weather', params: {}, priority: 2, parallel: true },
        { name: 'get_unread_emails', params: {}, priority: 2, parallel: true }
    ],
    message: 'Good morning! Here\'s your Monday briefing.'
}
```

## Scaling Roadmap

### Voice Assistant

```javascript
// Future: Add speech recognition
const speechRecognition = require('./modules/speech-recognition');

// Register voice commands
speechRecognition.onCommand('hey jarvis', async (transcript) => {
    const decision = await decisionEngine.processUserRequest(transcript);
    // Execute and speak response
});
```

### Autonomous Coding Agent

```javascript
// Future: Add code analysis and generation
const codeAgent = require('./modules/code-agent');

registry.register('analyze_code', {
    handler: async ({ filePath }) => {
        const analysis = await codeAgent.analyze(filePath);
        const suggestions = await codeAgent.suggest(analysis);
        return { analysis, suggestions };
    },
    category: 'development'
});
```

### Daily Briefing System

```javascript
// Future: Add scheduling
const schedule = require('node-schedule');

schedule.scheduleJob('0 8 * * 1-5', async () => {
    // Run full briefing at 8 AM on weekdays
    const briefing = await generateComprehensiveBriefing();
    await sendNotification(briefing);
});
```

### Additional Ideas

- **Calendar Integration**: Google Calendar for schedule awareness
- **Task Management**: Todoist/Notion integration
- **Smart Home**: Control IoT devices
- **Browser Automation**: Automated web tasks
- **File Organization**: AI-powered file management
- **Meeting Summaries**: Record and summarize meetings
- **Health Tracking**: Remind breaks, hydration
- **Learning System**: Adapt to user preferences over time

## Troubleshooting

### Gmail Authentication Issues

```bash
# Clear tokens and re-authenticate
del credentials\gmail-token.json
node assistant.js --setup-gmail
```

### OpenAI API Errors

- Check API key is valid
- Verify you have API credits
- Check rate limits

### Startup Not Working

1. Check Task Scheduler for errors
2. Verify Node.js is in PATH
3. Check `.env` file exists
4. Review logs in `logs/` folder

### Music Not Playing

- Ensure Spotify is installed
- Check `LOCAL_MUSIC_PATH` in `.env`
- Try running manually first

## Logs

Logs are stored in the `logs/` directory:
- `combined.log` - All logs
- `error.log` - Errors only

Configure logging in `.env`:
```env
LOG_LEVEL=info  # debug, info, warn, error
LOG_TO_FILE=true
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

## License

MIT License - feel free to use and modify for personal or commercial use.

## Credits

Built with:
- [OpenAI API](https://openai.com/) / [Anthropic Claude](https://anthropic.com/)
- [OpenWeather API](https://openweathermap.org/)
- [Google Gmail API](https://developers.google.com/gmail/api)
- [Node.js](https://nodejs.org/)
- [Commander.js](https://github.com/tj/commander.js)
- [Inquirer.js](https://github.com/SBoudrias/Inquirer.js)
- [Winston](https://github.com/winstonjs/winston)
- [Chalk](https://github.com/chalk/chalk)
- [Ora](https://github.com/sindresorhus/ora)
