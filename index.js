// index.js (Fixed for Render)
require('dotenv').config();
const http = require('http');
const { 
    default: makeWASocket, 
    useMultiFileAuthState, 
    DisconnectReason,
    Browsers,
    fetchLatestBaileysVersion, // Added this import
    makeCacheableSignalKeyStore
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
    if (req.url === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ 
            status: 'ok', 
            message: 'WhatsApp bot is running',
            timestamp: new Date().toISOString()
        }));
    } else {
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end('WhatsApp bot is running. Health check: /health');
    }
});

const PORT = process.env.PORT || 10000;
server.listen(PORT, () => {
    console.log(`HTTP server listening on port ${PORT} for health checks`);
});

// Load memory from Google Drive
async function loadMemory() {
    try {
        const loadedData = await loadMemoryFromDrive();
        if (loadedData) {
            memoryData = loadedData;
            Logger.system('Memory loaded successfully from Google Drive');
            
            // Reset prayer state if stuck
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
        Logger.error('Error loading memory:', error.message);
    }
}

// Save memory to Google Drive
async function saveMemory() {
    try {
        await saveMemoryToDrive(memoryData);
    } catch (error) {
        Logger.error('Error saving memory:', error.message);
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

// Trigger gossip with close friends
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
        Logger.error('Error processing proactive tasks:', error.message);
    }
}

// Fallback functions
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

class HannahBot {
    constructor() {
        this.client = null;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
    }

    async start() {
        try {
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
                // Add message retry configuration
                getMessage: async (key) => {
                    return { conversation: "retry" };
                },
            });
            
            this.client.ev.on('creds.update', saveCreds);
            this.setupEventListeners();
            await loadMemory();
            this.startPeriodicUpdates();
            
            Logger.success('✅ Bot started successfully!');
        } catch (error) {
            Logger.error('Error starting bot:', error.message);
            process.exit(1);
        }
    }
    
    setupEventListeners() {
        // Handle connection status
        this.client.ev.on('connection.update', (update) => {
            const { connection, lastDisconnect } = update;
            if (connection === 'open') {
                Logger.success(`Hannah is ready! Connected via Baileys. 🌟`);
                this.reconnectAttempts = 0; // Reset reconnect attempts on successful connection
            } else if (connection === 'close') {
                const shouldReconnect = (lastDisconnect?.error)?.output?.statusCode !== DisconnectReason.loggedOut;
                Logger.error(`Connection closed. Reason: ${lastDisconnect?.error?.message || 'Unknown'}. Reconnecting: ${shouldReconnect}`);
                
                if (shouldReconnect && this.reconnectAttempts < this.maxReconnectAttempts) {
                    this.reconnectAttempts++;
                    Logger.system(`Reconnecting... Attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts}`);
                    setTimeout(() => {
                        this.start();
                    }, 5000 * this.reconnectAttempts); // Exponential backoff
                } else if (!shouldReconnect) {
                    Logger.error('Logged out. Please generate a new session.');
                    process.exit(1);
                } else {
                    Logger.error('Max reconnect attempts reached. Exiting.');
                    process.exit(1);
                }
            }
        });

        // Handle incoming messages
        this.client.ev.on('messages.upsert', async (m) => {
            try {
                const msg = m.messages[0];
                if (!msg.message || msg.key.fromMe) return;
                
                const contactId = msg.key.remoteJid;
                const messageBody = msg.message.conversation || msg.message.extendedTextMessage?.text || '';
                
                if (!messageBody) return;
                
                Logger.message(msg.pushName || contactId, messageBody, '←');
                
                if (!memoryData.contactMemory[contactId]) {
                    initializeUserMemory(contactId, { pushname: msg.pushName || "Unknown" });
                }
                
                const userMemory = memoryData.contactMemory[contactId];
                const quotedMessageText = msg.message.extendedTextMessage?.contextInfo?.quotedMessage?.conversation || null;
                
                const aiResponse = await getAiResponse(contactId, messageBody, memoryData, quotedMessageText);
                
                if (aiResponse) {
                    await sendHannahsMessage(this.client, contactId, aiResponse, userMemory.contactInfo.name);
                    updateConversationHistory(contactId, messageBody, aiResponse);
                    extractAndStoreMemories(contactId, messageBody, aiResponse);
                    updateFriendshipScore(contactId, 1, 'Positive interaction');
                }
            } catch (error) {
                Logger.error(`Error in message handler: ${error.message}`);
            }
        });
    }

    startPeriodicUpdates() {
        Logger.system('Starting periodic tasks (every 5 minutes)...');
        setInterval(() => {
            try {
                updateBoredomLevels(memoryData);
                updateGlobalMood(memoryData);
                checkPrayerTimes(this.client);
                processProactiveTasks(this.client);
            } catch (error) {
                Logger.error('Error in periodic tasks:', error.message);
            }
        }, 5 * 60 * 1000);
    }
}

// Improved error handling for the entire process
process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error.message);
});

// Graceful shutdown
process.on('SIGINT', async () => {
    console.log('\nShutting down gracefully...');
    try {
        await saveMemory();
        server.close(() => {
            console.log('HTTP server closed');
            process.exit(0);
        });
    } catch (error) {
        console.error('Error during shutdown:', error.message);
        process.exit(0);
    }
});

// Start the bot
const hannah = new HannahBot();
hannah.start().catch(error => {
    console.error('Failed to start bot:', error.message);
    process.exit(1);
});