#!/usr/bin/env node

/**
 * SQLite-4.0 Example: Two-Factor Authentication (2FA)
 * 
 * This example demonstrates:
 * - Enabling TOTP-based 2FA
 * - Generating QR codes for authenticator apps
 * - Verifying 2FA codes
 * - Using backup codes
 * - Account recovery
 */

const SQLite4 = require('../../src/sqlite4.js');

async function main() {
    console.log('SQLite-4.0 Two-Factor Authentication Example\n');
    console.log('='.repeat(50));
    
    // Create database
    const db = new SQLite4({
        dbPath: ':memory:'
    });
    
    // Access 2FA module
    const tfa = db.security;
    
    // Example user email
    const userEmail = 'admin@example.com';
    
    console.log(`\n1. Setting up 2FA for: ${userEmail}`);
    
    // Enable 2FA
    const setupResult = await tfa.enable(userEmail, {
        issuer: 'SQLite-4.0',
        algorithm: 'SHA256',
        digits: 8,
        period: 30
    });
    
    console.log('\n2. 2FA Setup Information:');
    console.log('   Secret Key (Base32):');
    console.log('   ' + setupResult.secret);
    console.log('\n   TOTP URI (for QR code):');
    console.log('   ' + setupResult.uri);
    console.log('\n   Backup Codes (SAVE THESE!):');
    setupResult.backupCodes.forEach((code, i) => {
        console.log(`   ${i + 1}. ${code}`);
    });
    console.log('\n   Recovery Token:');
    console.log('   ' + setupResult.recoveryToken);
    
    // Check 2FA status
    console.log('\n3. Checking 2FA Status...');
    const status = tfa.getStatus(userEmail);
    console.log('   Enabled:', status.enabled);
    console.log('   Setup Required:', status.setupRequired);
    console.log('   Backup Codes Remaining:', status.backupCodesRemaining);
    
    // Verify initial setup with current TOTP code
    console.log('\n4. Confirming 2FA Setup...');
    
    // Generate current TOTP code (for testing purposes)
    // In real usage, user would scan QR code and enter code from their authenticator app
    console.log('   Note: In production, user enters code from authenticator app');
    
    // Simulate user entering verification code
    // You would use an authenticator app like Google Authenticator, Authy, etc.
    const verificationCode = '12345678'; // This would come from the user's authenticator app
    
    // For demonstration, we'll skip confirmation and proceed
    console.log('   To confirm: tfa.confirm(userEmail, codeFromAuthenticator)');
    
    // Example: Verifying a 2FA code (when user logs in)
    console.log('\n5. Verifying 2FA Code (during login)...');
    
    // In production, this would be called after username/password authentication
    // const isValid = tfa.verify(userEmail, userProvidedCode);
    // console.log('   Code valid:', isValid);
    
    console.log('   Verification requires 8-digit TOTP code from authenticator app');
    
    // Example: Using a backup code
    console.log('\n6. Using a Backup Code...');
    
    // If user loses their authenticator, they can use a backup code
    const backupCode = 'ABCDEFGHIJ'; // One of the backup codes generated earlier
    
    const backupResult = tfa.verifyBackupCode(userEmail, backupCode);
    
    if (backupResult.valid) {
        console.log('   Backup code valid!');
        console.log('   Remaining backup codes:', backupResult.remaining);
    } else {
        console.log('   Invalid backup code or already used');
    }
    
    // Example: Using recovery token
    console.log('\n7. Account Recovery with Token...');
    
    // If user loses both authenticator and backup codes
    const recoveryToken = setupResult.recoveryToken;
    
    const recoveryResult = tfa.useRecoveryToken(recoveryToken);
    
    if (recoveryResult.valid) {
        console.log('   Recovery successful!');
        console.log('   User ID:', recoveryResult.userId);
        console.log('   Token type:', recoveryResult.type);
    }
    
    // Regenerating backup codes
    console.log('\n8. Regenerating Backup Codes...');
    
    // User must verify with current TOTP code first
    console.log('   Note: Requires current TOTP code for verification');
    console.log('   Command: tfa.regenerateBackupCodes(userEmail, currentTotpCode)');
    
    // Disabling 2FA
    console.log('\n9. Disabling 2FA...');
    
    // Requires TOTP code or admin intervention
    // const disableResult = await tfa.disable(userEmail, totpCode);
    console.log('   To disable: tfa.disable(userEmail, totpCode)');
    console.log('   Or admin can disable without code');
    
    // Multiple users example
    console.log('\n10. Managing Multiple Users...');
    
    const users = ['user1@example.com', 'user2@example.com', 'user3@example.com'];
    
    for (const email of users) {
        const result = await tfa.enable(email, { issuer: 'SQLite-4.0' });
        const userStatus = tfa.getStatus(email);
        console.log(`   ${email}: 2FA ${userStatus.enabled ? 'Enabled' : 'Pending'} (${userStatus.backupCodesRemaining} backup codes)`);
    }
    
    // Summary
    console.log('\n' + '='.repeat(50));
    console.log('\n2FA Features Summary:');
    console.log('- TOTP-based (Google Authenticator, Authy, etc.)');
    console.log('- Configurable: digits (6-8), period (30-60s)');
    console.log('- 10 backup codes per user');
    console.log('- Recovery tokens for account rescue');
    console.log('- SHA-1, SHA-256, SHA-512 algorithms');
    
    console.log('\nExample completed!');
}

main().catch(console.error);
