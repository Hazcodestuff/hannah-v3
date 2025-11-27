const Logger = require('./logger.js');
const { loadMemoryFromDrive, saveMemoryToDrive, createMemoryFileOnDrive } = require('./drive.js');

let memoryData = {
  contactMemory: {},
  hannahsCrush: null,
  currentMood: "chill",
  globalMemories: [],
  isPraying: false
};

async function loadMemory() {
  try {
    const loadedData = await loadMemoryFromDrive();
    if (loadedData) {
      memoryData = loadedData;
      Logger.system('Memory loaded successfully from Google Drive');
      if (memoryData.isPraying) {
        Logger.system('Resetting prayer state on startup...');
        memoryData.isPraying = false;
        await saveMemory();
      }
    } else {
      Logger.system('Creating new memory file on Google Drive...');
      const fileId = await createMemoryFileOnDrive(memoryData);
      if (fileId) {
        Logger.system('New memory file created successfully');
      } else {
        Logger.error('Failed to create memory file on Google Drive');
      }
    }
  } catch (error) {
    Logger.error('Error loading memory:', error.stack);
  }
}

async function saveMemory() {
  try {
    await saveMemoryToDrive(memoryData);
  } catch (error) {
    Logger.error('Error saving memory:', error.stack);
  }
}

module.exports = {
  memoryData,
  loadMemory,
  saveMemory
};
