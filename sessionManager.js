const fs = require('fs');
const path = require('path');
const Logger = require('./logger.js');

// Define paths
const LOCAL_SESSION_PATH = path.join(__dirname, '.wwebjs_auth');
const SESSION_EXPORT_PATH = path.join(__dirname, 'session.js');

// Google Drive setup
const { google } = require('googleapis');
const auth = new google.auth.GoogleAuth({
    keyFile: path.join(__dirname, 'credentials.json'),
    scopes: 'https://www.googleapis.com/auth/drive',
});
const drive = google.drive({ version: 'v3', auth });
const GOOGLE_DRIVE_FOLDER_ID = process.env.GOOGLE_DRIVE_FOLDER_ID;
const SESSION_FILE_NAME = 'session.js';

class SessionManager {
    constructor() {
        this.sessionFileId = null;
    }

    // Add this method to the SessionManager class in sessionManager.js
async uploadSessionToDrive() {
    try {
        if (!fs.existsSync(SESSION_EXPORT_PATH)) {
            Logger.error('Session file not found');
            return false;
        }

        // Check if we already have a session file on Drive
        if (!this.sessionFileId) {
            try {
                const res = await drive.files.list({
                    q: `'${GOOGLE_DRIVE_FOLDER_ID}' in parents and name='${SESSION_FILE_NAME}' and trashed=false`,
                    fields: 'files(id, name)',
                });

                if (res.data.files && res.data.files.length > 0) {
                    this.sessionFileId = res.data.files[0].id;
                    Logger.system('Found existing session file on Google Drive');
                }
            } catch (error) {
                Logger.error('Error checking for existing session file', error.message);
            }
        }

        // Upload or update the session file
        if (this.sessionFileId) {
            // Update existing file
            const { Readable } = require('stream');
            const bufferStream = new Readable();
            bufferStream.push(fs.readFileSync(SESSION_EXPORT_PATH));
            bufferStream.push(null);

            await drive.files.update({
                fileId: this.sessionFileId,
                media: {
                    mimeType: 'application/javascript',
                    body: bufferStream,
                },
            });
            Logger.system('Session file updated on Google Drive');
        } else {
            // Create new file
            const { Readable } = require('stream');
            const bufferStream = new Readable();
            bufferStream.push(fs.readFileSync(SESSION_EXPORT_PATH));
            bufferStream.push(null);

            const file = await drive.files.create({
                resource: {
                    name: SESSION_FILE_NAME,
                    parents: [GOOGLE_DRIVE_FOLDER_ID],
                },
                media: {
                    mimeType: 'application/javascript',
                    body: bufferStream,
                },
                fields: 'id',
            });
            this.sessionFileId = file.data.id;
            Logger.system(`Session file created on Google Drive with ID: ${this.sessionFileId}`);
        }

        return true;
    } catch (error) {
        Logger.error('Error uploading session to Google Drive', error.message);
        return false;
    }
}

// Add this method to the SessionManager class in sessionManager.js
async setOAuth2Token(code) {
    try {
        const { tokens } = await oauth2Client.getToken(code);
        oauth2Client.setCredentials(tokens);
        
        // Store the token in environment variable
        this.oauthToken = JSON.stringify(tokens);
        process.env.GOOGLE_OAUTH_TOKEN = this.oauthToken;
        
        this.isAuthenticated = true;
        Logger.system('OAuth2 token set successfully');
        return true;
    } catch (error) {
        Logger.error('Error setting OAuth2 token', error.message);
        return false;
    }
}

    // Save session to a readable JS file
    async saveSessionToFile() {
        try {
            // Check if session directory exists
            if (!fs.existsSync(LOCAL_SESSION_PATH)) {
                Logger.error('Local session directory not found');
                return false;
            }

            // Read all files in the session directory
            const sessionFiles = fs.readdirSync(LOCAL_SESSION_PATH);
            if (sessionFiles.length === 0) {
                Logger.error('No session files found');
                return false;
            }

            // Create a session data object
            const sessionData = {
                files: {},
                timestamp: Date.now(),
                version: '1.0'
            };

            // Read all session files and encode them as base64
            for (const file of sessionFiles) {
                const filePath = path.join(LOCAL_SESSION_PATH, file);
                if (fs.statSync(filePath).isFile()) {
                    sessionData.files[file] = {
                        content: fs.readFileSync(filePath, 'base64'),
                        type: 'base64'
                    };
                }
            }

            // Convert to a JavaScript module string
            const jsContent = `// Hannah WhatsApp Session Data
// Generated on: ${new Date().toISOString()}
// Do not edit this file manually

const sessionData = ${JSON.stringify(sessionData, null, 2)};

module.exports = sessionData;`;

            // Write to session.js file
            fs.writeFileSync(SESSION_EXPORT_PATH, jsContent);
            
            Logger.system(`Session saved to: ${SESSION_EXPORT_PATH}`);
            Logger.system('You can now manually upload this file to Google Drive');
            
            return true;
        } catch (error) {
            Logger.error('Error saving session to file', error.message);
            return false;
        }
    }

    // Load session from Google Drive (without downloading)
    async loadSessionFromDrive() {
        try {
            // Check if session file exists on Drive
            const res = await drive.files.list({
                q: `'${GOOGLE_DRIVE_FOLDER_ID}' in parents and name='${SESSION_FILE_NAME}' and trashed=false`,
                fields: 'files(id, name, webViewLink)',
            });

            if (!res.data.files || res.data.files.length === 0) {
                Logger.system('No session file found on Google Drive');
                return false;
            }

            const sessionFile = res.data.files[0];
            this.sessionFileId = sessionFile.id;
            
            Logger.system(`Found session file on Google Drive: ${sessionFile.name}`);
            Logger.system(`File ID: ${sessionFile.id}`);
            Logger.system(`WebView Link: ${sessionFile.webViewLink}`);
            
            // Read the file content directly from Google Drive
            const file = await drive.files.get({
                fileId: sessionFile.id,
                alt: 'media',
            });

            const jsContent = file.data;
            
            // Extract the session data from the JavaScript file
            const sessionDataMatch = jsContent.match(/const sessionData = ({[\s\S]*?});/);
            if (!sessionDataMatch) {
                Logger.error('Invalid session file format');
                return false;
            }
            
            const sessionData = JSON.parse(sessionDataMatch[1]);
            
            // Restore all session files
            if (!fs.existsSync(LOCAL_SESSION_PATH)) {
                fs.mkdirSync(LOCAL_SESSION_PATH, { recursive: true });
            }

            for (const [fileName, fileInfo] of Object.entries(sessionData.files)) {
                const filePath = path.join(LOCAL_SESSION_PATH, fileName);
                fs.writeFileSync(filePath, Buffer.from(fileInfo.content, 'base64'));
                Logger.debug(`Restored session file: ${fileName}`);
            }

            Logger.system('Session restored successfully from Google Drive');
            return true;
        } catch (error) {
            Logger.error('Error loading session from Google Drive', error.message);
            return false;
        }
    }

    // Check if local session exists
    hasLocalSession() {
        return fs.existsSync(LOCAL_SESSION_PATH) && fs.readdirSync(LOCAL_SESSION_PATH).length > 0;
    }

    // Clear local session (for debugging or re-authentication)
    clearLocalSession() {
        if (fs.existsSync(LOCAL_SESSION_PATH)) {
            fs.rmSync(LOCAL_SESSION_PATH, { recursive: true, force: true });
            Logger.system('Local session directory cleared');
        }
        
        if (fs.existsSync(SESSION_EXPORT_PATH)) {
            fs.unlinkSync(SESSION_EXPORT_PATH);
            Logger.system('Session export file cleared');
        }
    }

    // Get session file info from Google Drive
    async getSessionFileInfo() {
        try {
            const res = await drive.files.list({
                q: `'${GOOGLE_DRIVE_FOLDER_ID}' in parents and name='${SESSION_FILE_NAME}' and trashed=false`,
                fields: 'files(id, name, webViewLink, createdTime, modifiedTime)',
            });

            if (!res.data.files || res.data.files.length === 0) {
                Logger.system('No session file found on Google Drive');
                return null;
            }

            const sessionFile = res.data.files[0];
            return {
                id: sessionFile.id,
                name: sessionFile.name,
                webViewLink: sessionFile.webViewLink,
                createdTime: sessionFile.createdTime,
                modifiedTime: sessionFile.modifiedTime
            };
        } catch (error) {
            Logger.error('Error getting session file info', error.message);
            return null;
        }
    }
}

module.exports = SessionManager;