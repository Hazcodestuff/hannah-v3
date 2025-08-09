// drive.js (OAuth Version)
const fs = require('fs');
const { google } = require('googleapis');
const Logger = require('./logger.js');

// Google Drive OAuth Setup
let auth;
if (process.env.GOOGLE_OAUTH_TOKEN_BASE64 && process.env.GOOGLE_OAUTH_CREDS_BASE64) {
    try {
        // Decode base64 token
        const tokenJson = Buffer.from(process.env.GOOGLE_OAUTH_TOKEN_BASE64, 'base64').toString();
        const tokens = JSON.parse(tokenJson);
        
        // Decode base64 OAuth credentials
        const credentialsJson = Buffer.from(process.env.GOOGLE_OAUTH_CREDS_BASE64, 'base64').toString();
        const credentials = JSON.parse(credentialsJson);
        
        const { client_id, client_secret, redirect_uris } = credentials.installed;
        
        auth = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);
        auth.setCredentials(tokens);
        
        Logger.system('✓ Google Drive OAuth credentials loaded from environment variable');
    } catch (error) {
        Logger.error('Failed to parse Google OAuth credentials from environment variable:', error.message);
    }
} else {
    Logger.error('Google OAuth credentials not found in environment variables');
}

const drive = google.drive({ version: 'v3', auth });
const GOOGLE_DRIVE_FOLDER_ID = process.env.GOOGLE_DRIVE_FOLDER_ID;
const MEMORY_FILE_NAME = 'memory.json';

// Global variable to store the memory file ID
let memoryFileId = null;

// Load memory from Google Drive
async function loadMemoryFromDrive() {
    try {
        if (!auth) {
            Logger.error('Google Drive OAuth not configured.');
            return null;
        }
        
        if (!GOOGLE_DRIVE_FOLDER_ID) {
            Logger.error('Google Drive Folder ID not configured in environment variables.');
            return null;
        }

        Logger.system('Loading memory from Google Drive...');

        const listRes = await drive.files.list({
            q: `'${GOOGLE_DRIVE_FOLDER_ID}' in parents and name='${MEMORY_FILE_NAME}' and trashed=false`,
            fields: 'files(id, name, modifiedTime)',
            pageSize: 1,
        });

        if (!listRes.data.files || listRes.data.files.length === 0) {
            Logger.system('No memory file found on Google Drive.');
            return null;
        }

        memoryFileId = listRes.data.files[0].id;
        const modifiedTime = listRes.data.files[0].modifiedTime;
        Logger.system(`Found memory file (ID: ${memoryFileId}, Last Modified: ${modifiedTime}). Downloading...`);

        const fileRes = await drive.files.get({ 
            fileId: memoryFileId, 
            alt: 'media' 
        });

        Logger.success('✓ Memory loaded successfully from Google Drive!');
        return fileRes.data;
    } catch (error) {
        Logger.error('Error loading memory from Google Drive', error.message);
        return null;
    }
}

// Save memory to Google Drive
async function saveMemoryToDrive(memoryData) {
    try {
        if (!auth) {
            Logger.error('Google Drive OAuth not configured.');
            return false;
        }
        
        if (!GOOGLE_DRIVE_FOLDER_ID) {
            Logger.error('Google Drive Folder ID not configured in environment variables.');
            return false;
        }

        // If we don't have a memory file ID, try to create one
        if (!memoryFileId) {
            Logger.system('Memory file ID not found. Creating new memory file...');
            memoryFileId = await createMemoryFileOnDrive(memoryData);
            if (!memoryFileId) {
                Logger.error('Failed to create memory file on Google Drive');
                return false;
            }
            return true;
        }

        Logger.system('Saving memory to Google Drive...');

        const media = {
            mimeType: 'application/json',
            body: JSON.stringify(memoryData),
        };

        await drive.files.update({
            fileId: memoryFileId,
            media: media,
        });

        Logger.success('✓ Memory saved successfully to Google Drive!');
        return true;
    } catch (error) {
        Logger.error('Error saving memory to Google Drive', error.message);
        
        // If the file was not found, try to create a new one
        if (error.message.includes('notFound') || error.message.includes('File not found')) {
            Logger.system('Memory file not found. Creating new file...');
            memoryFileId = await createMemoryFileOnDrive(memoryData);
            return memoryFileId !== null;
        }
        
        return false;
    }
}

// Create memory file on Google Drive
async function createMemoryFileOnDrive(memoryData) {
    try {
        if (!auth) {
            Logger.error('Google Drive OAuth not configured.');
            return null;
        }
        
        if (!GOOGLE_DRIVE_FOLDER_ID) {
            Logger.error('Google Drive Folder ID not configured in environment variables.');
            return null;
        }

        Logger.system('Creating memory file on Google Drive...');

        const fileMetadata = {
            name: MEMORY_FILE_NAME,
            parents: [GOOGLE_DRIVE_FOLDER_ID],
        };

        const media = {
            mimeType: 'application/json',
            body: JSON.stringify(memoryData),
        };

        const file = await drive.files.create({
            resource: fileMetadata,
            media: media,
            fields: 'id',
        });

        memoryFileId = file.data.id;
        Logger.success(`✓ Memory file created successfully (ID: ${memoryFileId})!`);
        return memoryFileId;
    } catch (error) {
        Logger.error('Error creating memory file on Google Drive', error.message);
        return null;
    }
}

module.exports = {
    loadMemoryFromDrive,
    saveMemoryToDrive,
    createMemoryFileOnDrive
};