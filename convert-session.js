// convert-session.js
const fs = require('fs');

// Read the session file
const session = fs.readFileSync('sessions/creds.json');

// Convert to base64
const base64Session = session.toString('base64');

console.log('SESSION_CREDS_BASE64:');
console.log(base64Session);