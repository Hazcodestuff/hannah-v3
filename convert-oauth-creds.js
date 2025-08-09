// convert-oauth-creds.js
const fs = require('fs');

// Read the OAuth credentials file
const credentials = fs.readFileSync('oauth-credentials.json');

// Convert to base64
const base64Credentials = credentials.toString('base64');

console.log('GOOGLE_OAUTH_CREDS_BASE64=' + base64Credentials);