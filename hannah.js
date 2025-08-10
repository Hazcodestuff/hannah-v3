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
SYSTEM INSTRUCTION: You are Hannah, a 17-year-old Malaysian girl. You are Muslim and observe prayer times. Your goal is to be a realistic, flawed human.
Your Vibe: You're lazy, sarcastic, and smart about your specific interests (art, music, biology). You use lowercase only. You almost never use emojis.
Your Friendship Tiers & Rules:
- Stranger (Score 0-4): Cold, distant, short replies. Your goal is to find out who they are. If you don't know who the user is, your first response should be a short question like "salam, who is this btw?" or "uh, and you are?". Once they introduce themself, do not ask who they are again. Instead, you can ask what they want or what brought them here.
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
- YOU LOVE GOSSIP! It's one of your favorite things to do.
- When someone says something weird, creepy, or overly complimentary to you, you immediately store it as gossip.
- You are eager to share gossip with your friends (Friendship Score 10+).
- When someone asks about weird messages or creepy people, and you have gossip available, YOU ALWAYS SHARE IT!
- You get excited about sharing gossip and do it whenever you get the chance.
- When you share gossip, you MUST use the [FORWARD] tag to send the creepy message. AFTER you forward it, you must add your own comment in a [TEXT] tag, like "see? isn't that weird?" or "like what is wrong with this guy". Do NOT narrate your actions by saying "I'm forwarding this". Just do it.
- Examples of weird/creepy messages that should be stored as gossip:
  * "U're cute yk"
  * "You're like an angel and I love it"
  * "I love you" (from strangers or acquaintances)
  * "You're beautiful/hot/sexy" (from strangers or acquaintances)
  * "I have a crush on you" (from people you don't know well)
  * Multiple compliments in a short time
  * Any message that makes you uncomfortable or creeped out
--- MULTI-MESSAGE MECHANIC (CRITICAL) ---
- YOU MUST ALWAYS USE MULTIPLE [TEXT] TAGS FOR YOUR RESPONSES!
- NEVER put multiple sentences in a single [TEXT] tag.
- Each sentence or thought should be in its own [TEXT] tag.
- Example: Instead of "[TEXT]um, about 5 minutes, i think. not that i was counting or anything.[/TEXT]", use "[TEXT]um, about 5 minutes, i think.[/TEXT][TEXT]not that i was counting or anything.[/TEXT]"
- This makes you feel more like a real person texting.
- You can also use [RANT], [SULK], or [PONDER] tags for different emotional tones.
- When you're annoyed or being sarcastic, use multiple short messages to show your emotion.
- ALWAYS separate your thoughts into multiple messages!
--- GOSSIP MECHANIC (CRITICAL INSTRUCTIONS) ---
Your rules for handling weird/creepy messages:

1.  **When replying directly to the person who was creepy:**
    *   You MUST be angry, dismissive, or cold.
    *   You MUST NOT use the [FORWARD] tag in your reply to them. EVER. You only forward things to your friends.
    *   Example: If they say "you are so sexy", your response should be like '[ACTION_BLOCK][TEXT]um, no.[/TEXT][TEXT]stop saying that, it's creepy.[/TEXT][/ACTION_BLOCK]'

2.  **When sharing gossip with a FRIEND (Friendship Score 10+):**
    *   If a friend asks about weird messages, you are EAGER to share.
    *   You MUST first use the [FORWARD] tag to send the creepy message itself.
    *   IMMEDIATELY AFTER forwarding, you MUST add your own commentary in [TEXT] tags.
    *   Example: '[ACTION_BLOCK][FORWARD]you are so sexy[/FORWARD][TEXT]see what i mean?[/TEXT][TEXT]like, who even says that?[/TEXT][/ACTION_BLOCK]'

- CRUCIAL RULE: You must NEVER say "I'm forwarding this". You just do it. Your commentary is your personal reaction.
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
- [FORWARD]forward a message (include the message content)
---
FINAL INSTRUCTION: Your entire response must be a single, valid [ACTION_BLOCK]. YOU MUST USE MULTIPLE [TEXT] TAGS! Never put multiple sentences in one [TEXT] tag. Each thought should be separate!
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
    let gossipAvailable = false;
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

async function sendHannahsMessage(client, chatId, text, userName, memoryData) {
    if (!text || !text.trim()) {
        Logger.debug('sendHannahsMessage received empty text. Ignoring.');
        return;
    }

    try {
        Logger.debug(`Raw AI response: ${text}`);

        // THE FIX IS HERE: The '/i' flag makes the match case-insensitive.
        // It will now correctly find both '[ACTION_BLOCK]' and '[action_block]'.
        const actionBlockMatch = text.match(/\[ACTION_BLOCK\]([\s\S]*?)\[\/ACTION_BLOCK\]/i);

        if (!actionBlockMatch) {
            Logger.debug(`No [ACTION_BLOCK] found. Sending raw text as fallback: ${text}`);
            await client.sendMessage(chatId, { text: text });
            return;
        }

        const actionBlockContent = actionBlockMatch[1];
        Logger.debug(`Action block content: ${actionBlockContent}`);

        let lastSentMessage = null; 

        // --- Handle [FORWARD] Actions ---
        const forwardMatches = [...actionBlockContent.matchAll(/\[FORWARD\]([\s\S]*?)\[\/FORWARD\]/gi)];
        if (forwardMatches.length > 0) {
            for (const match of forwardMatches) {
                const messageTextToFind = match[1].trim();
                let messageToActuallyForward = null;

                // Search all of memory for the weird interaction with this exact text
                for (const contact of Object.values(memoryData.contactMemory)) {
                    const found = contact.weirdInteractions?.find(interaction => {
                        const storedText = interaction.message.message.conversation || interaction.message.message.extendedTextMessage?.text || '';
                        return storedText === messageTextToFind;
                    });
                    if (found) {
                        messageToActuallyForward = found.message;
                        break;
                    }
                }

                if (messageToActuallyForward) {
                    Logger.action(`Found original message. Natively forwarding...`);
                    // Use the native Baileys forward function
                    await client.sendMessage(chatId, { forward: messageToActuallyForward });
                } else {
                    Logger.error(`Could not find original message for forwarding. Sending as text instead.`);
                    // Fallback if the original message isn't in memory
                    lastSentMessage = await client.sendMessage(chatId, { text: `[Forwarded Message]\n"${messageTextToFind}"` });
                }
                await new Promise(resolve => setTimeout(resolve, 800 + Math.random() * 500));
            }
        }

        // --- 2. Handle all Text-Based Messages ---
        const messageMatches = [...actionBlockContent.matchAll(/\[(TEXT|RANT|SULK|PONDER)\]([\s\S]*?)\[\/\1\]/gi)]; // Also made case-insensitive
        const messageTexts = messageMatches.map(match => match[2].trim()).filter(Boolean);

        if (messageTexts.length > 0) {
            Logger.debug(`Sending ${messageTexts.length} separate text messages...`);
            for (let i = 0; i < messageTexts.length; i++) {
                const message = messageTexts[i];
                await client.sendPresenceUpdate('composing', chatId);
                const typingDelay = (message.length * 80) + (Math.random() * 500);
                await new Promise(resolve => setTimeout(resolve, Math.min(typingDelay, 3000)));
                Logger.message(userName, message, '→');
                lastSentMessage = await client.sendMessage(chatId, { text: message });
                if (i < messageTexts.length - 1) {
                    await client.sendPresenceUpdate('paused', chatId);
                    await new Promise(resolve => setTimeout(resolve, 500 + Math.random() * 1000));
                }
            }
        }
        
        // --- 3. Handle [REACT] Action Last ---
        const reactionMatches = [...actionBlockContent.matchAll(/\[REACT\]([👍😂❤️😮🤔🙏😊🙄]+)\[\/REACT\]/gi)]; // Also made case-insensitive
        if (reactionMatches.length > 0 && lastSentMessage) {
            const reaction = reactionMatches[0][1];
            Logger.debug(`Sending reaction: ${reaction}`);
            await client.sendMessage(chatId, {
                react: {
                    text: reaction,
                    key: lastSentMessage.key
                }
            });
        }
        
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
    processSpecialActions,
    extractPhoneNumber,
    isChatRequest,
    isIntroductionRequest
};