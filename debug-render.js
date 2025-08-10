// debug-render.js
console.log('=== Render Environment Debug ===');
console.log('Node version:', process.version);
console.log('Environment variables check:');

const envVars = [
    'GOOGLE_OAUTH_TOKEN_BASE64',
    'GOOGLE_OAUTH_CREDS_BASE64',
    'GOOGLE_DRIVE_FOLDER_ID',
    'GROQ_API_KEY',
    'SESSION_CREDS_BASE64',
    'PORT'
];

envVars.forEach(envVar => {
    const value = process.env[envVar];
    if (value) {
        console.log(`${envVar}: ✓ Set (length: ${value.length})`);
        
        // Try to parse if it's base64
        if (envVar.includes('BASE64')) {
            try {
                const decoded = Buffer.from(value, 'base64').toString('utf8');
                try {
                    const parsed = JSON.parse(decoded);
                    console.log(`  - Parsed as JSON with keys: ${Object.keys(parsed).join(', ')}`);
                } catch (e) {
                    console.log(`  - Not valid JSON, but decoded successfully`);
                }
            } catch (e) {
                console.log(`  - Failed to decode as base64`);
            }
        }
    } else {
        console.log(`${envVar}: ✗ Not set`);
    }
});

// Try to initialize OAuth
try {
    const { google } = require('googleapis');
    const Logger = {
        system: (msg) => console.log(`[SYSTEM] ${msg}`),
        error: (msg) => console.log(`[ERROR] ${msg}`)
    };
    
    console.log('\n=== OAuth Initialization Test ===');
    
    const hasToken = !!process.env.GOOGLE_OAUTH_TOKEN_BASE64;
    const hasCreds = !!process.env.GOOGLE_OAUTH_CREDS_BASE64;
    
    console.log(`Has token: ${hasToken}`);
    console.log(`Has credentials: ${hasCreds}`);
    
    if (hasToken && hasCreds) {
        try {
            // Decode base64 token
            const tokenJson = Buffer.from(process.env.GOOGLE_OAUTH_TOKEN_BASE64, 'base64').toString();
            const tokens = JSON.parse(tokenJson);
            
            // Decode base64 OAuth credentials
            const credentialsJson = Buffer.from(process.env.GOOGLE_OAUTH_CREDS_BASE64, 'base64').toString();
            const credentials = JSON.parse(credentialsJson);
            
            console.log('Credentials structure keys:', Object.keys(credentials));
            
            // Handle different credential structures
            let client_id, client_secret, redirect_uris;
            
            if (credentials.installed) {
                console.log('Using credentials.installed structure');
                client_id = credentials.installed.client_id;
                client_secret = credentials.installed.client_secret;
                redirect_uris = credentials.installed.redirect_uris || ['http://localhost'];
            } else if (credentials.web) {
                console.log('Using credentials.web structure');
                client_id = credentials.web.client_id;
                client_secret = credentials.web.client_secret;
                redirect_uris = credentials.web.redirect_uris || ['http://localhost'];
            } else {
                console.log('Using direct credentials structure');
                client_id = credentials.client_id;
                client_secret = credentials.client_secret;
                redirect_uris = credentials.redirect_uris || ['http://localhost'];
            }
            
            if (!client_id || !client_secret) {
                console.log('ERROR: Missing client_id or client_secret');
            } else {
                console.log('Creating OAuth2 client...');
                const auth = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);
                auth.setCredentials(tokens);
                console.log('✓ OAuth client created successfully');
            }
        } catch (error) {
            console.log('ERROR during OAuth initialization:', error.message);
        }
    } else {
        console.log('ERROR: Missing token or credentials');
    }
} catch (error) {
    console.log('ERROR in debug script:', error.message);
}