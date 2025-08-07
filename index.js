// index.js (Baileys Version - Fixed)
require('dotenv').config();
const http = require('http'); // Add this import
const { 
    default: makeWASocket, 
    useMultiFileAuthState, 
    DisconnectReason,
    Browsers, // Added missing import
    fetchLatestBaileysVersion // Recommended for version management
} = require('@whiskeysockets/baileys');
const pino = require('pino');
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

// Create HTTP server for Render health checks
const server = http.createServer((req, res) => {
    // Simple health check endpoint
    if (req.url === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ 
            status: 'ok', 
            message: 'WhatsApp bot is running',
            timestamp: new Date().toISOString()
        }));
    } else {
        // For all other routes, return a simple message
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end('WhatsApp bot is running. Health check: /health');
    }
});

// Get port from environment or default to 10000
const PORT = process.env.PORT || 10000;

// Start the server
server.listen(PORT, () => {
    Logger.system(`HTTP server listening on port ${PORT} for health checks`);
});


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

// Test gossip system
function testGossipSystem() {
    Logger.system('=== TESTING GOSSIP SYSTEM ===');
    
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

// Trigger gossip with close friends (fixed duplicate)
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

// Debug gossip system (fixed duplicate)
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

// Fallback functions (removed duplicates)
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

// Add this function before the HannahBot class
async function shouldShowQRCode() {
    Logger.system('=== CHECKING IF QR CODE IS NEEDED ===');
    
    // Step 1: Try to load session from Google Drive
    Logger.system('Step 1: Checking Google Drive for session...');
    const driveSessionRestored = await sessionManager.loadSessionFromDrive();
    
    if (driveSessionRestored && sessionManager.isSessionLoaded()) {
        Logger.system('✓ Session found and loaded from Google Drive');
        Logger.system('✓ QR code NOT needed');
        Logger.system('=== QR CODE CHECK COMPLETE ===');
        return false;
    }
    
    Logger.system('✗ Session not found in Google Drive or failed to load');
    
    // Step 2: Check if local session exists
    Logger.system('Step 2: Checking for local session...');
    if (sessionManager.hasLocalSession()) {
        Logger.system('✓ Local session found');
        Logger.system('✓ QR code NOT needed');
        Logger.system('=== QR CODE CHECK COMPLETE ===');
        return false;
    }
    
    Logger.system('✗ No local session found');
    Logger.system('✓ QR code IS needed');
    Logger.system('=== QR CODE CHECK COMPLETE ===');
    return true;
}

class HannahBot {
    constructor() {
        this.client = null;
    }

    async start() {
        Logger.system('--- HANNAH BOT STARTING (Baileys) ---');
        
        // Fetch latest WhatsApp Web version
        const { version, isLatest } = await fetchLatestBaileysVersion();
        console.log(`using WA v${version.join('.')}, isLatest: ${isLatest}`);
        
        // Load session from environment variable or local file
        const sessionLoaded = await sessionManager.loadSession();
        if (!sessionLoaded) {
            Logger.error('❌ CRITICAL: Could not load session.');
            Logger.error('Please set SESSION_CREDS_BASE64 environment variable with your session data.');
            process.exit(1);
        }
        
        const { state, saveCreds } = await useMultiFileAuthState('sessions');
        
        this.client = makeWASocket({
            logger: pino({ level: 'silent' }),
            printQRInTerminal: false,
            browser: Browsers.windows('Firefox'),
            auth: state,
            version: version,
        });
        
        this.client.ev.on('creds.update', saveCreds);
        this.setupEventListeners();
        await loadMemory();
        this.startPeriodicUpdates();
    }

    setupEventListeners() {
        // Handle connection status
        this.client.ev.on('connection.update', (update) => {
            const { connection, lastDisconnect } = update;
            if (connection === 'open') {
                Logger.success(`Hannah is ready! Connected via Baileys. 🌟`);
            } else if (connection === 'close') {
                const shouldReconnect = (lastDisconnect.error)?.output?.statusCode !== DisconnectReason.loggedOut;
                Logger.error(`Connection closed. Reason: ${lastDisconnect.error}. Reconnecting: ${shouldReconnect}`);
                // The library handles reconnection automatically. We just log it.
            }
        });

        // Handle incoming messages
        this.client.ev.on('messages.upsert', async (m) => {
            const msg = m.messages[0];
            if (!msg.message || msg.key.fromMe) return;
            
            try {
                const contactId = msg.key.remoteJid;
                
                // Baileys provides different message object structures. This handles most text messages.
                const messageBody = msg.message.conversation || msg.message.extendedTextMessage?.text || '';
                
                // Ignore empty messages
                if (!messageBody) return;
                
                Logger.message(msg.pushName || contactId, messageBody, '←');
                
                // Initialize memory for new contacts. Baileys gives us `pushName`.
                if (!memoryData.contactMemory[contactId]) {
                    initializeUserMemory(contactId, { pushname: msg.pushName || "Unknown" });
                }
                
                const userMemory = memoryData.contactMemory[contactId];
                
                // Get quoted message context
                const quotedMessageText = msg.message.extendedTextMessage?.contextInfo?.quotedMessage?.conversation || null;
                
                const aiResponse = await getAiResponse(contactId, messageBody, memoryData, quotedMessageText);
                
                if (aiResponse) {
                    await sendHannahsMessage(this.client, contactId, aiResponse, userMemory.contactInfo.name);
                    updateConversationHistory(contactId, messageBody, aiResponse);
                    extractAndStoreMemories(contactId, messageBody, aiResponse);
                    updateFriendshipScore(contactId, 1, 'Positive interaction');
                }
            } catch (error) {
                Logger.error(`Error in message handler: ${error.message}`, error.stack);
            }
        });
    }

    startPeriodicUpdates() {
        Logger.system('Starting periodic tasks (every 5 minutes)...');
        setInterval(() => {
            updateBoredomLevels(memoryData);
            updateGlobalMood(memoryData);
            checkPrayerTimes(this.client);
            processProactiveTasks(this.client);
        }, 5 * 60 * 1000);
    }
}

const hannah = new HannahBot();
hannah.start();

// Graceful shutdown
process.on('SIGINT', async () => {
    Logger.system('\nShutting down gracefully...');
    await saveMemory(); // Just save the memory state
    process.exit(0);
});

process.on('uncaughtException', (err) => {
    Logger.error('Uncaught Exception:', err.message);
    // Depending on the error, you might want to restart or just log
});

// Add this to the end of your index.js
process.on('unhandledRejection', (reason, promise) => {
    Logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
    // Don't exit the process, just log the error
});

process.on('uncaughtException', (error) => {
    Logger.error('Uncaught Exception:', error);
    // Don't exit the process, just log the error
});