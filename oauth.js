// oauth.js (Robust version for Render)
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
            
            Logger.system('Credentials structure keys:', Object.keys(credentials));
            
            // Handle different credential structures
            let client_id, client_secret, redirect_uris;
            
            if (credentials.installed) {
                Logger.system('Using credentials.installed structure');
                client_id = credentials.installed.client_id;
                client_secret = credentials.installed.client_secret;
                redirect_uris = credentials.installed.redirect_uris || ['http://localhost'];
            } else if (credentials.web) {
                Logger.system('Using credentials.web structure');
                client_id = credentials.web.client_id;
                client_secret = credentials.web.client_secret;
                redirect_uris = credentials.web.redirect_uris || ['http://localhost'];
            } else {
                Logger.system('Using direct credentials structure');
                client_id = credentials.client_id;
                client_secret = credentials.client_secret;
                redirect_uris = credentials.redirect_uris || ['http://localhost'];
            }
            
            if (!client_id || !client_secret) {
                Logger.error('Invalid credentials structure. Missing client_id or client_secret.');
                return false;
            }
            
            Logger.system(`Creating OAuth2 client with ID: ${client_id.substring(0, 10)}...`);
            auth = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);
            auth.setCredentials(tokens);
            
            Logger.system('✓ Google Drive OAuth credentials loaded from environment variable');
            return true;
        } catch (error) {
            Logger.error('Failed to parse Google OAuth credentials from environment variable:', error.message);
            Logger.error('Error details:', error);
            return false;
        }
    } else {
        Logger.error('Google OAuth credentials not found in environment variables');
        
        // For local development, try to use the local file
        try {
            const fs = require('fs');
            if (fs.existsSync('./oauth-credentials.json') && fs.existsSync('./token.json')) {
                Logger.system('Attempting to use local OAuth files for development');
                
                const credentials = JSON.parse(fs.readFileSync('./oauth-credentials.json', 'utf8'));
                const tokens = JSON.parse(fs.readFileSync('./token.json', 'utf8'));
                
                const { client_id, client_secret, redirect_uris } = credentials.installed;
                
                auth = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);
                auth.setCredentials(tokens);
                
                Logger.system('✓ Google Drive OAuth credentials loaded from local files');
                return true;
            }
        } catch (localError) {
            Logger.error('Failed to load local OAuth files:', localError.message);
        }
        
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