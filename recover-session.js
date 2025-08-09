// recover-session.js
const fs = require('fs');
const path = require('path');
const Logger = require('./logger.js');

async function recoverSession() {
    Logger.system('Attempting to recover session...');
    
    try {
        // Check if sessions directory exists
        const sessionDir = path.join(__dirname, 'sessions');
        if (!fs.existsSync(sessionDir)) {
            fs.mkdirSync(sessionDir, { recursive: true });
        }
        
        // Delete existing session files
        const sessionFiles = fs.readdirSync(sessionDir);
        for (const file of sessionFiles) {
            fs.unlinkSync(path.join(sessionDir, file));
        }
        
        Logger.system('Old session files deleted. Please generate a new session.');
        
        // Instructions for the user
        console.log('\n=== SESSION RECOVERY COMPLETE ===');
        console.log('1. Run: node generate-session.js');
        console.log('2. Convert the new session to base64');
        console.log('3. Update SESSION_CREDS_BASE64 in Render');
        console.log('4. Restart your service on Render');
        console.log('==============================\n');
        
    } catch (error) {
        Logger.error('Error during session recovery:', error.message);
    }
}

recoverSession();