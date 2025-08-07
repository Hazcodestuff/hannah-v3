// generate-session.js (Baileys Version - QR Code - Updated)
const { 
    default: makeWASocket, 
    useMultiFileAuthState, 
    DisconnectReason,
    Browsers,
    fetchLatestBaileysVersion
} = require('@whiskeysockets/baileys');
const pino = require('pino');
const chalk = require('chalk');
const fs = require('fs');
const qrcode = require('qrcode-terminal'); // We'll use this to display QR codes
const Logger = require('./logger'); // Your existing logger
const SessionManager = require('./sessionManager'); // Import your session manager

async function generateSession() {
    Logger.system('--- Baileys Session Generator (QR Code) ---');
    
    // Check if sessions directory exists, create if not
    if (!fs.existsSync('./sessions')) {
        fs.mkdirSync('./sessions', { recursive: true });
        Logger.system('Created sessions directory');
    }
    
    // Fetch latest WhatsApp Web version
    const { version, isLatest } = await fetchLatestBaileysVersion();
    console.log(`using WA v${version.join('.')}, isLatest: ${isLatest}`);
    
    const { state, saveCreds } = await useMultiFileAuthState('sessions');
    
    const client = makeWASocket({
        logger: pino({ level: 'silent' }),
        auth: state,
        browser: Browsers.windows('Firefox'), // Specify browser for better compatibility
        version: version // Use the fetched version
    });
    
    Logger.system(chalk.yellow('📱 Waiting for QR code...'));
    Logger.system(chalk.gray('(WhatsApp > Settings > Linked Devices > Link a Device)'));
    
    client.ev.on('creds.update', saveCreds);
    
    client.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;
        
        // QR code event - display QR code in terminal
        if (qr) {
            Logger.system(chalk.green('🔄 QR code generated! Please scan it quickly.'));
            Logger.system(chalk.gray('QR codes expire after about 20 seconds.'));
            
            // Display QR code in terminal
            qrcode.generate(qr, { small: true });
        }
        
        if (connection === 'open') {
            Logger.success('✅ Session has been created successfully!');
            Logger.system('The session file is located at: ./sessions/creds.json');
            
            // Initialize session manager and save to Google Drive
            const sessionManager = new SessionManager();
            sessionManager.saveSessionToDrive().then(() => {
                Logger.success('✅ Session saved to Google Drive');
            }).catch(err => {
                Logger.error('Failed to save session to Google Drive:', err.message);
            });
            
            Logger.system(chalk.green('🎉 You can now close this script with CTRL+C.'));
            Logger.system(chalk.gray('Your bot is ready to use!'));
        } else if (connection === 'close') {
            const shouldReconnect = (lastDisconnect?.error)?.output?.statusCode !== DisconnectReason.loggedOut;
            
            if (shouldReconnect) {
                Logger.error('Connection closed due to network error, please try again.');
                Logger.system(chalk.yellow('🔄 Retrying in 5 seconds...'));
                setTimeout(() => {
                    generateSession();
                }, 5000);
            } else {
                Logger.error('Connection closed. You are logged out.');
                Logger.system(chalk.red('❌ Please scan the QR code again.'));
                process.exit(1);
            }
        }
    });
    
    // Handle authentication failures
    client.ev.on('auth.failure', (error) => {
        Logger.error('Authentication failure:', error.message);
        Logger.system(chalk.red('❌ Authentication failed. Please try again.'));
        process.exit(1);
    });
    
    // Handle any uncaught errors
    client.ev.on('error', (error) => {
        Logger.error('Socket error:', error.message);
    });
    
    // Handle pairing code (just in case, though we're using QR)
    client.ev.on('pairing-code', (code) => {
        Logger.system(chalk.yellow('📱 Pairing code available:'), chalk.bold.bgGreen(code));
        Logger.system(chalk.gray('(You can use this if QR code scanning fails)'));
    });
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
    Logger.system('\n🛑 Shutting down session generator...');
    Logger.system(chalk.blue('👋 Goodbye!'));
    process.exit(0);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
    Logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
    Logger.error('Uncaught Exception:', error.message);
    process.exit(1);
});

generateSession().catch(err => {
    Logger.error('Failed to generate session', err.message);
    Logger.error(chalk.red('❌ Session generation failed. Please try again.'));
    process.exit(1);
});