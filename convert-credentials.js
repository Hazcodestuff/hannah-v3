// convert-credentials.js
const fs = require('fs');

// Read the credentials file
const credentials = fs.readFileSync('credentials.json');

// Convert to base64
const base64Credentials = credentials.toString('base64');

console.log('GOOGLE_CREDENTIALS_BASE64:');
console.log(base64Credentials);