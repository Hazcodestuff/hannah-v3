// oauth.js (Updated with debugging)
const { google } = require('googleapis');
const Logger = require('./logger.js');

// Google Drive OAuth Setup
let auth = null;

function initializeOAuth() {
    Logger.system('=== Initializing OAuth ===');
    
    // Check if environment variables are set
    const hasToken = !!process.env.GOOGLE_OAUTH_TOKEN_BASE64;
    const hasCreds = !!process.env.GOOGLE_OAUTH_CREDS_BASE64;
    
    Logger.system(`GOOGLE_OAUTH_TOKEN_BASE64: ${hasToken ? '✓ Set' : '✗ Not set'}`);
    Logger.system(`GOOGLE_OAUTH_CREDS_BASE64: ${hasCreds ? '✓ Set' : '✗ Not set'}`);
    
    if (hasToken && hasCreds) {
        try {
            // Decode base64 token
            const tokenJson = Buffer.from(process.env.GOOGLE_OAUTH_TOKEN_BASE64, 'base64').toString();
            const tokens = JSON.parse(tokenJson);
            
            // Decode base64 OAuth credentials
            const credentialsJson = Buffer.from(process.env.GOOGLE_OAUTH_CREDS_BASE64, 'base64').toString();
            const credentials = JSON.parse(credentialsJson);
            
            const { client_id, client_secret, redirect_uris } = credentials.installed;
            
            auth = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);
            auth.setCredentials(tokens);
            
            Logger.system('✓ Google Drive OAuth credentials loaded from environment variable');
            return true;
        } catch (error) {
            Logger.error('Failed to parse Google OAuth credentials from environment variable:', error.message);
            return false;
        }
    } else {
        Logger.error('Google OAuth credentials not found in environment variables');
        return false;
    }
}

function getAuth() {
    return auth;
}

function isAuthConfigured() {
    return auth !== null;
}

module.exports = {
    initializeOAuth,
    getAuth,
    isAuthConfigured
};