#!/usr/bin/env node

/**
 * SQLite-4.0 Two-Factor Authentication
 * TOTP-based 2FA with backup codes
 */

const crypto = require('crypto');
const base32 = require('hi-base32');

class TwoFactorAuth {
    constructor(db, options = {}) {
        this.db = db;
        this.options = {
            issuer: options.issuer || 'SQLite-4.0',
            algorithm: options.algorithm || 'SHA256',
            digits: options.digits || 8,
            period: options.period || 30,
            backupCodesCount: options.backupCodesCount || 10,
            backupCodeLength: options.backupCodeLength || 10
        };
        
        this._init();
    }
    
    _init() {
        // Create 2FA tables
        this.db.execute(`
            CREATE TABLE IF NOT EXISTS _mfa_config (
                user_id TEXT PRIMARY KEY,
                secret TEXT NOT NULL,
                algorithm TEXT DEFAULT 'SHA256',
                digits INTEGER DEFAULT 8,
                period INTEGER DEFAULT 30,
                enabled INTEGER DEFAULT 0,
                confirmed_at INTEGER,
                created_at INTEGER DEFAULT CURRENT_TIMESTAMP
            )
        `);
        
        this.db.execute(`
            CREATE TABLE IF NOT EXISTS _mfa_backup_codes (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id TEXT NOT NULL,
                code TEXT NOT NULL,
                used INTEGER DEFAULT 0,
                used_at INTEGER,
                created_at INTEGER DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES _mfa_config(user_id)
            )
        `);
        
        this.db.execute(`
            CREATE TABLE IF NOT EXISTS _mfa_tokens (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id TEXT NOT NULL,
                token TEXT NOT NULL,
                expires_at INTEGER NOT NULL,
                token_type TEXT DEFAULT 'recovery',
                used INTEGER DEFAULT 0,
                created_at INTEGER DEFAULT CURRENT_TIMESTAMP
            )
        `);
    }
    
    // Generate a new secret
    generateSecret() {
        const secret = crypto.randomBytes(20);
        return {
            base32: base32.encode(secret).replace(/=/g, ''),
            hex: secret.toString('hex'),
            uri: this.generateSecret() // Will be overwritten
        };
    }
    
    // Generate TOTP URI for authenticator apps
    generateTOTPUri(email, secret) {
        const params = new URLSearchParams({
            secret,
            issuer: this.options.issuer,
            algorithm: this.options.algorithm,
            digits: this.options.digits,
            period: this.options.period
        });
        
        return `otpauth://totp/${encodeURIComponent(email)}?${params.toString()}`;
    }
    
    // Enable 2FA for user
    async enable(email, options = {}) {
        const secret = this.generateSecret().base32;
        const algorithm = options.algorithm || this.options.algorithm;
        const digits = options.digits || this.options.digits;
        const period = options.period || this.options.period;
        
        // Generate backup codes
        const backupCodes = this._generateBackupCodes();
        
        // Store MFA config
        this.db.execute(
            `INSERT OR REPLACE INTO _mfa_config 
             (user_id, secret, algorithm, digits, period, enabled, confirmed_at) 
             VALUES (?, ?, ?, ?, ?, 0, NULL)`,
            [email, secret, algorithm, digits, period]
        );
        
        // Store backup codes
        for (const code of backupCodes) {
            this.db.execute(
                `INSERT INTO _mfa_backup_codes (user_id, code) VALUES (?, ?)`,
                [email, this._hashBackupCode(code)]
            );
        }
        
        // Generate recovery token
        const recoveryToken = this._generateRecoveryToken(email);
        
        return {
            secret,
            uri: this.generateTOTPUri(email, secret),
            backupCodes,
            recoveryToken
        };
    }
    
    // Confirm 2FA setup with verification code
    async confirm(email, code) {
        // Verify the code
        const verified = this._verifyTOTP(email, code);
        
        if (!verified) {
            return { success: false, error: 'Invalid verification code' };
        }
        
        // Enable 2FA
        this.db.execute(
            `UPDATE _mfa_config SET enabled = 1, confirmed_at = ? WHERE user_id = ?`,
            [Date.now(), email]
        );
        
        return { success: true };
    }
    
    // Disable 2FA
    async disable(email, verificationCode = null) {
        // Verify code if provided
        if (verificationCode) {
            const verified = this._verifyTOTP(email, verificationCode);
            if (!verified) {
                return { success: false, error: 'Invalid verification code' };
            }
        }
        
        // Delete MFA config and backup codes
        this.db.execute(`DELETE FROM _mfa_backup_codes WHERE user_id = ?`, [email]);
        this.db.execute(`DELETE FROM _mfa_config WHERE user_id = ?`, [email]);
        this.db.execute(`DELETE FROM _mfa_tokens WHERE user_id = ?`, [email]);
        
        return { success: true };
    }
    
    // Verify TOTP code
    verify(email, code) {
        return this._verifyTOTP(email, code);
    }
    
    // Verify backup code
    verifyBackupCode(email, code) {
        const hashedCode = this._hashBackupCode(code);
        
        const result = this.db.execute(
            `SELECT id FROM _mfa_backup_codes 
             WHERE user_id = ? AND code = ? AND used = 0`,
            [email, hashedCode]
        );
        
        if (result.rows.length === 0) {
            return { valid: false, remaining: 0 };
        }
        
        // Mark as used
        this.db.execute(
            `UPDATE _mfa_backup_codes SET used = 1, used_at = ? WHERE id = ?`,
            [Date.now(), result.rows[0].id]
        );
        
        // Count remaining
        const remaining = this.db.execute(
            `SELECT COUNT(*) as count FROM _mfa_backup_codes 
             WHERE user_id = ? AND used = 0`,
            [email]
        ).rows[0].count;
        
        return { valid: true, remaining };
    }
    
    // Generate recovery token
    generateRecoveryToken(email) {
        return this._generateRecoveryToken(email);
    }
    
    // Use recovery token
    useRecoveryToken(token) {
        const result = this.db.execute(
            `SELECT * FROM _mfa_tokens 
             WHERE token = ? AND expires_at > ? AND used = 0`,
            [token, Date.now()]
        );
        
        if (result.rows.length === 0) {
            return { valid: false, error: 'Invalid or expired token' };
        }
        
        const tokenData = result.rows[0];
        
        // Mark as used
        this.db.execute(
            `UPDATE _mfa_tokens SET used = 1 WHERE id = ?`,
            [tokenData.id]
        );
        
        return { 
            valid: true, 
            userId: tokenData.user_id,
            type: tokenData.token_type 
        };
    }
    
    // Regenerate backup codes
    async regenerateBackupCodes(email, verificationCode) {
        // Verify current code
        if (!this._verifyTOTP(email, verificationCode)) {
            return { success: false, error: 'Invalid verification code' };
        }
        
        // Delete old codes
        this.db.execute(`DELETE FROM _mfa_backup_codes WHERE user_id = ?`, [email]);
        
        // Generate new codes
        const backupCodes = this._generateBackupCodes();
        
        for (const code of backupCodes) {
            this.db.execute(
                `INSERT INTO _mfa_backup_codes (user_id, code) VALUES (?, ?)`,
                [email, this._hashBackupCode(code)]
            );
        }
        
        return { success: true, backupCodes };
    }
    
    // Check if 2FA is enabled
    isEnabled(email) {
        const result = this.db.execute(
            `SELECT enabled FROM _mfa_config WHERE user_id = ?`,
            [email]
        );
        return result.rows.length > 0 && result.rows[0].enabled === 1;
    }
    
    // Get 2FA status
    getStatus(email) {
        const config = this.db.execute(
            `SELECT * FROM _mfa_config WHERE user_id = ?`,
            [email]
        ).rows[0];
        
        if (!config) {
            return { enabled: false, setupRequired: true };
        }
        
        const backupCodesRemaining = this.db.execute(
            `SELECT COUNT(*) as count FROM _mfa_backup_codes 
             WHERE user_id = ? AND used = 0`,
            [email]
        ).rows[0].count;
        
        return {
            enabled: config.enabled === 1,
            setupRequired: false,
            confirmedAt: config.confirmed_at,
            backupCodesRemaining,
            algorithm: config.algorithm,
            digits: config.digits,
            period: config.period
        };
    }
    
    // Internal: Verify TOTP code
    _verifyTOTP(email, code) {
        const config = this.db.execute(
            `SELECT * FROM _mfa_config WHERE user_id = ? AND enabled = 1`,
            [email]
        ).rows[0];
        
        if (!config) {
            return false;
        }
        
        const secret = config.secret;
        const digits = config.digits || this.options.digits;
        const period = config.period || this.options.period;
        
        // Get current time window
        const now = Math.floor(Date.now() / 1000 / period);
        
        // Check current and adjacent windows
        for (let i = -1; i <= 1; i++) {
            const window = now + i;
            const expectedCode = this._generateTOTP(secret, window, digits);
            
            // Constant-time comparison
            if (code.length === digits && 
                crypto.timingSafeEqual(
                    Buffer.from(code.padStart(digits, '0')),
                    Buffer.from(expectedCode)
                )) {
                return true;
            }
        }
        
        return false;
    }
    
    // Generate TOTP code
    _generateTOTP(secret, counter, digits) {
        // Decode base32 secret
        const secretBytes = base32.decode(secret);
        
        // Create buffer for counter
        const counterBuffer = Buffer.alloc(8);
        counterBuffer.writeBigUInt64BE(BigInt(counter));
        
        // HMAC-SHA1
        const hmac = crypto.createHmac('sha1', secretBytes);
        hmac.update(counterBuffer);
        const hash = hmac.digest();
        
        // Truncate
        const offset = hash[hash.length - 1] & 0x0f;
        const code = 
            ((hash[offset] & 0x7f) << 24) |
            ((hash[offset + 1] & 0xff) << 16) |
            ((hash[offset + 2] & 0xff) << 8) |
            (hash[offset + 3] & 0xff);
        
        const otp = code % Math.pow(10, digits);
        return otp.toString().padStart(digits, '0');
    }
    
    // Generate backup codes
    _generateBackupCodes() {
        const codes = [];
        for (let i = 0; i < this.options.backupCodesCount; i++) {
            codes.push(this._generateBackupCode());
        }
        return codes;
    }
    
    _generateBackupCode() {
        const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
        let code = '';
        for (let i = 0; i < this.options.backupCodeLength; i++) {
            code += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return code;
    }
    
    // Hash backup code (for storage)
    _hashBackupCode(code) {
        return crypto.createHash('sha256')
            .update(code.toUpperCase())
            .digest('hex');
    }
    
    // Generate recovery token
    _generateRecoveryToken(email) {
        const token = crypto.randomBytes(32).toString('hex');
        const expiresAt = Date.now() + (24 * 60 * 60 * 1000); // 24 hours
        
        this.db.execute(
            `INSERT INTO _mfa_tokens (user_id, token, expires_at, token_type) 
             VALUES (?, ?, ?, 'recovery')`,
            [email, token, expiresAt]
        );
        
        return token;
    }
}

// Export
module.exports = TwoFactorAuth;
