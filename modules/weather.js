/**
 * Weather Module
 * Fetches weather data from OpenWeather API with caching and error handling
 */

const axios = require('axios');
const { config } = require('../config/config');
const { createModuleLogger } = require('../core/logger');
const { registry } = require('../core/action-registry');

const log = createModuleLogger('Weather');

// Cache weather data for 10 minutes
let weatherCache = {
    data: null,
    timestamp: 0,
    ttl: 10 * 60 * 1000
};

/**
 * Fetches current weather for configured location
 * @param {Object} options - Optional overrides
 * @param {string} options.location - Override location (city,country)
 * @param {string} options.units - Override units (metric/imperial)
 * @returns {Promise<Object>} Weather data
 */
async function getWeather(options = {}) {
    const location = options.location || config.user.location;
    const units = options.units || config.weather.units;
    const apiKey = config.weather.apiKey;

    if (!apiKey) {
        throw new Error('OpenWeather API key not configured');
    }

    // Check cache
    const cacheKey = `${location}-${units}`;
    if (weatherCache.data && 
        weatherCache.key === cacheKey && 
        Date.now() - weatherCache.timestamp < weatherCache.ttl) {
        log.debug('Returning cached weather data');
        return weatherCache.data;
    }

    try {
        log.info(`Fetching weather for ${location}`);
        
        const response = await axios.get(`${config.weather.baseUrl}/weather`, {
            params: {
                q: location,
                units,
                appid: apiKey
            },
            timeout: 10000
        });

        const data = response.data;
        
        const weather = {
            location: data.name,
            country: data.sys.country,
            temperature: Math.round(data.main.temp),
            feelsLike: Math.round(data.main.feels_like),
            humidity: data.main.humidity,
            description: data.weather[0].description,
            icon: data.weather[0].icon,
            windSpeed: data.wind.speed,
            visibility: data.visibility,
            pressure: data.main.pressure,
            sunrise: new Date(data.sys.sunrise * 1000).toLocaleTimeString(),
            sunset: new Date(data.sys.sunset * 1000).toLocaleTimeString(),
            units: units === 'metric' ? 'C' : 'F',
            raw: data
        };

        // Update cache
        weatherCache = {
            data: weather,
            key: cacheKey,
            timestamp: Date.now(),
            ttl: weatherCache.ttl
        };

        log.info(`Weather fetched: ${weather.temperature}°${weather.units}, ${weather.description}`);
        return weather;
    } catch (error) {
        if (error.response) {
            log.error(`Weather API error: ${error.response.status} - ${error.response.data.message}`);
            throw new Error(`Weather API error: ${error.response.data.message}`);
        }
        log.error(`Weather fetch failed: ${error.message}`);
        throw error;
    }
}

/**
 * Fetches weather forecast for the next few days
 * @param {Object} options - Optional overrides
 * @returns {Promise<Object>} Forecast data
 */
async function getForecast(options = {}) {
    const location = options.location || config.user.location;
    const units = options.units || config.weather.units;
    const apiKey = config.weather.apiKey;

    if (!apiKey) {
        throw new Error('OpenWeather API key not configured');
    }

    try {
        log.info(`Fetching forecast for ${location}`);
        
        const response = await axios.get(`${config.weather.baseUrl}/forecast`, {
            params: {
                q: location,
                units,
                appid: apiKey,
                cnt: 24 // 8 forecasts per day * 3 days
            },
            timeout: 10000
        });

        const data = response.data;
        
        const forecast = {
            location: data.city.name,
            country: data.city.country,
            forecasts: data.list.map(item => ({
                datetime: new Date(item.dt * 1000),
                temperature: Math.round(item.main.temp),
                description: item.weather[0].description,
                humidity: item.main.humidity,
                windSpeed: item.wind.speed
            })),
            units: units === 'metric' ? 'C' : 'F'
        };

        return forecast;
    } catch (error) {
        log.error(`Forecast fetch failed: ${error.message}`);
        throw error;
    }
}

/**
 * Formats weather data for display
 * @param {Object} weather - Weather data object
 * @returns {string} Formatted weather string
 */
function formatWeather(weather) {
    return `
🌡️  Weather in ${weather.location}, ${weather.country}
   Temperature: ${weather.temperature}°${weather.units} (feels like ${weather.feelsLike}°${weather.units})
   Conditions: ${weather.description}
   Humidity: ${weather.humidity}%
   Wind: ${weather.windSpeed} ${weather.units === 'C' ? 'm/s' : 'mph'}
   Sunrise: ${weather.sunrise} | Sunset: ${weather.sunset}
`.trim();
}

/**
 * Plain sentence for text-to-speech (no symbols)
 */
function formatWeatherSpeech(weather) {
    if (!weather) return '';
    const windUnit = weather.units === 'C' ? 'meters per second' : 'miles per hour';
    const deg = weather.units === 'C' ? 'Celsius' : 'Fahrenheit';
    return (
        `Weather in ${weather.location}, ${weather.country}. ` +
        `Temperature ${weather.temperature} degrees ${deg}, feels like ${weather.feelsLike}. ` +
        `Conditions: ${weather.description}. Humidity ${weather.humidity} percent. ` +
        `Wind speed ${weather.windSpeed} ${windUnit}.`
    );
}

/**
 * Gets weather summary for AI context
 * @returns {Promise<string>} Weather summary string
 */
async function getWeatherSummary() {
    try {
        const weather = await getWeather();
        return `Current weather: ${weather.temperature}°${weather.units}, ${weather.description} in ${weather.location}. ` +
               `Humidity ${weather.humidity}%, wind ${weather.windSpeed} ${weather.units === 'C' ? 'm/s' : 'mph'}.`;
    } catch (error) {
        return `Weather information unavailable: ${error.message}`;
    }
}

// Register actions
function registerActions() {
    registry.register('get_weather', {
        handler: async (params) => {
            const weather = await getWeather(params);
            return { weather, formatted: formatWeather(weather) };
        },
        description: 'Get current weather information',
        category: 'information',
        triggers: ['weather', 'temperature', 'forecast', 'outside', 'hot', 'cold', 'rain'],
        parameters: {
            location: { type: 'string', description: 'City,Country code (e.g., "London,UK")' },
            units: { type: 'string', enum: ['metric', 'imperial'], description: 'Temperature units' }
        }
    });

    registry.register('get_forecast', {
        handler: async (params) => {
            const forecast = await getForecast(params);
            return forecast;
        },
        description: 'Get weather forecast for upcoming days',
        category: 'information',
        triggers: ['forecast', 'tomorrow', 'week', 'upcoming weather'],
        parameters: {
            location: { type: 'string', description: 'City,Country code' }
        }
    });

    log.info('Weather actions registered');
}

module.exports = {
    getWeather,
    getForecast,
    formatWeather,
    formatWeatherSpeech,
    getWeatherSummary,
    registerActions
};
