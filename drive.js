const { google } = require('googleapis');
const path = require('path');
const fs = require('fs');
const CREDENTIALS_PATH = path.join(__dirname, 'credentials.json');
const GOOGLE_DRIVE_FOLDER_ID = process.env.GOOGLE_DRIVE_FOLDER_ID;
const MEMORY_FILE_NAME = 'hannah_memory.json';

if (process.env.GOOGLE_CREDENTIALS && !fs.existsSync(CREDENTIALS_PATH)) {
    fs.writeFileSync(CREDENTIALS_PATH, process.env.GOOGLE_CREDENTIALS);
}

const auth = new google.auth.GoogleAuth({
    keyFile: CREDENTIALS_PATH,
    scopes: 'https://www.googleapis.com/auth/drive',
});

const drive = google.drive({ version: 'v3', auth });
let memoryFileId = null;

async function saveMemoryToDrive(memoryData) {
    if (!memoryFileId) {
        console.error("Error: Cannot save memory because memory file ID is not known. Load memory first.");
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
    } catch (e) {
        // --- FAULT TOLERANCE ---
        // Log the error but DO NOT crash the application.
        console.error("--- NON-FATAL ERROR saving memory to Drive ---", e.message);
    }
}

async function loadMemoryFromDrive() {
    console.log("Attempting to load memory from Google Drive...");
    try {
        const res = await drive.files.list({
            q: `'${GOOGLE_DRIVE_FOLDER_ID}' in parents and name='${MEMORY_FILE_NAME}' and trashed=false`,
            fields: 'files(id, name)',
        });
        if (res.data.files && res.data.files.length > 0) {
            memoryFileId = res.data.files[0].id;
            console.log(`Found memory file with ID: ${memoryFileId}. Loading...`);
            
            const file = await drive.files.get({ fileId: memoryFileId, alt: 'media' });
            
            let loadedData = file.data;
            if (typeof loadedData !== 'object' || loadedData === null) {
                 throw new Error("Loaded memory is not a valid object.");
            }
            if (!loadedData.contactMemory) loadedData.contactMemory = {};
            
            console.log('Successfully loaded memory from Google Drive.');
            return loadedData;
        }
        
        console.log('No hannah_memory.json file found in the specified Google Drive folder. Creating new one...');
        return null; 
    } catch (e) {
        console.error("ERROR loading memory from Drive:", e.message);
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
        console.log(`Created memory file with ID: ${memoryFileId}`);
        return memoryFileId;
    } catch (e) {
        console.error("Error creating memory file on Drive:", e.message);
        return null;
    }
}

module.exports = { 
    saveMemoryToDrive, 
    loadMemoryFromDrive, 
    createMemoryFileOnDrive 
};