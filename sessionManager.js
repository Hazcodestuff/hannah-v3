const fs = require('fs');
const path = require('path');
const Logger = require('./logger.js');

// Define paths
const LOCAL_SESSION_PATH = path.join(__dirname, '.wwebjs_auth');
const TEMP_SESSION_PATH = path.join(__dirname, '.temp_session');
const SESSION_EXPORT_PATH = path.join(__dirname, 'hannah-session.zip');
const SESSION_DOWNLOAD_PATH = path.join(__dirname, 'hannah-session-downloaded.zip');

// Google Drive setup
const { google } = require('googleapis');
const auth = new google.auth.GoogleAuth({
    keyFile: path.join(__dirname, 'credentials.json'),
    scopes: 'https://www.googleapis.com/auth/drive',
});
const drive = google.drive({ version: 'v3', auth });
const GOOGLE_DRIVE_FOLDER_ID = process.env.GOOGLE_DRIVE_FOLDER_ID;
const SESSION_FILE_NAME = 'hannah-session.zip';

class SessionManager {
    constructor() {
        this.sessionFileId = null;
    }

    // Copy session files to temporary directory
    async copySessionFilesToTemp() {
        try {
            // Clean up any existing temp directory
            if (fs.existsSync(TEMP_SESSION_PATH)) {
                fs.rmSync(TEMP_SESSION_PATH, { recursive: true, force: true });
            }
            
            // Create temp directory
            fs.mkdirSync(TEMP_SESSION_PATH, { recursive: true });
            
            // Copy all files from session directory to temp directory
            const sessionFiles = fs.readdirSync(LOCAL_SESSION_PATH);
            for (const file of sessionFiles) {
                const srcPath = path.join(LOCAL_SESSION_PATH, file);
                const destPath = path.join(TEMP_SESSION_PATH, file);
                
                // Skip directories
                if (fs.statSync(srcPath).isDirectory()) {
                    continue;
                }
                
                // Copy file
                fs.copyFileSync(srcPath, destPath);
                Logger.debug(`Copied session file: ${file}`);
            }
            
            Logger.system(`Session files copied to temporary directory`);
            return true;
        } catch (error) {
            Logger.error('Error copying session files to temp directory', error.message);
            return false;
        }
    }

    // Save session to local ZIP file
    async saveSessionToZip() {
        try {
            // Check if session directory exists
            if (!fs.existsSync(LOCAL_SESSION_PATH)) {
                Logger.error('Local session directory not found');
                return false;
            }

            // Copy session files to temporary directory
            const copySuccess = await this.copySessionFilesToTemp();
            if (!copySuccess) {
                Logger.error('Failed to copy session files to temporary directory');
                return false;
            }

            const AdmZip = require('adm-zip');
            const zip = new AdmZip();

            // Add all files from the temp directory
            zip.addLocalFolder(TEMP_SESSION_PATH);

            // Write the ZIP file
            zip.writeZip(SESSION_EXPORT_PATH);
            
            // Clean up temp directory
            if (fs.existsSync(TEMP_SESSION_PATH)) {
                fs.rmSync(TEMP_SESSION_PATH, { recursive: true, force: true });
            }
            
            Logger.system(`Session archived to: ${SESSION_EXPORT_PATH}`);
            return true;
        } catch (error) {
            Logger.error('Error saving session to ZIP', error.message);
            
            // Clean up temp directory in case of error
            try {
                if (fs.existsSync(TEMP_SESSION_PATH)) {
                    fs.rmSync(TEMP_SESSION_PATH, { recursive: true, force: true });
                }
            } catch (cleanupError) {
                Logger.error('Error cleaning up temp directory', cleanupError.message);
            }
            
            return false;
        }
    }

    // Extract session from ZIP file
    async extractSessionFromZip() {
        try {
            if (!fs.existsSync(SESSION_DOWNLOAD_PATH)) {
                Logger.error('Session ZIP file not found');
                return false;
            }

            const AdmZip = require('adm-zip');
            const zip = new AdmZip(SESSION_DOWNLOAD_PATH);
            
            // Extract all to the project directory
            zip.extractAllTo(__dirname, true);
            
            Logger.system('Session extraction complete');
            return true;
        } catch (error) {
            Logger.error('Error extracting session from ZIP', error.message);
            return false;
        }
    }

    // Upload session ZIP to Google Drive
    async uploadSessionToDrive() {
        try {
            if (!fs.existsSync(SESSION_EXPORT_PATH)) {
                Logger.error('Session ZIP file not found');
                return false;
            }

            // Check if we already have a session file on Drive
            if (!this.sessionFileId) {
                try {
                    const fileList = await drive.files.list({
                        q: `'${GOOGLE_DRIVE_FOLDER_ID}' in parents and name='${SESSION_FILE_NAME}' and trashed=false`,
                        fields: 'files(id, name)',
                    });

                    if (fileList.data.files && fileList.data.files.length > 0) {
                        this.sessionFileId = fileList.data.files[0].id;
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
                        mimeType: 'application/zip',
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
                        mimeType: 'application/zip',
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

    // Download session ZIP from Google Drive
    async downloadSessionFromDrive() {
        try {
            // Check if session file exists on Drive
            const fileList = await drive.files.list({
                q: `'${GOOGLE_DRIVE_FOLDER_ID}' in parents and name='${SESSION_FILE_NAME}' and trashed=false`,
                fields: 'files(id, name)',
            });

            if (!fileList.data.files || fileList.data.files.length === 0) {
                Logger.system('No session file found on Google Drive');
                return false;
            }

            this.sessionFileId = fileList.data.files[0].id;
            Logger.system(`Found session file on Google Drive with ID: ${this.sessionFileId}`);

            // Download the session file
            const dest = fs.createWriteStream(SESSION_DOWNLOAD_PATH);
            const response = await drive.files.get({
                fileId: this.sessionFileId,
                alt: 'media',
            }, { responseType: 'stream' });

            response.data
                .on('end', () => {
                    Logger.system(`Session downloaded to: ${SESSION_DOWNLOAD_PATH}`);
                })
                .on('error', (err) => {
                    Logger.error('Error downloading session', err);
                })
                .pipe(dest);

            return true;
        } catch (error) {
            Logger.error('Error downloading session from Google Drive', error.message);
            return false;
        }
    }

    // Load session from Google Drive (complete process)
    async loadSessionFromDrive() {
        Logger.system('=== SESSION RESTORATION FROM GOOGLE DRIVE ===');
        
        // Step 1: Download session from Google Drive
        Logger.system('Step 1: Downloading session from Google Drive...');
        const downloadSuccess = await this.downloadSessionFromDrive();
        
        if (!downloadSuccess) {
            Logger.system('✗ Failed to download session from Google Drive');
            return false;
        }
        
        Logger.system('✓ Session downloaded successfully');
        
        // Step 2: Extract session from ZIP
        Logger.system('Step 2: Extracting session from ZIP...');
        const extractSuccess = await this.extractSessionFromZip();
        
        if (!extractSuccess) {
            Logger.system('✗ Failed to extract session from ZIP');
            return false;
        }
        
        Logger.system('✓ Session extracted successfully');
        Logger.system('=== SESSION RESTORATION COMPLETE ===');
        
        return true;
    }

    // Save session to Google Drive (complete process)
    async saveSessionToDrive() {
        Logger.system('=== SESSION BACKUP TO GOOGLE DRIVE ===');
        
        // Step 1: Create ZIP from session
        Logger.system('Step 1: Creating ZIP from session...');
        const zipSuccess = await this.saveSessionToZip();
        
        if (!zipSuccess) {
            Logger.system('✗ Failed to create ZIP from session');
            return false;
        }
        
        Logger.system('✓ ZIP created successfully');
        
        // Step 2: Upload ZIP to Google Drive
        Logger.system('Step 2: Uploading ZIP to Google Drive...');
        const uploadSuccess = await this.uploadSessionToDrive();
        
        if (!uploadSuccess) {
            Logger.system('✗ Failed to upload ZIP to Google Drive');
            return false;
        }
        
        Logger.system('✓ ZIP uploaded successfully');
        Logger.system('=== SESSION BACKUP COMPLETE ===');
        
        return true;
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
        
        if (fs.existsSync(TEMP_SESSION_PATH)) {
            fs.rmSync(TEMP_SESSION_PATH, { recursive: true, force: true });
            Logger.system('Temp session directory cleared');
        }
        
        if (fs.existsSync(SESSION_EXPORT_PATH)) {
            fs.unlinkSync(SESSION_EXPORT_PATH);
            Logger.system('Session export file cleared');
        }
        
        if (fs.existsSync(SESSION_DOWNLOAD_PATH)) {
            fs.unlinkSync(SESSION_DOWNLOAD_PATH);
            Logger.system('Session download file cleared');
        }
    }
}

module.exports = SessionManager;