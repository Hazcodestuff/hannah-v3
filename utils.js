// utils.js
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

module.exports = {
    rateLimit
};