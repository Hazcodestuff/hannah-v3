// sessionManager.js (Simplified)
const fs = require('fs-extra');
const path = require('path');
const Logger = require('./logger.js');

const SESSION_FILE_NAME = 'creds.json';

class SessionManager {
    constructor() {
        this.sessionPath = path.join(__dirname, 'sessions');
        this.sessionFilePath = path.join(this.sessionPath, SESSION_FILE_NAME);
        this.isSessionLoaded = false;
    }

    // Check if local session exists
    hasLocalSession() {
        return fs.existsSync(this.sessionFilePath);
    }

    // Check if session is loaded
    isSessionLoaded() {
        return this.isSessionLoaded;
    }

    // Load session from environment variable or file
    async loadSession() {
        try {
            // First try to load from environment variable (for Render)
            if (process.env.SESSION_CREDS_BASE64) {
                Logger.system('Loading session from environment variable...');
                
                // Ensure the sessions directory exists
                fs.ensureDirSync(this.sessionPath);
                
                // Decode and save the session
                const sessionJson = Buffer.from(process.env.SESSION_CREDS_BASE64, 'base64').toString();
                fs.writeFileSync(this.sessionFilePath, sessionJson);
                
                Logger.success('✓ Session loaded from environment variable!');
                this.isSessionLoaded = true;
                return true;
            }
            
            // Fall back to local file
            if (this.hasLocalSession()) {
                Logger.system('Loading session from local file...');
                this.isSessionLoaded = true;
                return true;
            }
            
            Logger.error('No session found in environment variable or local file');
            return false;
        } catch (error) {
            Logger.error('Error loading session:', error.message);
            return false;
        }
    }
}

module.exports = SessionManager;