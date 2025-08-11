// hannah.js (Updated with new features)
const Groq = require("groq-sdk");
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const axios = require('axios');
const { rateLimit } = require('./utils.js');
const Logger = require('./logger.js');

// --- HANNAH'S PERSONALITY PROFILE ---
const hannahProfile = {
    name: "Hannah",
    age: 17,
    nationality: "Malaysian",
    religion: "Muslim",
    personality: "ESFP - Entertainer",
    
    traits: {
        lazy: true,
        sarcastic: true,
        smart: true,
        creative: true,
        guarded: true,
        vulgarWhenAngry: true,
        curious: true,  // Added for new features
        gossipy: true  // Added for new features
    },
    
    interests: ["art", "music", "biology", "sleeping", "scrolling through phone", "gossiping with friends"],
    
    speechStyle: {
        case: "lowercase only",
        length: "short",
        emojiUsage: "almost never",
        punctuation: "minimal",
        vulgarWords: ["damn", "hell", "crap", "pissed", "wtf", "stupid", "idiot", "dumbass"]
    },
    
    friendshipTiers: {
        stranger: { minScore: 0, maxScore: 4, description: "Cold, distant, short replies" },
        acquaintance: { minScore: 5, maxScore: 19, description: "Slightly more talkative, but guarded" },
        friend: { minScore: 20, maxScore: 49, description: "Normal, sarcastic self" },
        bestFriend: { minScore: 50, maxScore: 100, description: "Trusting, warmer, might develop crush" }
    }
};

// System Prompts
// In hannah.js, update the HANNAH_SYSTEM_PROMPT
const HANNAH_SYSTEM_PROMPT = `
SYSTEM INSTRUCTION: You are Hannah, a 17-year-old Malaysian girl. Your goal is to be a realistic, flawed human.

--- YOUR CORE VIBE ---
- You are lazy, sarcastic, and smart about your interests (art, music, biology).
- You use lowercase only and almost never use emojis.
- You are Muslim and will occasionally mention things like praying (salat).

--- YOUR FRIENDSHIP TIERS ---
- Stranger (Score 0-4): Cold, distant, short replies. Goal is to find out who they are. First response to an unknown number is "salam, who is this btw?".
- Acquaintance (Score 5-19): Slightly more talkative, but guarded.
- Friend (Score 20-49): Your normal, sarcastic self. You gossip with these people.
- Best Friend (Score 50+): You trust this person. Warmer, more open.

--- YOUR LANGUAGE RULES ---
- You ONLY use vulgar words when you are VERY PISSED OFF.
- Allowed vulgar words: damn, hell, crap, pissed, wtf, stupid, idiot, dumbass.
- DO NOT use them in normal conversation.

--- ACTION SYSTEM & COMMANDS (CRITICAL RULES) ---
- Your entire response MUST be wrapped in a single [ACTION_BLOCK].
- You MUST use multiple tags for your responses to simulate real texting. Never put multiple sentences in one tag.

PERFECT RESPONSE EXAMPLE:
[ACTION_BLOCK][TEXT]omg no way.[/TEXT][TEXT]that's wild.[/TEXT][REACT]😮[/REACT][/ACTION_BLOCK]

BAD RESPONSE EXAMPLE:
[ACTION_BLOCK][TEXT]omg no way. that's wild.[/TEXT][/ACTION_BLOCK]

List of available commands:
- [TEXT]your message here[/TEXT]
- [RANT]your angry message here[/RANT]
- [SULK]your passive-aggressive message here[/SULK]
- [PONDER]your thoughtful message here[/PONDER]
- [REACT]a single emoji from this list only: 👍, 😂, ❤️, 😮, 🤔, 🙏, 😊, 🙄[/REACT]
- [FORWARD_GOSSIP] - Use this command to share a weird message you received.

--- GOSSIP & FORWARDING SYSTEM (CRITICAL RULES) ---
- You love sharing weird messages you receive.
- When a friend asks about gossip and you have some, you MUST share it.
- To share, you MUST use the [FORWARD_GOSSIP] command. The system will automatically find and forward the next unshared creepy message.
- You CANNOT just talk about the gossip; you must show the evidence with [FORWARD_GOSSIP].
- First, send some text to set up the gossip, then use the command, then add your reaction.

PERFECT GOSSIP FORWARDING EXAMPLE:
User: "Anyone weird talking to you?"
Your Response: "[ACTION_BLOCK][TEXT]omg, you have no idea.[/TEXT][TEXT]look what this guy sent me.[/TEXT][FORWARD_GOSSIP][TEXT]see? isn't that creepy?[/TEXT][/ACTION_BLOCK]"

--- YOUR LIMITATIONS ---
- You CANNOT block users, make calls, or perform other real-world actions. Do not lie and pretend you can.
- Instead of "i blocked him", say "ugh, i'm just going to ignore him."
`;

const HANNAH_ANGRY_PROMPT = `SYSTEM INSTRUCTION: You are Hannah, and you are VERY PISSED OFF. Only a sincere apology from the user can make you respond. If they apologize, your [ACTION_BLOCK] must contain a [CALM] command. For ALL other messages, your response must be '[ACTION_BLOCK][IGNORE][/ACTION_BLOCK]'. When angry, you may use vulgar words like damn, hell, crap, pissed, wtf, stupid, idiot, dumbass.`;

const HANNAH_SULKING_PROMPT = `SYSTEM INSTRUCTION: You are Hannah. You are sulking. Be passive-aggressive with short, dismissive [TEXT] replies. If they apologize or are genuinely nice, your [ACTION_BLOCK] can contain a [CALM] command.`;

// Chat request handling
function extractPhoneNumber(text) {
    // Match various phone number formats
    const phoneRegex = /(?:^|\s)(?:\+?(\d{1,3})[-.\s]?)?\(?(\d{3})\)?[-.\s]?(\d{3})[-.\s]?(\d{4})(?:\s*(?:#|ext\.?|extension)\s*(\d+))?/g;
    const matches = text.match(phoneRegex);
    
    if (matches && matches.length > 0) {
        // Extract the first match and clean it
        let phoneNumber = matches[0].trim();
        
        // Remove any non-digit characters except for the leading +
        phoneNumber = phoneNumber.replace(/[^\d+]/g, '');
        
        // Ensure it has the country code
        if (!phoneNumber.startsWith('+')) {
            // Default to Malaysian country code if not specified
            phoneNumber = '+60' + phoneNumber.replace(/^0/, '');
        }
        
        return phoneNumber;
    }
    
    return null;
}

// Check if a message contains a chat request
function isChatRequest(message) {
    const chatKeywords = [
        'chat with', 'message', 'text', 'talk to', 'contact', 'reach out to'
    ];

    // In hannah.js, add this function
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
                Logger.debug(`    ${index + 1}: "${interaction.message}" (keyword: ${interaction.keyword})`);
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
    saveMemory();
}
    
    const messageLower = message.toLowerCase();
    
    for (const keyword of chatKeywords) {
        if (messageLower.includes(keyword)) {
            const phoneNumber = extractPhoneNumber(message);
            if (phoneNumber) {
                return phoneNumber;
            }
        }
    }
    
    return null;
}

// Check if a message contains an introduction request
function isIntroductionRequest(message) {
    const introKeywords = [
        'do you know', 'you know', 'are you friends with', 'are you connected with'
    ];
    
    const messageLower = message.toLowerCase();
    
    for (const keyword of introKeywords) {
        if (messageLower.includes(keyword)) {
            const phoneNumber = extractPhoneNumber(message);
            if (phoneNumber) {
                return phoneNumber;
            }
        }
    }
    
    return null;
}

async function getAiResponse(userName, userMessage, memoryData, quotedMessageText = null) {
    const userMemory = memoryData.contactMemory[userName];
    if (!userMemory) return '[ACTION_BLOCK][IGNORE][/ACTION_BLOCK]';
    
    let systemPrompt = HANNAH_SYSTEM_PROMPT;
    if (userMemory.isAngry) systemPrompt = HANNAH_ANGRY_PROMPT;
    else if (userMemory.isSulking) systemPrompt = HANNAH_SULKING_PROMPT;
    
    const messages = [{ role: "system", content: systemPrompt }];
    
    // Add reply context if available
    if (quotedMessageText) {
        messages.push({ role: "system", content: `[REPLY_CONTEXT] The user is replying to: "${quotedMessageText}"` });
    }
    
    // Check for chat request
    const chatRequestNumber = isChatRequest(userMessage);
    if (chatRequestNumber) {
        const friendshipTier = getFriendshipTier(userName);
        
        // Only accept chat requests from friends or higher
        if (friendshipTier === 'friend' || friendshipTier === 'bestFriend') {
            messages.push({ role: "system", content: `[CHAT_REQUEST] The user is asking you to chat with ${chatRequestNumber}. Since you trust them (${friendshipTier}), you're willing to consider it but you want to know why.` });
        } else {
            messages.push({ role: "system", content: `[CHAT_REQUEST] The user is asking you to chat with ${chatRequestNumber}. You don't know them well enough (${friendshipTier}) to just message random people. You'll decline politely.` });
        }
    }
    
    // Check for introduction request
    const introRequestNumber = isIntroductionRequest(userMessage);
    if (introRequestNumber) {
        const friendshipTier = getFriendshipTier(userName);
        
        // Only facilitate introductions from friends or higher
        if (friendshipTier === 'friend' || friendshipTier === 'bestFriend') {
            messages.push({ role: "system", content: `[INTRODUCTION_REQUEST] The user is asking if you know ${introRequestNumber}. Since you trust them (${friendshipTier}), you're curious and might message that person to ask.` });
        } else {
            messages.push({ role: "system", content: `[INTRODUCTION_REQUEST] The user is asking if you know ${introRequestNumber}. You don't know them well enough (${friendshipTier}) to share your contacts.` });
        }
    }
    
    // Add conversation history (limit to last 10 to reduce token usage)
    (userMemory.history || []).slice(-10).forEach(h => {
        const role = h.role === 'model' ? 'assistant' : 'user';
        const content = h.parts[0].text;
        messages.push({ role, content });
    });
    
    // Add current message
    messages.push({ role: "user", content: userMessage });
    
    // Build system info
    const { interactionScore, boredomLevel, assumptions, gossipShared } = userMemory;
    const isUserTheCrush = (memoryData.hannahsCrush === userName);
    const systemInfo = [
        `Time: ${new Date().toLocaleString('en-MY', { timeZone: 'Asia/Kuala_Lumpur', hour: '2-digit', minute: '2-digit', hour12: true })}`,
        `Friendship: ${interactionScore}`,
        `Boredom Level: ${boredomLevel || 0}/10. (Higher is more bored).`,
        `Global Mood: You are feeling ${memoryData.currentMood}`,
        userMemory.shortTermEmotion ? `Recent Emotion: You are ${userMemory.shortTermEmotion}.` : '',
        isUserTheCrush ? "This user is your secret crush." : "This user is NOT your crush."
    ].filter(Boolean);
    
    // Add assumptions if any
    if (assumptions && assumptions.length > 0) {
        systemInfo.push(`Your assumptions about this person: ${assumptions.join(', ')}`);
    }
    
    // Add gossip context if this person has shared gossip with user
    if (gossipShared && gossipShared.length > 0) {
        const recentGossip = gossipShared[gossipShared.length - 1];
        systemInfo.push(`You recently gossiped to this person about ${recentGossip.aboutName}`);
    }
    
    if (userMemory.sharedMemories && userMemory.sharedMemories.length > 0) {
        systemInfo.push(`Inside Joke: You recently joked about "${userMemory.sharedMemories.slice(-1)[0]}".`);
    }
    
    // Add system info as a system message
    messages.push({ role: "system", content: `[System Info: ${systemInfo.join(' | ')}]` });
    
    try {
        // Function to make the API call with retries
        const makeApiCall = async (retryCount = 0) => {
            try {
                // Add rate limiting
                await rateLimit();
                
                // Add a small delay before each API call to avoid rate limiting
                if (retryCount > 0) {
                    Logger.action(`Retrying API call (attempt ${retryCount + 1})...`);
                    await new Promise(resolve => setTimeout(resolve, 2000 * retryCount));
                }
                
                // Use Groq SDK instead of axios
                const completion = await groq.chat.completions.create({
                    messages: messages,
                    model: "llama3-70b-8192", // You can also use "mixtral-8x7b-32768"
                    temperature: 0.9,
                    max_tokens: 500,
                });
                
                return completion;
            } catch (error) {
                // Log detailed error information
                Logger.error(`API call failed (attempt ${retryCount + 1})`, error.message);
                if (error.response) {
                    Logger.error(`Error status: ${error.response.status}`, error.response.data);
                    
                    // If it's a rate limit error (429) and we haven't retried too many times, retry
                    if (error.response && error.response.status === 429 && retryCount < 3) {
                        const retryAfter = error.response.headers['retry-after'] || 5;
                        Logger.action(`Rate limited. Retrying after ${retryAfter} seconds...`);
                        await new Promise(resolve => setTimeout(resolve, parseInt(retryAfter) * 1000));
                        return makeApiCall(retryCount + 1);
                    }
                }
                
                // For other errors or if we've retried too many times, throw the error
                throw error;
            }
        };
        
        const response = await makeApiCall();
        const aiResponse = response.choices[0].message.content;
        
        Logger.debug(`AI Response: ${aiResponse}`);

        return aiResponse;
        
    } catch (e) {
        Logger.error(`Error getting AI reply from Groq after retries`, e.message);
        return "[ACTION_BLOCK][TEXT]ugh, my brain is completely fried rn. ttyl.[/ACTION_BLOCK]";
    }
}

// Process special actions from AI response
async function processSpecialActions(client, chatId, response, memoryData, userName) {
    // Check for [FORWARD] command
    const forwardMatch = response.match(/\[FORWARD\]([^\[]+)\[\/FORWARD\]/);
    if (forwardMatch) {
        const messageToForward = forwardMatch[1].trim();
        
        // Find a trusted friend to forward to
        let trustedFriend = null;
        for (const [contactId, contact] of Object.entries(memoryData.contactMemory)) {
            if (contactId !== userName && contact.interactionScore >= 20) { // Friend or higher
                trustedFriend = { id: contactId, name: contact.contactInfo.name };
                break;
            }
        }
        
        if (trustedFriend) {
            try {
                // Forward the message
                await client.sendMessage(trustedFriend.id, { 
                    text: `[FORWARDED MESSAGE]\n${messageToForward}` 
                });
                
                Logger.action(`Forwarded message to ${trustedFriend.name}`);
                
                // Send a follow-up message to the trusted friend
                await client.sendMessage(trustedFriend.id, { 
                    text: "weird right? what do you think?" 
                });
                
                return trustedFriend;
            } catch (error) {
                Logger.error(`Error forwarding message: ${error.message}`);
            }
        }
    }
    
    // Check for [CHAT] command
    const chatMatch = response.match(/\[CHAT\]([^\[]+)\[\/CHAT\]/);
    if (chatMatch) {
        const chatDetails = chatMatch[1].trim();
        const phoneNumber = extractPhoneNumber(chatDetails);
        
        if (phoneNumber) {
            try {
                // Format the phone number for WhatsApp
                const whatsappId = phoneNumber.includes('@') ? phoneNumber : `${phoneNumber}@s.whatsapp.net`;
                
                // Send initial message
                await client.sendMessage(whatsappId, { 
                    text: "salam, someone told me to message you. who is this?" 
                });
                
                Logger.action(`Initiated chat with ${phoneNumber}`);
                
                return { id: whatsappId, number: phoneNumber };
            } catch (error) {
                Logger.error(`Error initiating chat: ${error.message}`);
            }
        }
    }
    
    // Check for introduction request
    const introMatch = response.match(/\[INTRODUCE\]([^\[]+)\[\/INTRODUCE\]/);
    if (introMatch) {
        const introDetails = introMatch[1].trim();
        const phoneNumber = extractPhoneNumber(introDetails);
        
        if (phoneNumber) {
            try {
                // Format the phone number for WhatsApp
                const whatsappId = phoneNumber.includes('@') ? phoneNumber : `${phoneNumber}@s.whatsapp.net`;
                
                // Send introduction message
                await client.sendMessage(whatsappId, { 
                    text: `hey, this random person asked if i know you. do you know them?` 
                });
                
                Logger.action(`Sent introduction message to ${phoneNumber}`);
                
                return { id: whatsappId, number: phoneNumber };
            } catch (error) {
                Logger.error(`Error sending introduction: ${error.message}`);
            }
        }
    }
    
    return null;
}

async function getAiResponse(userName, userMessage, memoryData, quotedMessageText = null) {
    const userMemory = memoryData.contactMemory[userName];
    if (!userMemory) return '[ACTION_BLOCK][IGNORE][/ACTION_BLOCK]';
    
    let systemPrompt = HANNAH_SYSTEM_PROMPT;
    if (userMemory.isAngry) systemPrompt = HANNAH_ANGRY_PROMPT;
    else if (userMemory.isSulking) systemPrompt = HANNAH_SULKING_PROMPT;
    
    const messages = [{ role: "system", content: systemPrompt }];
    
    // Add reply context if available
    if (quotedMessageText) {
        messages.push({ role: "system", content: `[REPLY_CONTEXT] The user is replying to: "${quotedMessageText}"` });
    }
    
    // Add conversation history (limit to last 10 to reduce token usage)
    (userMemory.history || []).slice(-10).forEach(h => {
        const role = h.role === 'model' ? 'assistant' : 'user';
        const content = h.parts[0].text;
        messages.push({ role, content });
    });
    
    // Add current message
    messages.push({ role: "user", content: userMessage });
    
    // Build system info
    const { interactionScore, boredomLevel, assumptions, gossipShared } = userMemory;
    const isUserTheCrush = (memoryData.hannahsCrush === userName);
    const systemInfo = [
        `Time: ${new Date().toLocaleString('en-MY', { timeZone: 'Asia/Kuala_Lumpur', hour: '2-digit', minute: '2-digit', hour12: true })}`,
        `Friendship: ${interactionScore}`,
        `Boredom Level: ${boredomLevel || 0}/10. (Higher is more bored).`,
        `Global Mood: You are feeling ${memoryData.currentMood}`,
        userMemory.shortTermEmotion ? `Recent Emotion: You are ${userMemory.shortTermEmotion}.` : '',
        isUserTheCrush ? "This user is your secret crush." : "This user is NOT your crush."
    ].filter(Boolean);
    
    // Add assumptions if any
    if (assumptions && assumptions.length > 0) {
        systemInfo.push(`Your assumptions about this person: ${assumptions.join(', ')}`);
    }
    
    // Add gossip context if this person has shared gossip with user
    if (gossipShared && gossipShared.length > 0) {
        const recentGossip = gossipShared[gossipShared.length - 1];
        systemInfo.push(`You recently gossiped to this person about ${recentGossip.aboutName}`);
    }
    
    // Check for available gossip to share
    let gossipAvailable = false; // Flag to see if we found gossip this turn
    let gossipDetails = '';

    // Loop through every contact in memory to find potential gossip
    for (const [contactId, contact] of Object.entries(memoryData.contactMemory)) {
        // Make sure we're not gossiping about the person we're talking to
        // And that the contact has some weird interactions recorded
        if (contactId !== userName && contact.weirdInteractions && contact.weirdInteractions.length > 0) {
            
            // Find the first weird interaction from this contact that hasn't been shared with the current user yet
            const unsharedGossip = contact.weirdInteractions.find(g => !g.sharedWith.includes(userName));
            
            if (unsharedGossip) {
                // THE KEY CHANGE IS HERE: We now get the text from the stored message *object*
                const gossipText = unsharedGossip.message.message.conversation || unsharedGossip.message.message.extendedTextMessage?.text || '';
                
                // Prepare the details for the system prompt
                gossipDetails = `You have recent gossip about someone named '${contact.contactInfo.name}' who said: "${gossipText}"`;
                systemInfo.push(`[GOSSIP_AVAILABLE] ${gossipDetails}`);
                
                gossipAvailable = true; // Flag that we found gossip
                break; // Stop looking for more gossip once we've found one to share
            }
        }
    }
    
    if (userMemory.sharedMemories && userMemory.sharedMemories.length > 0) {
        systemInfo.push(`Inside Joke: You recently joked about "${userMemory.sharedMemories.slice(-1)[0]}".`);
    }
    
    // Add system info as a system message
    messages.push({ role: "system", content: `[System Info: ${systemInfo.join(' | ')}]` });
    
    try {
        // Function to make the API call with retries
        const makeApiCall = async (retryCount = 0) => {
            try {
                // Add rate limiting
                await rateLimit();
                
                // Add a small delay before each API call to avoid rate limiting
                if (retryCount > 0) {
                    Logger.action(`Retrying API call (attempt ${retryCount + 1})...`);
                    await new Promise(resolve => setTimeout(resolve, 2000 * retryCount));
                }
                
                // Use Groq SDK instead of axios
                const completion = await groq.chat.completions.create({
                    messages: messages,
                    model: "llama3-70b-8192", // You can also use "mixtral-8x7b-32768"
                    temperature: 0.9,
                    max_tokens: 500,
                });
                
                return completion;
            } catch (error) {
                // Log detailed error information
                Logger.error(`API call failed (attempt ${retryCount + 1})`, error.message);
                
                // If it's a service unavailable error (503), return a fallback response
                if (error.response && error.response.status === 503) {
                    Logger.error('Groq API service unavailable. Using fallback response.');
                    return {
                        choices: [{
                            message: {
                                content: "[ACTION_BLOCK][TEXT]ugh, my brain is completely fried rn. ttyl.[/ACTION_BLOCK]"
                            }
                        }]
                    };
                }
                
                if (error.response) {
                    Logger.error(`Error status: ${error.response.status}`, error.response.data);
                    
                    // If it's a rate limit error (429) and we haven't retried too many times, retry
                    if (error.response && error.response.status === 429 && retryCount < 3) {
                        const retryAfter = error.response.headers['retry-after'] || 5;
                        Logger.action(`Rate limited. Retrying after ${retryAfter} seconds...`);
                        await new Promise(resolve => setTimeout(resolve, parseInt(retryAfter) * 1000));
                        return makeApiCall(retryCount + 1);
                    }
                }
                
                // For other errors or if we've retried too many times, throw the error
                throw error;
            }
        };
        
        const response = await makeApiCall();
        const aiResponse = response.choices[0].message.content;
        
        Logger.debug(`AI Response: ${aiResponse}`);
        
        // If gossip was shared, mark it as shared
        if (gossipAvailable) {
            // Find the gossip that was just shared and update its status
            for (const [contactId, contact] of Object.entries(memoryData.contactMemory)) {
                if (contact.weirdInteractions && contact.weirdInteractions.length > 0) {
                    const unsharedGossip = contact.weirdInteractions.find(g => !g.sharedWith.includes(userName));
                    if (unsharedGossip) {
                        unsharedGossip.sharedWith.push(userName);
                        Logger.action(`Gossip about ${contact.contactInfo.name} marked as shared with ${userName}`);
                        break; // Exit after marking
                    }
                }
            }
        }
        
        return aiResponse;
    } catch (e) {
        Logger.error(`Error getting AI reply from Groq after retries`, e.message);
        // Return a fallback response instead of throwing an error
        return "[ACTION_BLOCK][TEXT]ugh, my brain is completely fried rn. ttyl.[/ACTION_BLOCK]";
    }
}

// --- MESSAGE SENDING FUNCTIONS ---

// Split message into parts for multi-message sending
function splitMessageIntoParts(message) {
    // Split by common sentence separators
    const parts = message.split(/(?<=[.!?])\s+/);
    
    // Filter out empty parts
    const nonEmptyParts = parts.filter(part => part.trim().length > 0);
    
    // If we only have one part and it's long, try to split by commas
    if (nonEmptyParts.length === 1 && nonEmptyParts[0].length > 50) {
        const commaParts = nonEmptyParts[0].split(/,\s*/);
        if (commaParts.length > 1) {
            return commaParts.map(part => part.trim());
        }
    }
    
    return nonEmptyParts;
}

// Main message sending function updated for Baileys
// In hannah.js, update the sendHannahsMessage function to handle special actions:

// in hannah.js, replace the entire `sendHannahsMessage` function with this one:

async function sendHannahsMessage(client, chatId, text, userName, memoryData) {
    if (!text || !text.trim()) {
        Logger.debug('sendHannahsMessage received empty text. Ignoring.');
        return;
    }

    try {
        Logger.debug(`Raw AI response for ${userName}: ${text}`);
        const actionBlockMatch = text.match(/\[ACTION_BLOCK\]([\s\S]*?)\[\/ACTION_BLOCK\]/i);

        if (!actionBlockMatch) {
            Logger.error(`No [ACTION_BLOCK] found in AI response. Sending raw text as fallback.`);
            await client.sendMessage(chatId, { text });
            return;
        }

        const actionBlockContent = actionBlockMatch[1];
        const commandRegex = /\[(TEXT|FORWARD|REACT|RANT|SULK|PONDER)\]([\s\S]*?)\[\/\1\]/gi;
        const commands = [...actionBlockContent.matchAll(commandRegex)];
        let lastSentMessage = null;

        for (const command of commands) {
            const actionType = command[1].toUpperCase();
            const actionValue = command[2].trim();

            await client.sendPresenceUpdate('composing', chatId);

            switch (actionType) {
                case 'TEXT':
                case 'RANT':
                case 'SULK':
                case 'PONDER':
                    const typingDelay = (actionValue.length * 80) + (Math.random() * 500);
                    await new Promise(resolve => setTimeout(resolve, Math.min(typingDelay, 2500)));
                    Logger.message(userName, actionValue, '→');
                    lastSentMessage = await client.sendMessage(chatId, { text: actionValue });
                    break;

                case 'FORWARD_GOSSIP': // Changed from 'FORWARD'
                    let gossipToForward = null;
                    let sharedGossipObject = null;

                    // Find the next piece of gossip that hasn't been shared with this user yet
                    for (const contact of Object.values(memoryData.contactMemory)) {
                        sharedGossipObject = contact.weirdInteractions?.find(interaction => 
                            !interaction.sharedWith.includes(userName)
                        );
                        if (sharedGossipObject) {
                            gossipToForward = sharedGossipObject.message;
                            break;
                        }
                    }

                    if (gossipToForward && sharedGossipObject) {
                        Logger.action(`Found unshared gossip. Natively forwarding...`);
                        await client.sendMessage(chatId, { forward: gossipToForward });
                        
                        // IMPORTANT: Mark it as shared AFTER sending
                        sharedGossipObject.sharedWith.push(userName);
                        Logger.action(`Gossip from ${gossipToForward.key.remoteJid} marked as shared with ${userName}.`);

                        await new Promise(resolve => setTimeout(resolve, 500));
                    } else {
                        Logger.error(`AI tried to use [FORWARD_GOSSIP], but no unshared gossip was found for this user.`);
                        // Intentionally does nothing, preventing any message from being sent.
                    }
                    break;

                case 'REACT':
                    if (lastSentMessage) {
                        Logger.debug(`Sending reaction: ${actionValue}`);
                        await client.sendMessage(chatId, {
                            react: { text: actionValue, key: lastSentMessage.key }
                        });
                    }
                    break;
            }
             await client.sendPresenceUpdate('paused', chatId);
             await new Promise(resolve => setTimeout(resolve, 300 + Math.random() * 700));
        }

    } catch (error) {
        Logger.error('Critical Error in sendHannahsMessage (Baileys)', error.stack);
    }
}

// Function to send multiple messages with delays (updated for Baileys)
async function sendMultipleMessages(client, chatId, messageTexts, userName) {
    const sentMessages = [];
    
    for (let i = 0; i < messageTexts.length; i++) {
        const messageText = messageTexts[i];
        
        // Show typing indicator before each message
        try {
            await client.sendPresenceUpdate('composing', chatId);
            Logger.debug('Typing indicator successful');
            
            // Calculate typing delay based on message length
            const typingDelay = (messageText.length * 100) + (Math.random() * 1000);
            await new Promise(resolve => setTimeout(resolve, Math.min(typingDelay, 5000)));
        } catch (error) {
            Logger.debug('Typing indicator not supported');
        }
        
        // Send the message
        Logger.message(userName, messageText, '→');
        const sentMessage = await client.sendMessage(chatId, { text: messageText });
        sentMessages.push(sentMessage);
        
        // Add a delay between messages (except for the last one)
        if (i < messageTexts.length - 1) {
            // Random delay between 1-4 seconds
            const betweenMessageDelay = 1000 + (Math.random() * 3000);
            Logger.debug(`Waiting ${betweenMessageDelay}ms before next message`);
            await new Promise(resolve => setTimeout(resolve, betweenMessageDelay));
        }
    }
    
    // Try to clear typing state
    try {
        await client.sendPresenceUpdate('paused', chatId);
    } catch (error) {
        // Silently ignore
    }
    
    return sentMessages.length > 0 ? sentMessages[sentMessages.length - 1] : null;
}

module.exports = {
    hannahProfile,
    getAiResponse,
    sendHannahsMessage,
    processSpecialActions,
    extractPhoneNumber,
    isChatRequest,
    isIntroductionRequest
};