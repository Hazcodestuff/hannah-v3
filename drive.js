const fs = require('fs');
const path = require('path');
const Logger = require('./logger.js');

// Google Drive setup - using the same authentication as sessionManager
const { google } = require('googleapis');
const auth = new google.auth.GoogleAuth({
    keyFile: path.join(__dirname, 'credentials.json'),
    scopes: 'https://www.googleapis.com/auth/drive',
});
const drive = google.drive({ version: 'v3', auth });
const GOOGLE_DRIVE_FOLDER_ID = process.env.GOOGLE_DRIVE_FOLDER_ID;
const MEMORY_FILE_NAME = 'hannah_memory.json';

let memoryFileId = null;

async function saveMemoryToDrive(memoryData) {
    if (!memoryFileId) {
        Logger.error("Error: Cannot save memory because memory file ID is not known. Load memory first.");
        return;
    }
    
    try {
        const memoryString = JSON.stringify(memoryData, null, 2);
        const { Readable } = require('stream');
        const bufferStream = new Readable();
        bufferStream.push(memoryString);
        bufferStream.push(null);
        const media = {
            mimeType: 'application/json',
            body: bufferStream,
        };
        await drive.files.update({
            fileId: memoryFileId,
            media: media,
        });
        Logger.debug('Memory saved to Google Drive');
    } catch (e) {
        Logger.error("--- NON-FATAL ERROR saving memory to Drive ---", e.message);
    }
}

async function loadMemoryFromDrive() {
    Logger.system("Attempting to load memory from Google Drive...");
    
    try {
        const fileList = await drive.files.list({
            q: `'${GOOGLE_DRIVE_FOLDER_ID}' in parents and name='${MEMORY_FILE_NAME}' and trashed=false`,
            fields: 'files(id, name)',
        });
        
        if (fileList.data.files && fileList.data.files.length > 0) {
            memoryFileId = fileList.data.files[0].id;
            Logger.system(`Found memory file with ID: ${memoryFileId}. Loading...`);
            
            const file = await drive.files.get({ fileId: memoryFileId, alt: 'media' });
            
            let loadedData = file.data;
            if (typeof loadedData !== 'object' || loadedData === null) {
                 throw new Error("Loaded memory is not a valid object.");
            }
            if (!loadedData.contactMemory) loadedData.contactMemory = {};
            
            Logger.system('Successfully loaded memory from Google Drive.');
            return loadedData;
        }
        
        Logger.system('No hannah_memory.json file found in the specified Google Drive folder. Creating new one...');
        return null; 
    } catch (e) {
        Logger.error("ERROR loading memory from Drive:", e.message);
        return null;
    }
}

async function createMemoryFileOnDrive(memoryData) {
    try {
        const memoryString = JSON.stringify(memoryData, null, 2);
        const { Readable } = require('stream');
        const bufferStream = new Readable();
        bufferStream.push(memoryString);
        bufferStream.push(null);
        const media = {
            mimeType: 'application/json',
            body: bufferStream,
        };
        const file = await drive.files.create({
            resource: {
                name: MEMORY_FILE_NAME,
                parents: [GOOGLE_DRIVE_FOLDER_ID],
            },
            media: media,
            fields: 'id',
        });
        memoryFileId = file.data.id;
        Logger.system(`Created memory file with ID: ${memoryFileId}`);
        return memoryFileId;
    } catch (e) {
        Logger.error("Error creating memory file on Drive:", e.message);
        return null;
    }
}

module.exports = { 
    saveMemoryToDrive, 
    loadMemoryFromDrive, 
    createMemoryFileOnDrive 
};