// logger.js
const colors = {
    reset: '\x1b[0m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m',
    cyan: '\x1b[36m',
    bright: '\x1b[1m',
    dim: '\x1b[2m'
};

class Logger {
    static message(contact, message, direction = '→') {
        console.log(`${colors.cyan}[MSG] ${colors.reset}${contact} ${direction} ${message}`);
    }

    static action(action, details = '') {
        console.log(`${colors.yellow}[ACTION] ${colors.reset}${action} ${details ? colors.dim + details + colors.reset : ''}`);
    }

    static error(error, context = '') {
        console.log(`${colors.red}[ERROR] ${colors.reset}${error} ${context ? colors.dim + '(' + context + ')' + colors.reset : ''}`);
    }

    static success(message) {
        console.log(`${colors.green}[SUCCESS] ${colors.reset}${message}`);
    }

    static system(message) {
        console.log(`${colors.magenta}[SYSTEM] ${colors.reset}${message}`);
    }

    static debug(message) {
        if (process.env.DEBUG_MODE === 'true') {
            console.log(`${colors.dim}[DEBUG] ${colors.reset}${message}`);
        }
    }

    static aiResponse(response) {
        if (process.env.DEBUG_MODE === 'true') {
            console.log(`${colors.dim}[AI] ${colors.reset}${response}`);
        }
    }
}

module.exports = Logger;