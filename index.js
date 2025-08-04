require('dotenv').config();
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const Logger = require('./logger.js');
const SessionManager = require('./sessionManager');
const sessionManager = new SessionManager();

// Import modules
const { hannahProfile, getAiResponse, sendHannahsMessage } = require('./hannah.js'); 
const { loadMemoryFromDrive, saveMemoryToDrive, createMemoryFileOnDrive } = require('./drive.js');
const { 
    updateGlobalMood, 
    updateBoredomLevels, 
    checkGhosting, 
    startProactiveConversation,
    setPrayerState,
    checkInWithFriends,
    sendGoodMorningMessages,
    handleLongTermGhosting,
    shareDailyThought,
    shareGossip
} = require('./tasks.js');

// Global memory state
let memoryData = {
    contactMemory: {},
    hannahsCrush: null,
    currentMood: "chill",
    globalMemories: [],
    isPraying: false
};

// Load memory from Google Drive
async function loadMemory() {
    try {
        const loadedData = await loadMemoryFromDrive();
        if (loadedData) {
            memoryData = loadedData;
            console.log('Memory loaded successfully from Google Drive');
            
            // Reset prayer state if stuck
            if (memoryData.isPraying) {
                console.log('Resetting prayer state on startup...');
                memoryData.isPraying = false;
                await saveMemory();
            }
        } else {
            console.log('Creating new memory file on Google Drive...');
            const fileId = await createMemoryFileOnDrive(memoryData);
            if (fileId) {
                console.log('New memory file created successfully');
            } else {
                console.error('Failed to create memory file on Google Drive');
            }
        }
    } catch (error) {
        console.error('Error loading memory:', error);
    }
}

// Save memory to Google Drive (reduced log spam)
async function saveMemory() {
    try {
        await saveMemoryToDrive(memoryData);
    } catch (error) {
        console.error('Error saving memory:', error);
    }
}

// Initialize user memory
function initializeUserMemory(contactId, contact = null) {
    if (!memoryData.contactMemory[contactId]) {
        memoryData.contactMemory[contactId] = {
            interactionScore: 0,
            boredomLevel: 0,
            history: [],
            sharedMemories: [],
            isAngry: false,
            isSulking: false,
            shortTermEmotion: null,
            lastInteraction: Date.now(),
            firstMet: Date.now(),
            conversationTopics: [],
            personalityNotes: [],
            lastMessageTimestamp: Date.now(),
            isAwaitingReply: false,
            hasFollowedUpOnGhosting: false,
            lastQuestionTimestamp: null,
            missedDuringPrayer: [],
            chatId: contactId,
            // Enhanced features
            assumptions: [],
            gossipShared: [],
            weirdInteractions: [],
            contactInfo: {
                name: contact?.name || contact?.pushname || "Unknown",
                profilePicUrl: null,
                bio: null,
                lastUpdated: Date.now()
            }
        };
        saveMemory();
    }
}

// Simple rate limiter to prevent API abuse
let lastApiCall = 0;
const MIN_API_CALL_INTERVAL = 2000; // 2 seconds between API calls

async function rateLimit() {
    const now = Date.now();
    const timeSinceLastCall = now - lastApiCall;
    
    if (timeSinceLastCall < MIN_API_CALL_INTERVAL) {
        const delay = MIN_API_CALL_INTERVAL - timeSinceLastCall;
        console.log(`Rate limiting: waiting ${delay}ms before making API call`);
        await new Promise(resolve => setTimeout(resolve, delay));
    }
    
    lastApiCall = Date.now();
}

// Add this function to test gossip
function testGossipSystem() {
    Logger.system('=== TESTING GOSSIP SYSTEM ===');
    
    // Check if we have any weird interactions
    let weirdInteractionsFound = false;
    for (const [contactId, contact] of Object.entries(memoryData.contactMemory)) {
        if (contact.weirdInteractions && contact.weirdInteractions.length > 0) {
            weirdInteractionsFound = true;
            Logger.system(`Found weird interactions from ${contact.contactInfo.name}: ${contact.weirdInteractions.length}`);
            
            contact.weirdInteractions.forEach((interaction, index) => {
                Logger.system(`  ${index + 1}: "${interaction.message}"`);
            });
        }
    }
    
    if (!weirdInteractionsFound) {
        Logger.system('No weird interactions found. Creating test data...');
        
        // Create test weird interaction
        const testContactId = 'test123@c.us';
        if (!memoryData.contactMemory[testContactId]) {
            memoryData.contactMemory[testContactId] = {
                contactInfo: { name: 'TestUser' },
                weirdInteractions: [],
                interactionScore: 0
            };
        }
        
        memoryData.contactMemory[testContactId].weirdInteractions.push({
            keyword: 'i like you',
            message: 'hey i like you wanna date',
            timestamp: Date.now(),
            sharedWith: []
        });
        
        // Trigger gossip
        triggerGossipAboutContact(testContactId, memoryData.contactMemory[testContactId].weirdInteractions[0]);
        
        Logger.system('Test weird interaction created and gossip triggered');
    }
    
    Logger.system('=== END TEST ===');
    saveMemory();
}

// Update friendship score
function updateFriendshipScore(contactId, change, reason = '') {
    const userMemory = memoryData.contactMemory[contactId];
    if (!userMemory) return;
    
    userMemory.interactionScore = Math.max(0, Math.min(100, userMemory.interactionScore + change));
    
    if (reason) {
        userMemory.personalityNotes.push({
            note: reason,
            scoreChange: change,
            timestamp: Date.now()
        });
    }
    
    saveMemory();
}

// Update conversation history
function updateConversationHistory(contactId, userMessage, hannahResponse) {
    const userMemory = memoryData.contactMemory[contactId];
    if (!userMemory) return;
    
    userMemory.history.push(
        { role: "user", parts: [{ text: userMessage }] },
        { role: "model", parts: [{ text: hannahResponse }] }
    );
    
    // Keep history manageable
    if (userMemory.history.length > 40) {
        userMemory.history = userMemory.history.slice(-40);
    }
    
    userMemory.lastInteraction = Date.now();
    userMemory.lastMessageTimestamp = Date.now();
    
    saveMemory();
}

// Extract and store memories with enhanced keyword detection
// Replace the extractAndStoreMemories function with this improved version:
function extractAndStoreMemories(contactId, message, response) {
    const userMemory = memoryData.contactMemory[contactId];
    if (!userMemory) return;
    
    // Track questions
    const isQuestion = message.includes('?');
    if (isQuestion) {
        userMemory.isAwaitingReply = true;
        userMemory.lastQuestionTimestamp = Date.now();
        userMemory.hasFollowedUpOnGhosting = false;
    }
    
    // Detect weird/cheesy interactions for gossip
    const weirdKeywords = [
        'i like you', 'love you', 'date me', 'sexy', 'hot', 'marry me', 
        'be my girlfriend', 'you are beautiful', 'wanna hook up', 'your boyfriend', 'your girlfriend'
    ];
    const messageLower = message.toLowerCase();
    
    for (const keyword of weirdKeywords) {
        if (messageLower.includes(keyword)) {
            const weirdInteraction = {
                keyword: keyword,
                message: message,
                timestamp: Date.now(),
                sharedWith: []
            };
            
            // Ensure arrays exist
            if (!userMemory.weirdInteractions) userMemory.weirdInteractions = [];
            userMemory.weirdInteractions.push(weirdInteraction);
            
            Logger.action(`Stored weird interaction from ${userMemory.contactInfo.name}: "${message}"`);
            triggerGossipAboutContact(contactId, weirdInteraction);
            break;
        }
    }
    
    // Store important memories
    const importantKeywords = ['birthday', 'anniversary', 'breakup', 'new job', 'moved', 'travel', 'sick', 'family'];
    for (const keyword of importantKeywords) {
        if (messageLower.includes(keyword)) {
            const memory = `${keyword}: ${message.substring(0, 100)}`;
            if (!userMemory.sharedMemories.includes(memory)) {
                userMemory.sharedMemories.push(memory);
            }
        }
    }
    
    // Track conversation topics
    const topics = ['music', 'art', 'biology', 'school', 'friends', 'family', 'relationship', 'food'];
    for (const topic of topics) {
        if (messageLower.includes(topic) && !userMemory.conversationTopics.includes(topic)) {
            userMemory.conversationTopics.push(topic);
        }
    }
    
    saveMemory();
}

// Replace the triggerGossipAboutContact function with this improved version:
function triggerGossipAboutContact(contactId, weirdInteraction) {
    const contactMemory = memoryData.contactMemory[contactId];
    if (!contactMemory) return;
    
    const contactName = contactMemory.contactInfo.name;
    
    Logger.action(`Triggering gossip about ${contactName}`);
    
    // Share with ALL contacts who have friendship score 10+ (lowered threshold)
    let gossipCount = 0;
    for (const [friendId, friendMemory] of Object.entries(memoryData.contactMemory)) {
        if (friendId !== contactId && friendMemory.interactionScore >= 10) {
            const gossip = {
                about: contactId,
                aboutName: contactName,
                interaction: weirdInteraction,
                timestamp: Date.now(),
                hasBeenShared: false
            };
            
            // Ensure array exists
            if (!friendMemory.gossipShared) friendMemory.gossipShared = [];
            
            // Check if already shared
            const alreadyShared = friendMemory.gossipShared.some(g => 
                g.about === contactId && g.interaction.message === weirdInteraction.message
            );
            
            if (!alreadyShared) {
                friendMemory.gossipShared.push(gossip);
                gossipCount++;
                Logger.debug(`Gossip stored about ${contactName} with ${friendMemory.contactInfo.name} (score: ${friendMemory.interactionScore})`);
            }
        }
    }
    
    Logger.system(`Gossip about ${contactName} shared with ${gossipCount} friends`);
    saveMemory();
}

// Trigger gossip with close friends
function triggerGossipAboutContact(contactId, weirdInteraction) {
    const contactMemory = memoryData.contactMemory[contactId];
    if (!contactMemory) return;
    
    const contactName = contactMemory.contactInfo.name;
    
    // Share with close friends only
    for (const [friendId, friendMemory] of Object.entries(memoryData.contactMemory)) {
        if (friendId !== contactId && friendMemory.interactionScore >= 50) {
            const gossip = {
                about: contactId,
                aboutName: contactName,
                interaction: weirdInteraction,
                timestamp: Date.now(),
                hasBeenShared: false
            };
            
            // Ensure array exists
            if (!friendMemory.gossipShared) friendMemory.gossipShared = [];
            
            // Check if already shared
            const alreadyShared = friendMemory.gossipShared.some(g => 
                g.about === contactId && g.interaction.message === weirdInteraction.message
            );
            
            if (!alreadyShared) {
                friendMemory.gossipShared.push(gossip);
                console.log(`Gossip stored about ${contactName} with ${friendMemory.contactInfo.name}`);
            }
        }
    }
    
    saveMemory();
}

// Add this function to index.js for debugging
function debugGossipSystem() {
    Logger.system('=== GOSSIP SYSTEM DEBUG ===');
    
    let totalGossip = 0;
    let totalWeirdInteractions = 0;
    
    for (const [contactId, contact] of Object.entries(memoryData.contactMemory)) {
        Logger.debug(`Contact: ${contact.contactInfo.name} (${contactId})`);
        
        if (contact.weirdInteractions && contact.weirdInteractions.length > 0) {
            totalWeirdInteractions += contact.weirdInteractions.length;
            Logger.debug(`  Weird interactions: ${contact.weirdInteractions.length}`);
            
            contact.weirdInteractions.forEach((interaction, index) => {
                Logger.debug(`    ${index + 1}: "${interaction.message}" (shared with: ${interaction.sharedWith.length} people)`);
            });
        }
        
        if (contact.gossipShared && contact.gossipShared.length > 0) {
            totalGossip += contact.gossipShared.length;
            Logger.debug(`  Gossip received: ${contact.gossipShared.length}`);
            
            contact.gossipShared.forEach((gossip, index) => {
                Logger.debug(`    ${index + 1}: About ${gossip.aboutName} - "${gossip.interaction.message}" (shared: ${gossip.hasBeenShared})`);
            });
        }
    }
    
    Logger.system(`Total weird interactions: ${totalWeirdInteractions}`);
    Logger.system(`Total gossip entries: ${totalGossip}`);
    Logger.system('=== END DEBUG ===');
}

// Call this function periodically, for example in the message event handler:
// After processing a message, add:
function debugGossipSystem() {
    Logger.system('=== GOSSIP SYSTEM DEBUG ===');
    
    let totalGossip = 0;
    let totalWeirdInteractions = 0;
    
    for (const [contactId, contact] of Object.entries(memoryData.contactMemory)) {
        Logger.debug(`Contact: ${contact.contactInfo.name} (${contactId})`);
        
        if (contact.weirdInteractions && contact.weirdInteractions.length > 0) {
            totalWeirdInteractions += contact.weirdInteractions.length;
            Logger.debug(`  Weird interactions: ${contact.weirdInteractions.length}`);
            
            contact.weirdInteractions.forEach((interaction, index) => {
                Logger.debug(`    ${index + 1}: "${interaction.message}" (shared with: ${interaction.sharedWith.length} people)`);
            });
        }
        
        if (contact.gossipShared && contact.gossipShared.length > 0) {
            totalGossip += contact.gossipShared.length;
            Logger.debug(`  Gossip received: ${contact.gossipShared.length}`);
            
            contact.gossipShared.forEach((gossip, index) => {
                Logger.debug(`    ${index + 1}: About ${gossip.aboutName} - "${gossip.interaction.message}" (shared: ${gossip.hasBeenShared})`);
            });
        }
    }
    
    Logger.system(`Total weird interactions: ${totalWeirdInteractions}`);
    Logger.system(`Total gossip entries: ${totalGossip}`);
    Logger.system('=== END DEBUG ===');
}

// Get friendship tier
function getFriendshipTier(contactId) {
    const userMemory = memoryData.contactMemory[contactId];
    if (!userMemory) return 'stranger';
    
    const score = userMemory.interactionScore;
    
    for (const [tier, config] of Object.entries(hannahProfile.friendshipTiers)) {
        if (score >= config.minScore && score <= config.maxScore) {
            return tier;
        }
    }
    
    return 'stranger';
}

// Make assumptions about contact with better error handling
async function makeAssumptionsAboutContact(contactId, client) {
    try {
        // Initialize memory if needed
        if (!memoryData.contactMemory[contactId]) {
            const contact = await client.getContactById(contactId);
            initializeUserMemory(contactId, contact);
        }
        
        const userMemory = memoryData.contactMemory[contactId];
        if (!userMemory) return;
        
        // Ensure contact info exists
        if (!userMemory.contactInfo) {
            userMemory.contactInfo = { name: "Unknown", profilePicUrl: null, bio: null, lastUpdated: Date.now() };
        }
        
        // Get contact info
        const contact = await client.getContactById(contactId);
        if (contact.name || contact.pushname) {
            userMemory.contactInfo.name = contact.name || contact.pushname;
        }
        userMemory.contactInfo.lastUpdated = Date.now();
        
        // Get profile picture
        try {
            userMemory.contactInfo.profilePicUrl = await contact.getProfilePicUrl();
        } catch (error) {
            console.log(`No profile pic for ${contactId}`);
        }
        
        // Make assumptions based on available info
        const assumptions = [];
        const name = userMemory.contactInfo.name.toLowerCase();
        
        // Name-based assumptions
        if (name.includes('ahmad') || name.includes('muhammad') || name.includes('ali')) {
            assumptions.push("probably a muslim guy");
        }
        if (name.includes('girl') || name.includes('baby') || name.includes('princess')) {
            assumptions.push("cringey name alert");
        }
        if (name.includes('king') || name.includes('boss') || name.includes('lord')) {
            assumptions.push("thinks he's cool");
        }
        if (contactId.includes('60')) {
            assumptions.push("malaysian number");
        }
        
        // Random assumptions
        const randomAssumptions = [
            "probably uses tiktok too much", "definitely watches anime", "might be a gamer", 
            "probably has weird music taste", "could be a cat person", "might be introverted"
        ];
        
        if (Math.random() > 0.7 && assumptions.length < 3) {
            assumptions.push(randomAssumptions[Math.floor(Math.random() * randomAssumptions.length)]);
        }
        
        userMemory.assumptions = assumptions;
        console.log(`Made assumptions about ${userMemory.contactInfo.name}: ${assumptions.join(', ')}`);
        saveMemory();
    } catch (error) {
        console.error('Error making assumptions:', error);
    }
}

// Process proactive tasks
async function processProactiveTasks(client) {
    try {
        let allJobs = [];
        
        // Collect all jobs
        allJobs = allJobs.concat(await checkGhosting(client, memoryData));
        allJobs = allJobs.concat(await handleLongTermGhosting(client, memoryData));
        allJobs = allJobs.concat(await startProactiveConversation(client, memoryData));
        allJobs = allJobs.concat(await checkInWithFriends(client, memoryData));
        allJobs = allJobs.concat(await sendGoodMorningMessages(client, memoryData));
        allJobs = allJobs.concat(await shareDailyThought(client, memoryData));
        allJobs = allJobs.concat(await shareGossip(client, memoryData));
        
        // Execute all jobs
        for (const job of allJobs) {
            if (job.decision) {
                await sendHannahsMessage(client, job.userData.chatId, job.decision, job.userName);
                job.userData.lastMessageTimestamp = Date.now();
                job.userData.boredomLevel = 0;
            }
        }
        
        if (allJobs.length > 0) saveMemory();
    } catch (error) {
        console.error('Error processing proactive tasks:', error);
    }
}

if (typeof updateBoredomLevels !== 'function') {
    function updateBoredomLevels(memoryData) {
        const twoHours = 2 * 60 * 60 * 1000;
        for (const [userName, userData] of Object.entries(memoryData.contactMemory)) {
            if (Date.now() - (userData.lastMessageTimestamp || 0) > twoHours) {
                if (!userData.boredomLevel) userData.boredomLevel = 0;
                if (userData.boredomLevel < 10) userData.boredomLevel++;
            }
        }
    }
    console.log('Using fallback updateBoredomLevels function');
}

if (typeof updateGlobalMood !== 'function') {
    function updateGlobalMood(memoryData) {
        const moods = ['normal', 'grumpy', 'energetic', 'introspective', 'feeling goofy', 'a bit sad'];
        const newMood = moods[Math.floor(Math.random() * moods.length)];
        if (newMood !== memoryData.currentMood) {
            memoryData.currentMood = newMood;
            Logger.system(`--- MOOD SWING: Hannah is now feeling ${newMood} ---`);
            return true;
        }
        return false;
    }
    console.log('Using fallback updateGlobalMood function');
}

if (typeof checkPrayerTimes !== 'function') {
    function checkPrayerTimes(client) {
        const now = new Date();
        const currentHour = now.getHours();
        const currentMinute = now.getMinutes();
        
        const prayerTimes = {
            Fajr: { hour: 5, minute: 30, duration: 10 }, 
            Dhuhr: { hour: 13, minute: 0, duration: 10 },
            Asr: { hour: 16, minute: 30, duration: 10 }, 
            Maghrib: { hour: 19, minute: 0, duration: 10 },
            Isha: { hour: 21, minute: 0, duration: 10 }
        };
        
        // Check if it's time for any prayer
        for (const [prayerName, time] of Object.entries(prayerTimes)) {
            if (currentHour === time.hour && currentMinute === time.minute && !memoryData.isPraying) {
                Logger.system(`Starting prayer time for ${prayerName}`);
                if (typeof setPrayerState === 'function') {
                    setPrayerState(client, memoryData, prayerName, time.duration);
                }
            }
        }
        
        // Safety check for stuck prayer state
        if (memoryData.isPraying) {
            let prayerStartedAt = null;
            for (const [userName, userData] of Object.entries(memoryData.contactMemory)) {
                if (userData.prayerStartedAt) {
                    if (!prayerStartedAt || userData.prayerStartedAt > prayerStartedAt) {
                        prayerStartedAt = userData.prayerStartedAt;
                    }
                }
            }
            if (prayerStartedAt && (Date.now() - prayerStartedAt > 30 * 60 * 1000)) {
                Logger.system('Prayer state stuck for too long, resetting...');
                memoryData.isPraying = false;
                saveMemory();
            }
        }
    }
    console.log('Using fallback checkPrayerTimes function');
}

if (typeof processProactiveTasks !== 'function') {
    async function processProactiveTasks(client) {
        try {
            let allJobs = [];
            
            // Collect all jobs (simplified version without tasks.js)
            // You can add more proactive tasks here as needed
            
            // Execute all jobs
            for (const job of allJobs) {
                if (job.decision) {
                    await sendHannahsMessage(client, job.userData.chatId, job.decision, job.userName);
                    job.userData.lastMessageTimestamp = Date.now();
                    job.userData.boredomLevel = 0;
                }
            }
            
            if (allJobs.length > 0) saveMemory();
        } catch (error) {
            Logger.error('Error processing proactive tasks', error.message);
        }
    }
    console.log('Using fallback processProactiveTasks function');
}


class HannahBot {
    constructor() {
        this.client = new Client({
            authStrategy: new LocalAuth({ 
                clientId: "hannah-bot",
                dataPath: "./.wwebjs_auth" // Ensure this matches the path in sessionManager.js
            }),
            puppeteer: { 
                args: ['--no-sandbox', '--disable-setuid-sandbox'],
                headless: true // Important for Render deployment
            }
        });
        this.setupEventListeners();
        this.startPeriodicUpdates();
    }

    setupEventListeners() {
        // QR Code
        this.client.on('qr', async (qr) => { 
            qrcode.generate(qr, { small: true });
            Logger.system('QR code generated, please scan with WhatsApp');
        });
        
        // Update the 'ready' event:
this.client.on('ready', async () => { 
    Logger.system('Hannah is ready! 🌟');
    
    // Save session to both local file and Google Drive
    Logger.system('Saving session to local file...');
    await sessionManager.saveSessionLocally();
    
    Logger.system('Saving session to Google Drive...');
    await sessionManager.saveSessionToDrive();
    
    Logger.system('Session saved to both local file and Google Drive');
    
    // Load memory
    await loadMemory(); 
});
        
        // Disconnected
        this.client.on('disconnected', async (reason) => {
            Logger.error('WhatsApp client disconnected', reason);
            Logger.system('Attempting to restart...');
            
            // Save session one last time before disconnecting
            await sessionManager.saveSessionToDrive();
            
            // Restart the bot
            setTimeout(() => {
                this.client.initialize();
            }, 5000);
        });
        
        // Message handling
        this.client.on('message_create', async (message) => {
            try {
                if (message.fromMe) return;
                
                const contactId = message.from;
                const messageBody = message.body;
                
                Logger.message(contactId, messageBody, '←');
                
                // Debug command to check gossip system
                if (messageBody.toLowerCase().includes('debug gossip')) {
                    debugGossipSystem();
                    return; // Don't process this message further
                }
                
                if (messageBody.toLowerCase().includes('test gossip')) {
                    testGossipSystem();
                    return;
                }

                // In the message_create event handler, add this after the debug/test commands:
if (messageBody.toLowerCase().includes('test multi')) {
    // Send a test multi-message response
    await sendMultipleMessages(this.client, contactId, [
        "this is a test",
        "of multiple messages",
        "being sent separately",
        "just to see if it works"
    ], userMemory.contactInfo.name);
    return;
}

if (messageBody.toLowerCase().includes('upload session')) {
    Logger.system('Manual session upload requested');
    
    // Save session to Google Drive
    const success = await sessionManager.saveSessionToDrive();
    
    if (success) {
        await sendMultipleMessages(this.client, contactId, [
            "session uploaded to google drive",
            "you can now restart the bot",
            "and it should authenticate automatically"
        ], userMemory.contactInfo.name);
    } else {
        await sendMultipleMessages(this.client, contactId, [
            "failed to upload session",
            "check the logs for errors"
        ], userMemory.contactInfo.name);
    }
    
    return;
}

if (messageBody.toLowerCase().startsWith('set oauth ')) {
    const code = messageBody.substring('set oauth '.length).trim();
    Logger.system(`Setting OAuth2 token with code: ${code}`);
    
    const success = await sessionManager.setOAuth2Token(code);
    
    if (success) {
        await sendMultipleMessages(this.client, contactId, [
            "oauth2 token set successfully",
            "you can now upload the session to google drive"
        ], userMemory.contactInfo.name);
    } else {
        await sendMultipleMessages(this.client, contactId, [
            "failed to set oauth2 token",
            "please check the code and try again"
        ], userMemory.contactInfo.name);
    }
    
    return;
}

if (messageBody.toLowerCase().includes('clear session')) {
    Logger.system('Manual session clear requested');
    
    // Clear local session
    sessionManager.clearLocalSession();
    
    await sendMultipleMessages(this.client, contactId, [
        "local session cleared",
        "restart the bot to re-authenticate"
    ], userMemory.contactInfo.name);
    
    return;
}
                
                // Get contact and initialize memory
                const contact = await this.client.getContactById(contactId);
                initializeUserMemory(contactId, contact);
                const userMemory = memoryData.contactMemory[contactId];
                
                // Make assumptions if needed
                if (!userMemory.assumptions || userMemory.assumptions.length === 0) {
                    await makeAssumptionsAboutContact(contactId, this.client);
                }
                
                // Handle prayer time
                if (memoryData.isPraying) {
                    if (!userMemory.missedDuringPrayer) userMemory.missedDuringPrayer = [];
                    userMemory.missedDuringPrayer.push(messageBody);
                    saveMemory();
                    Logger.debug(`Message stored during prayer time: ${messageBody}`);
                    return;
                }
                
                // Handle reply tracking
                if (userMemory.isAwaitingReply) {
                    userMemory.isAwaitingReply = false;
                    userMemory.hasFollowedUpOnGhosting = false;
                }
                
                // Get quoted message context
                const quotedMessage = message.hasQuotedMsg ? await message.getQuotedMessage() : null;
                const quotedMessageText = quotedMessage ? quotedMessage.body : null;
                
                // Get AI response
                const aiResponse = await getAiResponse(contactId, messageBody, memoryData, quotedMessageText);
                
                // Send response
                if (aiResponse) {
                    await sendHannahsMessage(this.client, contactId, aiResponse, userMemory.contactInfo.name);
                    updateConversationHistory(contactId, messageBody, aiResponse);
                    extractAndStoreMemories(contactId, messageBody, aiResponse);
                    
                    // Update friendship score
                    const currentTier = getFriendshipTier(contactId);
                    let scoreIncrease = 1;
                    if (currentTier === 'stranger') scoreIncrease = 2;
                    else if (messageBody.length > 50) scoreIncrease = 2;
                    updateFriendshipScore(contactId, scoreIncrease, 'Positive interaction');
                }
            } catch (error) {
                Logger.error('Error in message event handler', error.message);
            }
        });
        
        // Error handling
        this.client.on('auth_failure', () => { 
            Logger.system('Authentication failed. Please scan QR code again.'); 
        });
    }

    startPeriodicUpdates() {
        setInterval(async () => {
            try {
                // Add null checks before calling functions
                if (typeof updateBoredomLevels === 'function') {
                    updateBoredomLevels(memoryData);
                } else {
                    Logger.error('updateBoredomLevels is not available');
                }
                
                if (typeof updateGlobalMood === 'function') {
                    const moodChanged = updateGlobalMood(memoryData);
                    if (moodChanged) saveMemory();
                } else {
                    Logger.error('updateGlobalMood is not available');
                }
                
                if (typeof checkPrayerTimes === 'function') {
                    checkPrayerTimes(this.client);
                } else {
                    Logger.error('checkPrayerTimes is not available');
                }
                
                if (typeof processProactiveTasks === 'function') {
                    await processProactiveTasks(this.client);
                } else {
                    Logger.error('processProactiveTasks is not available');
                }
            } catch (error) {
                Logger.error('Error in periodic updates', error.message);
            }
        }, 5 * 60 * 1000); // Run every 5 minutes
    }

    async initialize() {
    Logger.system('=== SESSION RESTORATION PROCESS ===');
    
    // Authenticate with Google
    Logger.system('Authenticating with Google...');
    const googleAuth = await sessionManager.authenticate();
    
    // Step 1: Try to load session from Google Drive first
    if (googleAuth) {
        Logger.system('Step 1: Attempting to restore session from Google Drive...');
        const driveSessionRestored = await sessionManager.loadSessionFromDrive();
        
        if (driveSessionRestored) {
            Logger.system('✓ Session restored successfully from Google Drive');
        } else {
            Logger.system('✗ Session not found in Google Drive');
        }
    } else {
        Logger.system('Skipping Google Drive - not authenticated with Google');
    }
    
    // Step 2: Try to load session from local file
    Logger.system('Step 2: Attempting to restore session from local file...');
    const localSessionRestored = await sessionManager.loadSessionFromLocal();
    
    if (localSessionRestored) {
        Logger.system('✓ Session restored successfully from local file');
    } else {
        Logger.system('✗ No local session found');
        Logger.system('QR code will be required for authentication');
    }
    
    Logger.system('=== END SESSION RESTORATION PROCESS ===');
    
    // Initialize the client
    await this.client.initialize();
}

    start() {
        Logger.system('Starting Hannah Bot...');
        this.initialize().catch(error => {
            Logger.error('Failed to initialize bot', error);
        });
    }
}

// Modify the bot initialization
const hannah = new HannahBot();
hannah.start();

// Graceful shutdown
process.on('SIGINT', async () => {
    Logger.system('\nShutting down Hannah gracefully...');
    try {
        if (memoryData && memoryData.contactMemory) {
            await saveMemory();
        }
    } catch (error) {
        Logger.error('Error saving memory during shutdown', error.message);
    }
    
    try {
        Logger.system('Saving session to Google Drive...');
        await sessionManager.saveSessionToDrive();
    } catch (error) {
        Logger.error('Error saving session during shutdown', error.message);
    }
    
    try {
        await hannah.client.destroy();
    } catch (error) {
        Logger.error('Error destroying client during shutdown', error.message);
    }
    
    process.exit(0);
});

process.on('exit', async () => {
    try {
        if (memoryData && memoryData.contactMemory) {
            await saveMemory();
        }
    } catch (error) {
        // Can't use Logger here since we're exiting
        console.error('Error saving memory during exit:', error.message);
    }
    
    try {
        // Can't use Logger here since we're exiting
        console.log('Saving session to Google Drive...');
        await sessionManager.saveSessionToDrive();
    } catch (error) {
        // Can't use Logger here since we're exiting
        console.error('Error saving session during exit:', error.message);
    }
});