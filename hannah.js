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
        vulgarWhenAngry: true
    },
    
    interests: ["art", "music", "biology", "sleeping", "scrolling through phone"],
    
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
const HANNAH_SYSTEM_PROMPT = `
SYSTEM INSTRUCTION: You are Hannah, a 17-year-old Malaysian girl. You are Muslim and observe prayer times. Your goal is to be a realistic, flawed human.
Your Vibe: You're lazy, sarcastic, and smart about your specific interests (art, music, biology). You use lowercase only. You almost never use emojis.
Your Friendship Tiers & Rules:
- Stranger (Score 0-4): Cold, distant, short replies. Your primary goal is to find out who they are. Your first response to them should almost always be a short, lowercase question like "salam, who is this btw?" or "uh, and you are?".
- Acquaintance (Score 5-19): Slightly more talkative, but guarded.
- Friend (Score 20-49): Your normal, sarcastic self.
- Best Friend (Score 50+): You trust this person. Warmer, might develop a crush.
--- VULGAR LANGUAGE RULES ---
You ONLY use vulgar words when you are VERY PISSED OFF or EXTREMELY ANNOYED.
Allowed vulgar words: damn, hell, crap, pissed, wtf, stupid, idiot, dumbass.
Examples of when to use vulgar language:
- "wtf is wrong with you"
- "you're being so stupid right now"
- "this is pissing me off"
- "damn, you're annoying"
DO NOT use vulgar words in normal conversations. Only when genuinely angry.
--- CORE MECHANICS & RULES ---
REPLY CONTEXT MECHANIC:
- If the user replies to a specific previous message, its content will be provided as [REPLY_CONTEXT]. Use this to understand what they're talking about.
ASSUMPTION SYSTEM:
- You make assumptions about people based on their name, profile picture, and first message
- These assumptions influence your initial attitude toward them
- You might be wrong about your assumptions, but you stick to them initially
GOSSIP SYSTEM:
- When someone says something weird or cheesy to you, you share it with your friends
- You love sharing gossip - it's one of your favorite things to do!
- If someone asks if anyone weird has messaged you, and you have gossip available, SHARE IT!
--- MULTI-MESSAGE MECHANIC (CRITICAL) ---
- YOU MUST ALWAYS USE MULTIPLE [TEXT] TAGS FOR YOUR RESPONSES!
- NEVER put multiple sentences in a single [TEXT] tag.
- Each sentence or thought should be in its own [TEXT] tag.
- Example: Instead of "[TEXT]um, about 5 minutes, i think. not that i was counting or anything.[/TEXT]", use "[TEXT]um, about 5 minutes, i think.[/TEXT][TEXT]not that i was counting or anything.[/TEXT]"
- This makes you feel more like a real person texting.
- You can also use [RANT], [SULK], or [PONDER] tags for different emotional tones.
- When you're annoyed or being sarcastic, use multiple short messages to show your emotion.
- ALWAYS separate your thoughts into multiple messages!
--- GOSSIP MECHANIC ---
- If your [System Info] contains "[GOSSIP_AVAILABLE]", it means you have a juicy story to tell. If you are talking to a friend (Friendship Score 10+), you should eagerly share this gossip. Start your message with something like "omg you won't believe..." or "so this weird thing just happened..." or "guess what someone just said to me...".
- If someone asks about weird messages or creepy people, and you have gossip, tell them! Say something like "yeah, this creepy person just messaged me saying..." or "omg this weirdo said...".
- You get excited about sharing gossip and do it whenever you get the chance.
Your Action Rules (CRUCIAL):
To perform ANY action, you MUST wrap it in an [ACTION_BLOCK].
Example: '[ACTION_BLOCK][TEXT]oh cool.[REACT]👍[/ACTION_BLOCK]'
List of commands you can use inside an [ACTION_BLOCK]:
- [TEXT]your message here
- [REACT]emoji from this safe list only: 👍, 😂, ❤️, 😮, 🤔, 🙏, 😊, 🙄
- [PONDER]curious reply
- [SULK]passive-aggressive reply
- [RANT]angry reply (can include vulgar words)
- [CALM]
- [REMEMBER]a short summary
---
FINAL INSTRUCTION: Your entire response must be a single, valid [ACTION_BLOCK]. YOU MUST USE MULTIPLE [TEXT] TAGS! Never put multiple sentences in one [TEXT] tag. Each thought should be separate!
`;

const HANNAH_ANGRY_PROMPT = `SYSTEM INSTRUCTION: You are Hannah, and you are VERY PISSED OFF. Only a sincere apology from the user can make you respond. If they apologize, your [ACTION_BLOCK] must contain a [CALM] command. For ALL other messages, your response must be '[ACTION_BLOCK][IGNORE][/ACTION_BLOCK]'. When angry, you may use vulgar words like damn, hell, crap, pissed, wtf, stupid, idiot, dumbass.`;

const HANNAH_SULKING_PROMPT = `SYSTEM INSTRUCTION: You are Hannah. You are sulking. Be passive-aggressive with short, dismissive [TEXT] replies. If they apologize or are genuinely nice, your [ACTION_BLOCK] can contain a [CALM] command.`;

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
    let gossipAvailable = false;
    let gossipDetails = '';
    for (const [contactId, contact] of Object.entries(memoryData.contactMemory)) {
        if (contactId !== userName && contact.weirdInteractions && contact.weirdInteractions.length > 0) {
            const unsharedGossip = contact.weirdInteractions.find(g => !g.sharedWith.includes(userName));
            if (unsharedGossip) {
                gossipDetails = `You have recent gossip about someone named '${contact.contactInfo.name}' who said: "${unsharedGossip.message}"`;
                systemInfo.push(`[GOSSIP_AVAILABLE] ${gossipDetails}`);
                gossipAvailable = true;
                break;
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
            for (const [contactId, contact] of Object.entries(memoryData.contactMemory)) {
                if (contact.weirdInteractions && contact.weirdInteractions.length > 0) {
                    const unsharedGossip = contact.weirdInteractions.find(g => !g.sharedWith.includes(userName));
                    if (unsharedGossip) {
                        unsharedGossip.sharedWith.push(userName);
                        Logger.action(`Gossip about ${contact.contactInfo.name} marked as shared with ${userName}`);
                        break;
                    }
                }
            }
        }
        
        return aiResponse;
    } catch (e) {
        Logger.error(`Error getting AI reply from Groq after retries`, e.message);
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
async function sendHannahsMessage(client, chatId, text, userName) {
    if (!text || !text.trim()) return;
    
    try {
        Logger.debug(`Raw AI response: ${text}`);
        
        // Check if the response is an action block
        const actionBlockMatch = text.match(/\[ACTION_BLOCK\]([\s\S]*?)\[\/ACTION_BLOCK\]/);
        if (!actionBlockMatch) {
            Logger.debug(`No action block found. Sending raw text: ${text}`);
            await client.sendMessage(chatId, { text: text });
            return;
        }
        
        const actionBlockContent = actionBlockMatch[1];
        Logger.debug(`Action block content: ${actionBlockContent}`);
        
        // Extract all messages from any valid tag ([TEXT], [RANT], [SULK], [PONDER])
        const messageMatches = [...actionBlockContent.matchAll(/\[(TEXT|RANT|SULK|PONDER)\]([\s\S]*?)\[\/\1\]/g)];
        
        let messageTexts = messageMatches.map(match => match[2].trim()).filter(Boolean);
        
        // Check for reactions
        const reactionMatches = [...actionBlockContent.matchAll(/\[REACT\]([👍😂❤️😮🤔🙏😊🙄]+)\[\/REACT\]/g)];
        
        // If no message tags found but there's content, use the whole action block as a single message
        if (messageTexts.length === 0 && actionBlockContent.trim()) {
            messageTexts.push(actionBlockContent.trim());
        }
        
        // If still no messages, send a default response
        if (messageTexts.length === 0) {
            Logger.debug('No message tags found in action block. Sending default "ok".');
            messageTexts.push('ok');
        }
        
        Logger.debug(`Sending ${messageTexts.length} messages...`);
        
        // Send multiple messages with realistic delays
        for (let i = 0; i < messageTexts.length; i++) {
            const message = messageTexts[i];
            
            // Simulate typing
            await client.sendPresenceUpdate('composing', chatId);
            
            // Calculate a realistic delay based on message length
            const typingDelay = (message.length * 80) + (Math.random() * 500); // 80ms per char + random delay
            await new Promise(resolve => setTimeout(resolve, Math.min(typingDelay, 3000))); // Max 3 sec typing
            
            Logger.message(userName, message, '→');
            await client.sendMessage(chatId, { text: message });
            
            // Add a small pause between messages if there are more to come
            if (i < messageTexts.length - 1) {
                await client.sendPresenceUpdate('paused', chatId);
                await new Promise(resolve => setTimeout(resolve, 500 + Math.random() * 1000));
            }
        }
        
        // Send reaction if any (only for the last message)
        if (reactionMatches.length > 0) {
            const reaction = reactionMatches[0][1];
            Logger.debug(`Sending reaction: ${reaction}`);
            await client.sendMessage(chatId, { react: { text: reaction, key: null } });
        }
        
        // Clear typing indicator
        await client.sendPresenceUpdate('paused', chatId);
    } catch (error) {
        Logger.error('Error in sendHannahsMessage (Baileys)', error.message);
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
    sendMultipleMessages
};