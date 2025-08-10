// debug-credentials.js
const fs = require('fs');
const Logger = require('./logger.js');

// Check local credentials file
if (fs.existsSync('oauth-credentials.json')) {
    const credentials = JSON.parse(fs.readFileSync('oauth-credentials.json', 'utf8'));
    console.log('=== Local Credentials Structure ===');
    console.log('Keys:', Object.keys(credentials));
    
    if (credentials.installed) {
        console.log('Installed keys:', Object.keys(credentials.installed));
    } else if (credentials.web) {
        console.log('Web keys:', Object.keys(credentials.web));
    }
    
    console.log('Full credentials:');
    console.log(JSON.stringify(credentials, null, 2));
} else {
    console.log('No local credentials file found');
}

// Check environment variables (if running in Render)
if (process.env.GOOGLE_OAUTH_CREDS_BASE64) {
    console.log('\n=== Environment Credentials Structure ===');
    const credentialsJson = Buffer.from(process.env.GOOGLE_OAUTH_CREDS_BASE64, 'base64').toString();
    const credentials = JSON.parse(credentialsJson);
    
    console.log('Keys:', Object.keys(credentials));
    
    if (credentials.installed) {
        console.log('Installed keys:', Object.keys(credentials.installed));
    } else if (credentials.web) {
        console.log('Web keys:', Object.keys(credentials.web));
    }
    
    console.log('Full credentials:');
    console.log(JSON.stringify(credentials, null, 2));
} else {
    console.log('\nNo environment credentials found');
}