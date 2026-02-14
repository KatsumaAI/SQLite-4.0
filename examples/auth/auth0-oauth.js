#!/usr/bin/env node

/**
 * SQLite-4.0 Example: Auth0 OAuth Authentication
 * 
 * This example demonstrates:
 * - Configuring Auth0 with multiple OAuth providers
 * - Generating authorization URLs
 * - Exchanging codes for tokens
 * - Managing user sessions
 */

const SQLite4 = require('../../src/sqlite4.js');

async function main() {
    console.log('SQLite-4.0 Auth0 Integration Example\n');
    console.log('='.repeat(50));
    
    // Create database with Auth0 configuration
    const db = new SQLite4({
        dbPath: ':memory:',
        auth0: {
            domain: 'your-tenant.auth0.com',
            clientId: 'your-client-id',
            clientSecret: 'your-client-secret',
            redirectUri: 'http://localhost:3000/callback',
            providers: ['discord', 'google', 'github', 'twitter', 'microsoft']
        }
    });
    
    console.log('\n1. Database created with Auth0 configuration');
    
    // Access Auth0 module
    const auth = db.auth;
    
    // Generate authorization URL for Discord
    console.log('\n2. Generating Discord OAuth URL...');
    
    const discordAuth = auth.getAuthorizationUrl('discord', {
        state: 'random-state-123',
        scope: 'identify email',
        pkce: true
    });
    
    console.log('   Authorization URL generated:');
    console.log('   ' + discordAuth.url.substring(0, 80) + '...');
    console.log('   State: ' + discordAuth.state);
    
    // Generate authorization URL for Google
    console.log('\n3. Generating Google OAuth URL...');
    
    const googleAuth = auth.getAuthorizationUrl('google', {
        state: 'google-state-456',
        scope: 'openid email profile',
        pkce: true
    });
    
    console.log('   Google authorization URL generated');
    
    // Example: Custom endpoint authentication
    console.log('\n4. Custom endpoint authentication...');
    
    // This would typically be called after receiving credentials from your custom auth
    // In production, you would exchange these with your auth service
    try {
        const customUser = await auth.loginWithProvider('custom:enterprise-sso', {
            accessToken: 'enterprise-sso-token',
            userData: {
                id: 'ent-user-123',
                email: 'user@enterprise.com',
                name: 'Enterprise User',
                role: 'admin'
            }
        });
        console.log('   Custom auth successful for:', customUser.user.email);
    } catch (e) {
        console.log('   Custom auth skipped (no endpoint configured)');
    }
    
    // Verify JWT token example
    console.log('\n5. JWT Token Verification...');
    
    // This is how you would verify tokens from Auth0
    const mockToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...';
    const verificationResult = db.auth.verifyToken(mockToken);
    
    if (verificationResult.valid) {
        console.log('   Token is valid');
        console.log('   Payload:', verificationResult.payload);
    } else {
        console.log('   Token verification failed:', verificationResult.error);
    }
    
    // Example: Generate custom login token
    console.log('\n6. Generating custom login token...');
    
    const customToken = db.auth.generateCustomToken(
        { id: 'user-123', email: 'test@example.com', role: 'admin' },
        { expiresIn: 3600, claims: { custom: 'value' } }
    );
    console.log('   Custom token generated:');
    console.log('   ' + customToken.substring(0, 50) + '...');
    
    // List available providers
    console.log('\n7. Available OAuth Providers:');
    const providers = ['discord', 'google', 'github', 'twitter', 'microsoft'];
    providers.forEach(p => console.log(`   - ${p}`));
    
    console.log('\n' + '='.repeat(50));
    console.log('\nAuth0 Integration Example completed!');
    console.log('\nTo complete OAuth flow:');
    console.log('1. Redirect user to authorization URL');
    console.log('2. User authenticates with provider');
    console.log('3. Callback received with authorization code');
    console.log('4. Exchange code for tokens using exchangeCode()');
    console.log('5. User is now authenticated and logged in');
}

main().catch(console.error);
