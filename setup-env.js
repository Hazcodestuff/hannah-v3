// setup-env.js
const fs = require('fs');

console.log('=== Setting up environment variables ===\n');

// Convert OAuth credentials
try {
    const credentials = fs.readFileSync('oauth-credentials.json');
    const base64Credentials = credentials.toString('base64');
    console.log('GOOGLE_OAUTH_CREDS_BASE64=' + base64Credentials);
    console.log('\n');
} catch (error) {
    console.log('oauth-credentials.json not found.\n');
}

// Convert token
try {
    const token = fs.readFileSync('token.json');
    const base64Token = token.toString('base64');
    console.log('GOOGLE_OAUTH_TOKEN_BASE64=' + base64Token);
    console.log('\n');
} catch (error) {
    console.log('token.json not found.\n');
}

// Convert session
try {
    if (fs.existsSync('sessions/creds.json')) {
        const session = fs.readFileSync('sessions/creds.json');
        const base64Session = session.toString('base64');
        console.log('SESSION_CREDS_BASE64=' + base64Session);
        console.log('\n');
    } else {
        console.log('sessions/creds.json not found.\n');
    }
} catch (error) {
    console.log('Error reading session file.\n');
}

console.log('Add these environment variables to your .env file or Render dashboard');