// sessionManager.js (Baileys Version - Updated)
const fs = require('fs-extra');
const path = require('path');
const Logger = require('./logger.js');

// Google Drive Setup
const { google } = require('googleapis');
const auth = new google.auth.GoogleAuth({
    keyFile: path.join(__dirname, 'credentials.json'),
    scopes: 'https://www.googleapis.com/auth/drive',
});

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

    // Downloads creds.json from Google Drive
    async loadSessionFromDrive() {
        try {
            Logger.system('Attempting to load session from Google Drive...');
            
            if (!GOOGLE_DRIVE_FOLDER_ID) {
                Logger.error('Google Drive Folder ID not configured in environment variables.');
                return false;
            }
            
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

    // Delete session from Google Drive
    async deleteSessionFromDrive() {
        try {
            if (!GOOGLE_DRIVE_FOLDER_ID) {
                Logger.error('Google Drive Folder ID not configured in environment variables.');
                return false;
            }
            
            Logger.system('Deleting session from Google Drive...');
            
            const listRes = await drive.files.list({
                q: `'${GOOGLE_DRIVE_FOLDER_ID}' in parents and name='${SESSION_FILE_NAME}' and trashed=false`,
                fields: 'files(id)',
                pageSize: 1,
            });
            
            if (!listRes.data.files || listRes.data.files.length === 0) {
                Logger.system('No session file found on Google Drive.');
                return true; // Nothing to delete
            }
            
            const fileId = listRes.data.files[0].id;
            await drive.files.delete({ fileId: fileId });
            
            Logger.success('✓ Session successfully deleted from Google Drive!');
            return true;
        } catch (error) {
            Logger.error('Error deleting session from Google Drive', error.message);
            return false;
        }
    }

    // Delete local session
    deleteLocalSession() {
        try {
            if (this.hasLocalSession()) {
                fs.removeSync(this.sessionPath);
                Logger.success('✓ Local session successfully deleted!');
                this.isSessionLoaded = false;
                return true;
            }
            return false;
        } catch (error) {
            Logger.error('Error deleting local session', error.message);
            return false;
        }
    }

    // Get session info
    async getSessionInfo() {
        try {
            const localExists = this.hasLocalSession();
            let driveInfo = null;
            
            if (GOOGLE_DRIVE_FOLDER_ID) {
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