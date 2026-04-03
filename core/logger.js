/**
 * Logger Module
 * Centralized logging system using Winston with console and file transports
 */

const winston = require('winston');
const path = require('path');

const LOG_DIR = path.join(__dirname, '..', 'logs');

const customFormat = winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true }),
    winston.format.printf(({ level, message, timestamp, stack, module }) => {
        const modulePrefix = module ? `[${module}]` : '';
        const logMessage = `${timestamp} ${level.toUpperCase()} ${modulePrefix} ${message}`;
        return stack ? `${logMessage}\n${stack}` : logMessage;
    })
);

const consoleFormat = winston.format.combine(
    winston.format.colorize(),
    winston.format.timestamp({ format: 'HH:mm:ss' }),
    winston.format.printf(({ level, message, timestamp, module }) => {
        const modulePrefix = module ? `[${module}]` : '';
        return `${timestamp} ${level} ${modulePrefix} ${message}`;
    })
);

const logger = winston.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    format: customFormat,
    transports: [
        new winston.transports.Console({
            format: consoleFormat
        })
    ]
});

if (process.env.LOG_TO_FILE === 'true') {
    logger.add(new winston.transports.File({
        filename: path.join(LOG_DIR, 'error.log'),
        level: 'error',
        maxsize: 5242880, // 5MB
        maxFiles: 5
    }));
    
    logger.add(new winston.transports.File({
        filename: path.join(LOG_DIR, 'combined.log'),
        maxsize: 5242880,
        maxFiles: 5
    }));
}

/**
 * Creates a child logger with module context
 * @param {string} moduleName - Name of the module for log prefixing
 * @returns {Object} Logger instance with module context
 */
function createModuleLogger(moduleName) {
    return {
        info: (message, meta = {}) => logger.info(message, { module: moduleName, ...meta }),
        warn: (message, meta = {}) => logger.warn(message, { module: moduleName, ...meta }),
        error: (message, meta = {}) => logger.error(message, { module: moduleName, ...meta }),
        debug: (message, meta = {}) => logger.debug(message, { module: moduleName, ...meta }),
        verbose: (message, meta = {}) => logger.verbose(message, { module: moduleName, ...meta })
    };
}

module.exports = {
    logger,
    createModuleLogger
};
