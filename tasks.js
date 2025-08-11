const Groq = require("groq-sdk");
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const { rateLimit } = require('./utils.js');
const axios = require('axios');
const Logger = require('./logger.js'); // Add this line

async function generateProactiveJob(situation, targetName, targetData) {
    Logger.action(`Proactive Task Triggered for ${targetName}: ${situation.split('.')[0]}`);
    if (targetData) targetData.boredomLevel = 0;
    const strictPrompt = `
        You are Hannah, a sarcastic 17-year-old girl.
        Your current situation is: ${situation}
        You MUST format your entire response as a single, valid [ACTION_BLOCK].
        
        This is an example of a perfect response:
        '[ACTION_BLOCK][TEXT]hey, u there?[/ACTION_BLOCK]'
        Now, generate your response based on your situation. Do not output anything other than the [ACTION_BLOCK].
    `;
    try {
        // Function to make the API call with retries
        const response = await groq.chat.completions.create({
            messages: [{ role: 'system', content: strictPrompt }],
            model: "llama3-70b-8192",
            temperature: 0.9,
            max_tokens: 200,
        });
        
        const decision = response.choices[0].message.content;
        if (!decision.includes('[ACTION_BLOCK]')) {
            Logger.error(`AI failed to generate ACTION_BLOCK despite strict prompt. Output: ${decision}`);
            return [];
        }
        return [{ userName: targetName, userData: targetData, decision: decision }];
    } catch (e) {
        Logger.error("Error generating proactive job from Groq:", e.message);
        return [];
    }
}

function updateBoredomLevels(memoryData) {
    const twoHours = 2 * 60 * 60 * 1000;
    for (const [userName, userData] of Object.entries(memoryData.contactMemory)) {
        if (Date.now() - (userData.lastMessageTimestamp || 0) > twoHours) {
            if (!userData.boredomLevel) userData.boredomLevel = 0;
            if (userData.boredomLevel < 10) userData.boredomLevel++;
        }
    }
}

function canBeProactive(memoryData) {
    const now = new Date();
    const currentHour = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Kuala_Lumpur" })).getHours();
    if (currentHour < 8 || currentHour >= 23) return false;
    const oneHour = 60 * 60 * 1000;
    for (const [userName, userData] of Object.entries(memoryData.contactMemory)) {
        if (now.getTime() - (userData.lastMessageTimestamp || 0) < oneHour) return false;
    }
    return true;
}

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

async function checkGhosting(client, memoryData) {
    if (!canBeProactive(memoryData)) return [];
    let jobs = [];
    for (const [userName, userData] of Object.entries(memoryData.contactMemory)) {
        if (userData.isAwaitingReply && !userData.hasFollowedUpOnGhosting && Date.now() - (userData.lastQuestionTimestamp || 0) > 600000) {
            userData.hasFollowedUpOnGhosting = true;
            const situation = `A person you asked a question to has ignored you for 10 minutes. You are impatient. Generate a short follow-up message like 'u there?' or 'helloooo??'.`;
            jobs = jobs.concat(await generateProactiveJob(situation, userName, userData));
        }
    }
    return jobs;
}

async function handleLongTermGhosting(client, memoryData) {
    if (!canBeProactive(memoryData) || memoryData.isPraying) return [];
    let jobs = [];
    for (const [userName, userData] of Object.entries(memoryData.contactMemory)) {
        if (userData.isAwaitingReply && Date.now() - (userData.lastQuestionTimestamp || 0) > 2 * 60 * 60 * 1000) {
            userData.isAwaitingReply = false;
            if (userData.interactionScore >= 50) {
                const situation = `You're worried because your best friend, ${userName}, hasn't replied in over two hours. Generate a message that's a mix of concern and playful annoyance.`;
                jobs = jobs.concat(await generateProactiveJob(situation, userName, userData));
            } else if (userData.interactionScore >= 20) {
                userData.isSulking = true;
                userData.shortTermEmotion = `feeling ignored by ${userName}`;
            }
        }
    }
    return jobs;
}

async function setPrayerState(client, memoryData, prayerName, durationMinutes) {
    if (memoryData.isPraying) return;
    Logger.system(`--- It's time for ${prayerName}. Hannah is now praying. ---`);
    memoryData.isPraying = true;
    
    // Track prayer start time for safety check
    for (const [userName, userData] of Object.entries(memoryData.contactMemory)) {
        userData.prayerStartedAt = Date.now();
    }
    
    // Notify recent contacts
    for (const [userName, userData] of Object.entries(memoryData.contactMemory)) {
        if (Date.now() - (userData.lastMessageTimestamp || 0) < 5 * 60 * 1000) {
            try {
                await client.sendMessage(userData.chatId, `brb, time for ${prayerName}.`);
            } catch (error) {
                Logger.error('Error sending prayer notification:', error.message);
            }
        }
    }
    
    // Set timeout to end prayer state
    setTimeout(async () => {
        Logger.system(`--- Hannah has finished praying. ---`);
        memoryData.isPraying = false;
        
        // Clear prayer start time
        for (const [userName, userData] of Object.entries(memoryData.contactMemory)) {
            userData.prayerStartedAt = null;
        }
        
        let jobs = [];
        for (const [userName, userData] of Object.entries(memoryData.contactMemory)) {
            if (userData.missedDuringPrayer && userData.missedDuringPrayer.length > 0) {
                const missedMessages = userData.missedDuringPrayer.join('\n');
                const situation = `You just finished praying. You missed these messages from ${userName}: "${missedMessages}". Formulate a natural reply.`;
                jobs = jobs.concat(await generateProactiveJob(situation, userName, userData));
                userData.missedDuringPrayer = [];
            }
        }
        
        // Execute the jobs
        if (jobs.length > 0) {
            const { sendHannahsMessage } = require('./hannah.js');
            for (const job of jobs) {
                try {
                    // Inside the setTimeout in setPrayerState in tasks.js
await sendHannahsMessage(client, job.userData.chatId, job.decision, job.userName, memoryData);
                    job.userData.lastMessageTimestamp = Date.now();
                    job.userData.boredomLevel = 0;
                } catch (error) {
                    Logger.error('Error sending proactive message:', error.message);
                }
            }
        }
        
        // Save memory
        const { saveMemoryToDrive } = require('./drive.js');
        await saveMemoryToDrive(memoryData);
    }, durationMinutes * 60 * 1000);
}

async function startProactiveConversation(client, memoryData) {
    if (!canBeProactive(memoryData) || memoryData.isPraying || !memoryData.hannahsCrush) return [];
    const crushData = memoryData.contactMemory[memoryData.hannahsCrush];
    if (!crushData || (crushData.boredomLevel || 0) < 7) return [];
    const situation = `You are extremely bored. Message your secret crush, ${memoryData.hannahsCrush}.`;
    return generateProactiveJob(situation, memoryData.hannahsCrush, crushData);
}

async function checkInWithFriends(client, memoryData) {
    if (!canBeProactive(memoryData) || memoryData.isPraying) return [];
    const friendToMessage = Object.entries(memoryData.contactMemory).find(([name, data]) => 
        data.interactionScore >= 50 && name !== memoryData.hannahsCrush && (data.boredomLevel || 0) >= 5
    );
    if (!friendToMessage) return [];
    const [friendName, friendData] = friendToMessage;
    const situation = `You are pretty bored. Check in with your close friend, ${friendName}.`;
    return generateProactiveJob(situation, friendName, friendData);
}

async function sendGoodMorningMessages(client, memoryData) {
    if (memoryData.isPraying) return [];
    const currentHour = new Date(new Date().toLocaleString("en-US", {timeZone: "Asia/Kuala_Lumpur"})).getHours();
    if (currentHour < 8 || currentHour > 10) return [];
    const friendToGreet = Object.entries(memoryData.contactMemory).find(([name, data]) => 
        data.interactionScore >= 30 && (Date.now() - (data.lastMessageTimestamp || 0) > 8 * 60 * 60 * 1000)
    );
    if (!friendToGreet) return [];
    const [friendName, friendData] = friendToGreet;
    const situation = `It's morning. Send a short, low-effort 'good morning' message to your friend, ${friendName}.`;
    return generateProactiveJob(situation, friendName, friendData);
}

async function shareDailyThought(client, memoryData) {
    if (!canBeProactive(memoryData) || memoryData.isPraying) return [];
    const friendToConfide = Object.entries(memoryData.contactMemory).find(([name, data]) => 
        data.interactionScore >= 50 && (data.boredomLevel || 0) >= 6
    );
    if (!friendToConfide) return [];
    const [friendName, friendData] = friendToConfide;
    const situation = `You're having a random, moody thought about your day. Share it with your best friend, ${friendName}.`;
    return generateProactiveJob(situation, friendName, friendData);
}

// NEW: Share gossip with close friends
// Replace the shareGossip function with this improved version:
async function shareGossip(client, memoryData) {
    if (!canBeProactive(memoryData) || memoryData.isPraying) return [];
    let jobs = [];
    
    // Find friends who have gossip to share
    for (const [friendId, friendMemory] of Object.entries(memoryData.contactMemory)) {
        if (friendMemory.interactionScore >= 20 && friendMemory.gossipShared && friendMemory.gossipShared.length > 0) {
            // Find recent unshared gossip
            const unsharedGossip = friendMemory.gossipShared.filter(gossip => 
                !gossip.hasBeenShared && Date.now() - gossip.timestamp < 24 * 60 * 60 * 1000 // Last 24 hours
            );
            
            if (unsharedGossip.length > 0 && Math.random() > 0.5) { // 50% chance to share (increased from 30%)
                const gossip = unsharedGossip[0];
                const situation = `You need to vent to your friend ${friendMemory.contactInfo.name} about something weird that happened. Someone named "${gossip.aboutName}" just messaged you saying: "${gossip.interaction.message}". Tell your friend how weird or creepy that was.`;
                
                Logger.action(`Sharing gossip about ${gossip.aboutName} with ${friendMemory.contactInfo.name}`);
                
                const job = await generateProactiveJob(situation, friendId, friendMemory);
                jobs = jobs.concat(job);
                
                // Mark gossip as shared
                gossip.hasBeenShared = true;
            }
        }
    }

    async function shareGossip(client, memoryData) {
    if (!canBeProactive(memoryData) || memoryData.isPraying) return [];
    
    const jobs = [];

    // Find a friend who is eligible to RECEIVE gossip
    for (const [friendId, friendMemory] of Object.entries(memoryData.contactMemory)) {
        // Must be a friend (score >= 20) and not currently busy
        if (friendMemory.interactionScore >= 20 && (Date.now() - (friendMemory.lastMessageTimestamp || 0) > 30 * 60 * 1000)) {
            
            // Now, find a piece of unshared gossip to tell them about
            for (const [gossipSourceId, gossipSourceContact] of Object.entries(memoryData.contactMemory)) {
                // Can't gossip about the friend to themselves
                if (friendId === gossipSourceId) continue;

                if (gossipSourceContact.weirdInteractions && gossipSourceContact.weirdInteractions.length > 0) {
                    const unsharedGossip = gossipSourceContact.weirdInteractions.find(g => !g.sharedWith.includes(friendId));

                    // If we found a piece of gossip and feel like sharing (30% chance)
                    if (unsharedGossip && Math.random() < 0.3) {
                        const gossipText = unsharedGossip.message.message.conversation || unsharedGossip.message.message.extendedTextMessage?.text || '';
                        
                        // This prompt tells Hannah to INITIATE the conversation
                        const situation = `You have some juicy gossip about someone named '${gossipSourceContact.contactInfo.name}' who sent you a weird message: "${gossipText}". You've decided to start a conversation with your friend '${friendMemory.contactInfo.name}' to tell them about it.`;
                        
                        Logger.action(`PROACTIVE GOSSIP: Decided to tell ${friendMemory.contactInfo.name} about ${gossipSourceContact.contactInfo.name}.`);
                        
                        // Generate the opening messages for the AI
                        jobs.push(...await generateProactiveJob(situation, friendId, friendMemory));
                        
                        // We only start one proactive chat per cycle to avoid spamming
                        return jobs; 
                    }
                }
            }
        }
    }
    return jobs;
}
    
    if (jobs.length > 0) {
        Logger.system(`Generated ${jobs.length} gossip sharing jobs`);
    }
    
    return jobs;
}

module.exports = { 
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
};