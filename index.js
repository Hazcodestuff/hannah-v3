// index.js (Refactored)
require('dotenv').config();
require('./debug-render.js');

const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  Browsers,
  fetchLatestBaileysVersion,
} = require('@whiskeysockets/baileys');
const pino = require('pino');
const Logger = require('./logger.js');
const SessionManager = require('./sessionManager');
const { startServer } = require('./server.js');
const {
  hannahProfile,
  getAiResponse,
  sendHannahsMessage,
  initializeUserMemory,
  updateFriendshipScore,
  updateConversationHistory
} = require('./hannah.js');
const { memoryData, loadMemory, saveMemory } = require('./memory.js');
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

const sessionManager = new SessionManager();

// Start the HTTP server
const server = startServer();

class HannahBot {
  constructor() {
    this.client = null;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
  }

  async start() {
    try {
      Logger.system('--- HANNAH BOT STARTING (Baileys) ---');

      const { version, isLatest } = await fetchLatestBaileysVersion();
      console.log(`using WA v${version.join('.')}, isLatest: ${isLatest}`);

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
        browser: Browsers.ubuntu('Chrome'),
        auth: state,
        version: version,
        getMessage: async (key) => ({ conversation: "retry" }),
        markOnlineOnConnect: false,
        syncFullHistory: false,
        connectTimeoutMs: 60000,
        keepAliveIntervalMs: 30000,
        qrTimeout: 40000,
        defaultQueryTimeoutMs: 20000,
      });

      this.client.ev.on('creds.update', saveCreds);
      this.setupEventListeners();
      await loadMemory();
      this.startPeriodicUpdates();

      Logger.success('✅ Bot started successfully!');
    } catch (error) {
      Logger.error('Error starting bot:', error.stack);
      process.exit(1);
    }
  }

  setupEventListeners() {
    this.client.ev.on('connection.update', (update) => this.handleConnectionUpdate(update));
    this.client.ev.on('messages.upsert', (m) => this.handleMessageUpsert(m));
  }

  handleConnectionUpdate(update) {
    const { connection, lastDisconnect } = update;
    if (connection === 'open') {
      Logger.success(`Hannah is ready! Connected via Baileys. 🌟`);
      this.reconnectAttempts = 0;
    } else if (connection === 'close') {
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

      Logger.error(`Connection closed. Reason: ${lastDisconnect?.error?.message || 'Unknown'}. Status code: ${statusCode}. Reconnecting: ${shouldReconnect}`);

      if (shouldReconnect && this.reconnectAttempts < this.maxReconnectAttempts) {
        this.reconnectAttempts++;
        const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
        Logger.system(`Reconnecting in ${delay / 1000} seconds... Attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts}`);
        setTimeout(() => this.start(), delay);
      } else if (!shouldReconnect) {
        Logger.error('Logged out. Please generate a new session.');
        process.exit(1);
      } else {
        Logger.error('Max reconnect attempts reached. Exiting.');
        process.exit(1);
      }
    }
  }

  async handleMessageUpsert(m) {
    try {
      const msg = m.messages[0];
      if (!msg.message || msg.key.fromMe) return;

      const contactId = msg.key.remoteJid;
      const messageBody = msg.message.conversation || msg.message.extendedTextMessage?.text || '';
      if (!messageBody) return;

      const isGroup = contactId.endsWith('@g.us');
      const botNumber = this.client.user?.id.split(':')[0];
      const wasMentioned = botNumber && (messageBody.includes(`@${botNumber}`) || messageBody.toLowerCase().includes('hannah'));

      if (isGroup && !wasMentioned) {
           const interestsRegex = /\b(music|art|biology|band|song|artist)\b/i;
           if (!interestsRegex.test(messageBody) || Math.random() > 0.20) {
               Logger.debug(`Ignoring group message because Hannah was not mentioned.`);
               return;
           }
           Logger.action("Hannah is jumping into the group chat due to an interesting topic.");
      }


      Logger.message(msg.pushName || contactId, messageBody, '←');
      if (!memoryData.contactMemory[contactId]) {
        initializeUserMemory(contactId, { pushname: msg.pushName || "Unknown" });
      }

      const userMemory = memoryData.contactMemory[contactId];
      const quotedMessageText = msg.message.extendedTextMessage?.contextInfo?.quotedMessage?.conversation || null;

      const aiResponse = await getAiResponse(contactId, messageBody, memoryData, quotedMessageText);

      if (!aiResponse || aiResponse.includes('[IGNORE]')) {
        Logger.action(`Hannah decided to ignore the message from ${userMemory.contactInfo.name}.`);
        userMemory.lastMessageTimestamp = Date.now();
        await saveMemory();
        return;
      }

      const searchQuery = await sendHannahsMessage(this.client, contactId, aiResponse, userMemory.contactInfo.name, memoryData);

      updateConversationHistory(contactId, messageBody, aiResponse);
      this.extractAndStoreMemories(contactId, msg, aiResponse);
      updateFriendshipScore(contactId, 1, 'Positive interaction');

      if (searchQuery) {
          Logger.system("--- TOOL EXECUTION PHASE ---");
          const searchToolOutput = `[SEARCH RESULT FOR "${searchQuery}"] 1. The 1975 - Girls (Official Video): https://www.youtube.com/watch?v=QlsXIqg_i4E`;
          Logger.system(`Tool output received: ${searchToolOutput}`);

          Logger.system("--- FINAL RESPONSE PHASE ---");
          const finalAiResponse = await getAiResponse(contactId, searchToolOutput, memoryData, null);

          if (finalAiResponse && !finalAiResponse.includes('[IGNORE]')) {
               await sendHannahsMessage(this.client, contactId, finalAiResponse, userMemory.contactInfo.name, memoryData);
               updateConversationHistory(contactId, searchToolOutput, finalAiResponse);
          }
      }
    } catch (error) {
      Logger.error(`Error in message handler: ${error.stack}`);
      if (error.message.includes('decrypt') || error.message.includes('Bad MAC')) {
        this.handleDecryptionError();
      }
      // Add a fallback message to the user
      try {
        await this.client.sendMessage(m.messages[0].key.remoteJid, { text: "ugh, my brain literally just melted. ask me again in a bit." });
      } catch (e) {
        Logger.error(`Failed to send fallback message: ${e.stack}`);
      }
    }
  }

  extractAndStoreMemories(contactId, msg, response) {
    const userMemory = memoryData.contactMemory[contactId];
    if (!userMemory) return;

    const messageBody = msg.message.conversation || msg.message.extendedTextMessage?.text || '';

    if (messageBody.includes('?')) {
        userMemory.isAwaitingReply = true;
        userMemory.lastQuestionTimestamp = Date.now();
        userMemory.hasFollowedUpOnGhosting = false;
    }

    const weirdKeywords = [
        'cute', 'beautiful', 'pretty', 'gorgeous', 'hot', 'sexy', 'angel', 'love', 'like you',
        'have a crush', 'date me', 'be my girlfriend', 'be my boyfriend', 'creepy', 'weird',
        'stop it', 'dont', 'ridiculous', 'compliments', 'flirting', 'hitting on', 'hitting on me',
        'watching you', 'thinking about you', 'dream about you'
    ];
    const messageLower = messageBody.toLowerCase();
    
    const weirdKeywordRegex = new RegExp(`\\b(${weirdKeywords.join('|')})\\b`, 'i');
    const match = messageLower.match(weirdKeywordRegex);

    if (match && !messageLower.includes('?')) {
        const weirdInteraction = {
            message: msg, 
            keyword: match[1],
            timestamp: Date.now(),
            sharedWith: []
        };
        
        if (!userMemory.weirdInteractions) userMemory.weirdInteractions = [];
        userMemory.weirdInteractions.push(weirdInteraction);
        
        Logger.action(`Stored weird interaction object from ${userMemory.contactInfo.name}: "${messageBody.substring(0, 50)}"`);
        this.triggerGossipAboutContact(contactId, weirdInteraction);
    }
    
    const topics = ['music', 'art', 'biology', 'school', 'friends', 'family', 'relationship', 'food'];
    for (const topic of topics) {
        if (messageLower.includes(topic) && !userMemory.conversationTopics.includes(topic)) {
            userMemory.conversationTopics.push(topic);
        }
    }
    
    saveMemory();
  }

  triggerGossipAboutContact(contactId, weirdInteraction) {
    const contactMemory = memoryData.contactMemory[contactId];
    if (!contactMemory) return;
    
    const contactName = contactMemory.contactInfo.name;
    
    Logger.action(`Triggering gossip about ${contactName}: "${weirdInteraction.message}"`);
    
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
            
            if (!friendMemory.gossipShared) friendMemory.gossipShared = [];
            
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

  handleDecryptionError() {
    const now = Date.now();
    this.decyptionErrorCount++;
    this.lastDecryptionError = now;
    
    Logger.error(`Decryption error detected. Count: ${this.decyptionErrorCount}`);
    
    if (this.decyptionErrorCount > 5 && (now - this.lastDecryptionError) < 60000) {
      Logger.error('Too many decryption errors detected. Restarting connection...');

      if (this.client) {
        this.client.ws.close();
      }

      setTimeout(() => {
        this.start();
      }, 5000);
    }
  }

  startPeriodicUpdates() {
    Logger.system('Starting periodic tasks (every 5 minutes)...');
    setInterval(() => {
      try {
        updateBoredomLevels(memoryData);
        updateGlobalMood(memoryData);
        this.checkPrayerTimes();
        this.processProactiveTasks();
      } catch (error) {
        Logger.error('Error in periodic tasks:', error.stack);
      }
    }, 5 * 60 * 1000);
  }

  checkPrayerTimes() {
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

    for (const [prayerName, time] of Object.entries(prayerTimes)) {
      if (currentHour === time.hour && currentMinute === time.minute && !memoryData.isPraying) {
        Logger.system(`Starting prayer time for ${prayerName}`);
        if (typeof setPrayerState === 'function') {
          setPrayerState(this.client, memoryData, prayerName, time.duration);
        }
      }
    }
  }

  async processProactiveTasks() {
    try {
      let allJobs = [
        ...await checkGhosting(this.client, memoryData),
        ...await handleLongTermGhosting(this.client, memoryData),
        ...await startProactiveConversation(this.client, memoryData),
        ...await checkInWithFriends(this.client, memoryData),
        ...await sendGoodMorningMessages(this.client, memoryData),
        ...await shareDailyThought(this.client, memoryData),
        ...await shareGossip(this.client, memoryData)
      ];

      for (const job of allJobs) {
        if (job.decision) {
          await sendHannahsMessage(this.client, job.userData.chatId, job.decision, job.userName, memoryData);
          job.userData.lastMessageTimestamp = Date.now();
          job.userData.boredomLevel = 0;
        }
      }

      if (allJobs.length > 0) saveMemory();
    } catch (error) {
      Logger.error('Error processing proactive tasks:', error.message);
    }
  }
}

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error.message);
});

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

const hannah = new HannahBot();
hannah.start().catch(error => {
  console.error('Failed to start bot:', error.message);
  process.exit(1);
});
