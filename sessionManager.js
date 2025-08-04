const fs = require('fs');
const path = require('path');
const Logger = require('./logger.js');

// Define paths
const LOCAL_SESSION_PATH = path.join(__dirname, '.wwebjs_auth');
const SESSION_EXPORT_PATH = path.join(__dirname, 'hannah-session.json');
const OAUTH_CREDENTIALS_PATH = path.join(__dirname, 'oauth-credentials.json');
const OAUTH_TOKEN_PATH = path.join(__dirname, 'oauth-token.json');

// Google Drive setup with OAuth2
const { google } = require('googleapis');
const OAuth2 = google.auth.OAuth2;

// Load OAuth2 credentials
let oauth2Client;
if (fs.existsSync(OAUTH_CREDENTIALS_PATH)) {
    const credentials = JSON.parse(fs.readFileSync(OAUTH_CREDENTIALS_PATH));
    oauth2Client = new OAuth2(
        credentials.installed.client_id,
        credentials.installed.client_secret,
        credentials.installed.redirect_uris[0]
    );
} else {
    Logger.error('OAuth2 credentials file not found. Please create oauth-credentials.json');
    process.exit(1);
}

const drive = google.drive({ version: 'v3', auth: oauth2Client });
const GOOGLE_DRIVE_FOLDER_ID = process.env.GOOGLE_DRIVE_FOLDER_ID;
const SESSION_FILE_NAME = 'hannah-session.json';

class SessionManager {
    constructor() {
        this.sessionFileId = null;
        this.isAuthenticated = false;
    }

    // Authenticate with Google using OAuth2
    async authenticate() {
        try {
            // Check if we already have a valid token
            if (fs.existsSync(OAUTH_TOKEN_PATH)) {
                const token = JSON.parse(fs.readFileSync(OAUTH_TOKEN_PATH));
                oauth2Client.setCredentials(token);
                
                // Check if token is expired
                const expiryDate = new Date(token.expiry_date);
                if (expiryDate > new Date()) {
                    this.isAuthenticated = true;
                    Logger.system('Authenticated with Google using existing token');
                    return true;
                } else {
                    Logger.system('OAuth token expired, refreshing...');
                    // Try to refresh the token
                    try {
                        const { credentials } = await oauth2Client.refreshAccessToken();
                        fs.writeFileSync(OAUTH_TOKEN_PATH, JSON.stringify(credentials));
                        this.isAuthenticated = true;
                        Logger.system('OAuth token refreshed successfully');
                        return true;
                    } catch (refreshError) {
                        Logger.error('Failed to refresh OAuth token', refreshError.message);
                    }
                }
            }
            
            // If we don't have a valid token, generate an auth URL
            const authUrl = oauth2Client.generateAuthUrl({
                access_type: 'offline',
                scope: ['https://www.googleapis.com/auth/drive'],
            });
            
            Logger.system('=== GOOGLE AUTHENTICATION REQUIRED ===');
            Logger.system('Please visit the following URL to authorize the application:');
            Logger.system(authUrl);
            Logger.system('After authorization, you will receive a code. Enter it below:');
            
            // For now, we'll skip Google Drive authentication and continue
            Logger.system('Skipping Google Drive authentication for now...');
            this.isAuthenticated = false;
            return false;
        } catch (error) {
            Logger.error('Error during Google authentication', error.message);
            this.isAuthenticated = false;
            return false;
        }
    }

    // Set OAuth2 token (for manual token entry)
    async setOAuth2Token(code) {
        try {
            const { tokens } = await oauth2Client.getToken(code);
            oauth2Client.setCredentials(tokens);
            fs.writeFileSync(OAUTH_TOKEN_PATH, JSON.stringify(tokens));
            this.isAuthenticated = true;
            Logger.system('OAuth2 token saved successfully');
            return true;
        } catch (error) {
            Logger.error('Error setting OAuth2 token', error.message);
            return false;
        }
    }

    // Save session to Google Drive
    async saveSessionToDrive() {
        if (!this.isAuthenticated) {
            Logger.debug('Skipping Google Drive save - not authenticated');
            return false;
        }

        try {
            // Check if session file exists locally
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

            // Create a zip-like object with all session files
            const sessionData = {};
            for (const file of sessionFiles) {
                const filePath = path.join(LOCAL_SESSION_PATH, file);
                if (fs.statSync(filePath).isFile()) {
                    sessionData[file] = fs.readFileSync(filePath, 'base64');
                }
            }

            // Convert to JSON string
            const sessionString = JSON.stringify(sessionData, null, 2);
            
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
                bufferStream.push(sessionString);
                bufferStream.push(null);

                await drive.files.update({
                    fileId: this.sessionFileId,
                    media: {
                        mimeType: 'application/json',
                        body: bufferStream,
                    },
                });
                Logger.system('Session file updated on Google Drive');
            } else {
                // Create new file
                const { Readable } = require('stream');
                const bufferStream = new Readable();
                bufferStream.push(sessionString);
                bufferStream.push(null);

                const file = await drive.files.create({
                    resource: {
                        name: SESSION_FILE_NAME,
                        parents: [GOOGLE_DRIVE_FOLDER_ID],
                    },
                    media: {
                        mimeType: 'application/json',
                        body: bufferStream,
                    },
                    fields: 'id',
                });
                this.sessionFileId = file.data.id;
                Logger.system(`Session file created on Google Drive with ID: ${this.sessionFileId}`);
            }

            return true;
        } catch (error) {
            Logger.error('Error saving session to Google Drive', error.message);
            return false;
        }
    }

    // Load session from Google Drive
    async loadSessionFromDrive() {
        if (!this.isAuthenticated) {
            Logger.debug('Skipping Google Drive load - not authenticated');
            return false;
        }

        try {
            // Check if session file exists on Drive
            const res = await drive.files.list({
                q: `'${GOOGLE_DRIVE_FOLDER_ID}' in parents and name='${SESSION_FILE_NAME}' and trashed=false`,
                fields: 'files(id, name)',
            });

            if (!res.data.files || res.data.files.length === 0) {
                Logger.system('No session file found on Google Drive');
                return false;
            }

            this.sessionFileId = res.data.files[0].id;
            Logger.system(`Found session file on Google Drive with ID: ${this.sessionFileId}`);

            // Download the session file
            const file = await drive.files.get({
                fileId: this.sessionFileId,
                alt: 'media',
            });

            const sessionData = file.data;
            
            // Make sure the session directory exists
            if (!fs.existsSync(LOCAL_SESSION_PATH)) {
                fs.mkdirSync(LOCAL_SESSION_PATH, { recursive: true });
            }

            // Extract and write all session files
            for (const [fileName, fileContent] of Object.entries(sessionData)) {
                const filePath = path.join(LOCAL_SESSION_PATH, fileName);
                fs.writeFileSync(filePath, Buffer.from(fileContent, 'base64'));
                Logger.debug(`Restored session file: ${fileName}`);
            }

            Logger.system('Session restored from Google Drive');
            return true;
        } catch (error) {
            Logger.error('Error loading session from Google Drive', error.message);
            return false;
        }
    }

    // Save session to local file
    async saveSessionLocally() {
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

            // Create a zip-like object with all session files
            const sessionData = {};
            for (const file of sessionFiles) {
                const filePath = path.join(LOCAL_SESSION_PATH, file);
                if (fs.statSync(filePath).isFile()) {
                    sessionData[file] = fs.readFileSync(filePath, 'base64');
                }
            }

            // Convert to JSON string and save to script directory
            const sessionString = JSON.stringify(sessionData, null, 2);
            fs.writeFileSync(SESSION_EXPORT_PATH, sessionString);
            
            Logger.system(`Session file saved locally at: ${SESSION_EXPORT_PATH}`);
            
            return true;
        } catch (error) {
            Logger.error('Error saving session locally', error.message);
            return false;
        }
    }

    // Load session from local file
    async loadSessionFromLocal() {
        try {
            if (!fs.existsSync(SESSION_EXPORT_PATH)) {
                Logger.system('No local session file found');
                return false;
            }

            // Read the session file
            const sessionString = fs.readFileSync(SESSION_EXPORT_PATH, 'utf8');
            const sessionData = JSON.parse(sessionString);
            
            // Make sure the session directory exists
            if (!fs.existsSync(LOCAL_SESSION_PATH)) {
                fs.mkdirSync(LOCAL_SESSION_PATH, { recursive: true });
            }

            // Extract and write all session files
            for (const [fileName, fileContent] of Object.entries(sessionData)) {
                const filePath = path.join(LOCAL_SESSION_PATH, fileName);
                fs.writeFileSync(filePath, Buffer.from(fileContent, 'base64'));
                Logger.debug(`Restored session file: ${fileName}`);
            }

            Logger.system('Session restored from local file');
            return true;
        } catch (error) {
            Logger.error('Error loading session from local file', error.message);
            return false;
        }
    }

    // Check if local session exists
    hasLocalSession() {
        return fs.existsSync(SESSION_EXPORT_PATH);
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
}

module.exports = SessionManager;