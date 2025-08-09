// oauth.js
const { google } = require('googleapis');
const Logger = require('./logger.js');

// Google Drive OAuth Setup
let auth = null;

function initializeOAuth() {
    if (process.env.GOOGLE_OAUTH_TOKEN_BASE64 && process.env.GOOGLE_OAUTH_CREDS_BASE64) {
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