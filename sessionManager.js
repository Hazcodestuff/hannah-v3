// sessionManager.js (Updated for Render Free Tier)
const fs = require('fs-extra');
const path = require('path');
const Logger = require('./logger.js');

// Google Drive Setup
const { google } = require('googleapis');
let auth;

// Check if we have credentials as environment variable
if (process.env.GOOGLE_CREDENTIALS_BASE64) {
    try {
        // Decode base64 credentials
        const credentialsJson = Buffer.from(process.env.GOOGLE_CREDENTIALS_BASE64, 'base64').toString();
        const credentials = JSON.parse(credentialsJson);
        auth = new google.auth.GoogleAuth({
            credentials: credentials,
            scopes: 'https://www.googleapis.com/auth/drive',
        });
        Logger.system('✓ Google Drive credentials loaded from environment variable');
    } catch (error) {
        Logger.error('Failed to parse Google Drive credentials from environment variable:', error.message);
    }
} else {
    Logger.error('Google Drive credentials not found in environment variables');
}

const drive = google.drive({ version: 'v3', auth });
const GOOGLE_DRIVE_FOLDER_ID = process.env.GOOGLE_DRIVE_FOLDER_ID;
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

    // Downloads creds.json from Google Drive
    async loadSessionFromDrive() {
        try {
            // Check if we have Google Drive credentials
            if (!auth) {
                Logger.error('Google Drive credentials not configured.');
                return false;
            }
            
            if (!GOOGLE_DRIVE_FOLDER_ID) {
                Logger.error('Google Drive Folder ID not configured in environment variables.');
                return false;
            }
            
            Logger.system('Attempting to load session from Google Drive...');
            
            const listRes = await drive.files.list({
                q: `'${GOOGLE_DRIVE_FOLDER_ID}' in parents and name='${SESSION_FILE_NAME}' and trashed=false`,
                fields: 'files(id, name, modifiedTime)',
                pageSize: 1,
            });
            
            if (!listRes.data.files || listRes.data.files.length === 0) {
                Logger.system('No session file found on Google Drive.');
                return false;
            }
            
            const fileId = listRes.data.files[0].id;
            const modifiedTime = listRes.data.files[0].modifiedTime;
            Logger.system(`Found session file (ID: ${fileId}, Last Modified: ${modifiedTime}). Downloading...`);
            
            const fileRes = await drive.files.get({ 
                fileId: fileId, 
                alt: 'media' 
            });
            
            // Ensure the local sessions directory exists
            fs.ensureDirSync(this.sessionPath);
            
            // Save the file
            fs.writeFileSync(this.sessionFilePath, JSON.stringify(fileRes.data));
            
            Logger.success('✓ Session successfully restored from Google Drive!');
            this.isSessionLoaded = true;
            return true;
        } catch (error) {
            Logger.error('Error loading session from Google Drive', error.message);
            return false;
        }
    }

    // Uploads creds.json to Google Drive
    async saveSessionToDrive() {
        try {
            // Check if we have Google Drive credentials
            if (!auth) {
                Logger.error('Google Drive credentials not configured.');
                return false;
            }
            
            if (!GOOGLE_DRIVE_FOLDER_ID) {
                Logger.error('Google Drive Folder ID not configured in environment variables.');
                return false;
            }
            
            if (!this.hasLocalSession()) {
                Logger.error('No local session file to upload.');
                return false;
            }
            
            Logger.system('Uploading session to Google Drive...');
            
            // Check if file already exists
            let fileId = null;
            try {
                const listRes = await drive.files.list({
                    q: `'${GOOGLE_DRIVE_FOLDER_ID}' in parents and name='${SESSION_FILE_NAME}' and trashed=false`,
                    fields: 'files(id)',
                    pageSize: 1,
                });
                
                if (listRes.data.files && listRes.data.files.length > 0) {
                    fileId = listRes.data.files[0].id;
                    Logger.system(`Existing session file found (ID: ${fileId}). Updating...`);
                }
            } catch (error) {
                Logger.debug('Error checking for existing session file:', error.message);
            }
            
            // Read the local session file
            const sessionData = fs.readFileSync(this.sessionFilePath);
            
            // Prepare file metadata
            const media = {
                mimeType: 'application/json',
                body: sessionData,
            };
            
            let result;
            if (fileId) {
                // Update existing file
                result = await drive.files.update({
                    fileId: fileId,
                    media: media,
                });
            } else {
                // Create new file
                const fileMetadata = {
                    name: SESSION_FILE_NAME,
                    parents: [GOOGLE_DRIVE_FOLDER_ID],
                };
                
                result = await drive.files.create({
                    resource: fileMetadata,
                    media: media,
                    fields: 'id',
                });
            }
            
            Logger.success(`✓ Session successfully saved to Google Drive (ID: ${result.data.id})!`);
            return true;
        } catch (error) {
            Logger.error('Error saving session to Google Drive', error.message);
            return false;
        }
    }

    // Get session info
    async getSessionInfo() {
        try {
            const localExists = this.hasLocalSession();
            let driveInfo = null;
            
            if (GOOGLE_DRIVE_FOLDER_ID && auth) {
                try {
                    const listRes = await drive.files.list({
                        q: `'${GOOGLE_DRIVE_FOLDER_ID}' in parents and name='${SESSION_FILE_NAME}' and trashed=false`,
                        fields: 'files(id, name, modifiedTime, size)',
                        pageSize: 1,
                    });
                    
                    if (listRes.data.files && listRes.data.files.length > 0) {
                        driveInfo = listRes.data.files[0];
                    }
                } catch (error) {
                    Logger.debug('Error getting session info from Drive:', error.message);
                }
            }
            
            return {
                localExists,
                driveInfo,
                isLoaded: this.isSessionLoaded
            };
        } catch (error) {
            Logger.error('Error getting session info', error.message);
            return {
                localExists: false,
                driveInfo: null,
                isLoaded: false
            };
        }
    }
}

module.exports = SessionManager;