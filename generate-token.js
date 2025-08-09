// generate-token.js
const path = require('path');
const fs = require('fs');
const { google } = require('googleapis');
const http = require('http');
const url = require('url');

// Debug: Check if path is available
console.log('Path module loaded:', typeof path);

const SCOPES = ['https://www.googleapis.com/auth/drive'];
const TOKEN_PATH = path.join(__dirname, 'token.json');
const CREDENTIALS_PATH = path.join(__dirname, 'oauth-credentials.json');

async function main() {
    try {
        console.log('Starting OAuth token generation...');
        
        // Check if credentials file exists
        if (!fs.existsSync(CREDENTIALS_PATH)) {
            console.error('Error: oauth-credentials.json file not found!');
            console.log('Please make sure you have downloaded the OAuth credentials file and named it oauth-credentials.json');
            return;
        }
        
        // Load client secrets from a local file
        const content = fs.readFileSync(CREDENTIALS_PATH, 'utf8');
        const credentials = JSON.parse(content);
        
        const { client_secret, client_id, redirect_uris } = credentials.installed;
        const oAuth2Client = new google.auth.OAuth2(
            client_id, client_secret, redirect_uris[0]
        );

        // Generate authorization URL
        const authUrl = oAuth2Client.generateAuthUrl({
            access_type: 'offline',
            scope: SCOPES,
        });
        
        console.log('\n=== OAuth Token Generation ===');
        console.log('1. Please visit this URL to authorize the app:');
        console.log(authUrl);
        console.log('\n2. Copy the authorization code from the URL after you authorize');
        console.log('3. Paste it here when prompted\n');

        // Ask user for the authorization code
        const readline = require('readline');
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });

        rl.question('Enter the authorization code: ', async (code) => {
            try {
                console.log('Getting tokens...');
                
                // Get tokens
                const { tokens } = await oAuth2Client.getToken(code);
                
                // Store the token to disk
                fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens, null, 2));
                console.log('✓ Token stored to', TOKEN_PATH);
                
                // Convert token to base64 for Render
                const tokenBase64 = Buffer.from(JSON.stringify(tokens)).toString('base64');
                
                console.log('\n=== SUCCESS! ===');
                console.log('Add this environment variable to your Render service:');
                console.log('\nGOOGLE_OAUTH_TOKEN_BASE64=' + tokenBase64);
                console.log('\n=================\n');
                
                rl.close();
            } catch (error) {
                console.error('Error getting tokens:', error.message);
                rl.close();
            }
        });
    } catch (error) {
        console.error('Error in main function:', error);
    }
}

main();