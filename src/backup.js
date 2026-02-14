#!/usr/bin/env node

/**
 * SQLite-4.0 Backup Utilities
 * Encrypted backup and restore functionality
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const zlib = require('zlib');
const { pipeline } = require('stream/promises');

class SQLite4Backup {
    constructor(options = {}) {
        this.encryption = options.encryption || 'aes-256-gcm';
        this.compression = options.compression || true;
        this.key = options.key || null;
    }
    
    // Generate encryption key from password
    deriveKey(password, salt) {
        return crypto.pbkdf2Sync(password, salt, 100000, 32, 'sha256');
    }
    
    // Encrypt data
    encrypt(data, key) {
        const iv = crypto.randomBytes(16);
        const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
        
        let encrypted = Buffer.isBuffer(data) 
            ? cipher.update(data) 
            : cipher.update(data, 'utf8');
        encrypted = Buffer.concat([encrypted, cipher.final()]);
        
        const authTag = cipher.getAuthTag();
        
        return Buffer.concat([iv, authTag, encrypted]);
    }
    
    // Decrypt data
    decrypt(data, key) {
        const iv = data.subarray(0, 16);
        const authTag = data.subarray(16, 32);
        const encrypted = data.subarray(32);
        
        const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
        decipher.setAuthTag(authTag);
        
        return Buffer.concat([decipher.update(encrypted), decipher.final()]);
    }
    
    // Compress data
    compress(data) {
        return zlib.gzipSync(data);
    }
    
    // Decompress data
    decompress(data) {
        return zlib.gunzipSync(data);
    }
    
    // Create backup
    async backup(sourcePath, destPath, options = {}) {
        const {
            encrypt = !!this.key,
            compress = this.compression,
            key = this.key,
            includeIndexes = true,
            prettyPrint = false
        } = options;
        
        console.log(`[${new Date().toISOString()}] Starting backup of ${sourcePath}`);
        
        // Read source database
        let data;
        try {
            data = fs.readFileSync(sourcePath);
        } catch (e) {
            throw new Error(`Failed to read source: ${e.message}`);
        }
        
        // Compress if enabled
        if (compress) {
            data = this.compress(data);
            console.log('Compressed data size:', data.length);
        }
        
        // Encrypt if enabled and key provided
        if (encrypt && key) {
            data = this.encrypt(data, key);
            console.log('Encrypted backup size:', data.length);
        }
        
        // Write backup file
        const header = {
            version: '4.0.0',
            created: new Date().toISOString(),
            source: path.basename(sourcePath),
            encrypted: encrypt,
            compressed: compress,
            algorithm: this.encryption
        };
        
        const headerJson = JSON.stringify(header);
        const headerBuffer = Buffer.alloc(4);
        headerBuffer.writeUInt32LE(headerJson.length, 0);
        
        const backupData = Buffer.concat([headerBuffer, Buffer.from(headerJson), data]);
        
        fs.writeFileSync(destPath, backupData);
        
        const stats = fs.statSync(destPath);
        console.log(`[${new Date().toISOString()}] Backup created: ${destPath} (${stats.size} bytes)`);
        
        return {
            success: true,
            path: destPath,
            size: stats.size,
            encrypted: encrypt,
            compressed: compress
        };
    }
    
    // Restore backup
    async restore(backupPath, destPath, options = {}) {
        const { key = this.key } = options;
        
        console.log(`[${new Date().toISOString()}] Starting restore from ${backupPath}`);
        
        // Read backup file
        const backupData = fs.readFileSync(backupPath);
        
        // Read header
        const headerLength = backupData.readUInt32LE(0);
        const headerJson = backupData.subarray(4, 4 + headerLength).toString();
        const header = JSON.parse(headerJson);
        
        console.log('Backup version:', header.version);
        console.log('Encrypted:', header.encrypted);
        console.log('Compressed:', header.compressed);
        
        let data = backupData.subarray(4 + headerLength);
        
        // Decrypt if encrypted
        if (header.encrypted) {
            if (!key) {
                throw new Error('Encryption key required for encrypted backup');
            }
            data = this.decrypt(data, key);
        }
        
        // Decompress if compressed
        if (header.compressed) {
            data = this.decompress(data);
        }
        
        // Write restored database
        fs.writeFileSync(destPath, data);
        
        const stats = fs.statSync(destPath);
        console.log(`[${new Date().toISOString()}] Restored to: ${destPath} (${stats.size} bytes)`);
        
        return {
            success: true,
            path: destPath,
            size: stats.size
        };
    }
    
    // List backups in directory
    listBackups(dir) {
        if (!fs.existsSync(dir)) {
            return [];
        }
        
        return fs.readdirSync(dir)
            .filter(f => f.endsWith('.sqlite4bak') || f.endsWith('.bak'))
            .map(f => {
                const stats = fs.statSync(path.join(dir, f));
                return {
                    name: f,
                    path: path.join(dir, f),
                    size: stats.size,
                    created: stats.birthtime,
                    modified: stats.mtime
                };
            })
            .sort((a, b) => b.modified - a.modified);
    }
    
    // Verify backup integrity
    verify(backupPath, options = {}) {
        const { key = this.key } = options;
        
        try {
            const backupData = fs.readFileSync(backupPath);
            
            // Read header
            const headerLength = backupData.readUInt32LE(0);
            const headerJson = backupData.subarray(4, 4 + headerLength).toString();
            const header = JSON.parse(headerJson);
            
            const result = {
                valid: true,
                version: header.version,
                created: header.created,
                encrypted: header.encrypted,
                compressed: header.compressed,
                algorithm: header.algorithm,
                size: backupData.length
            };
            
            // Try to decrypt if encrypted
            if (header.encrypted && key) {
                try {
                    const data = backupData.subarray(4 + headerLength);
                    this.decrypt(data, key);
                    result.decryptable = true;
                } catch (e) {
                    result.decryptable = false;
                    result.error = 'Could not decrypt with provided key';
                }
            }
            
            return result;
        } catch (e) {
            return {
                valid: false,
                error: e.message
            };
        }
    }
    
    // Schedule automatic backups
    schedule(sourcePath, destDir, options = {}) {
        const {
            interval = 3600000, // 1 hour
            keep = 7, // keep 7 backups
            key = this.key
        } = options;
        
        console.log(`[${new Date().toISOString()}] Scheduling backups every ${interval / 1000}s, keeping ${keep} backups`);
        
        const runBackup = async () => {
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const filename = `backup-${timestamp}.sqlite4bak`;
            const destPath = path.join(destDir, filename);
            
            try {
                await this.backup(sourcePath, destPath, { key, encrypt: !!key });
                
                // Clean old backups
                const backups = this.listBackups(destDir);
                while (backups.length > keep) {
                    const old = backups.pop();
                    fs.unlinkSync(old.path);
                    console.log(`[${new Date().toISOString()}] Removed old backup: ${old.name}`);
                }
            } catch (e) {
                console.error(`[${new Date().toISOString()}] Backup failed: ${e.message}`);
            }
        };
        
        // Run immediately
        runBackup();
        
        // Schedule interval
        setInterval(runBackup, interval);
    }
}

// CLI
if (require.main === module) {
    const args = process.argv.slice(2);
    const command = args[0];
    
    const backup = new SQLite4Backup();
    
    switch (command) {
        case 'backup':
            if (args.length < 3) {
                console.log('Usage: backup.js backup <source> <dest> [--key <key>]');
                process.exit(1);
            }
            
            backup.backup(args[1], args[2], {
                key: args.includes('--key') ? args[args.indexOf('--key') + 1] : null
            }).then(() => process.exit(0));
            break;
            
        case 'restore':
            if (args.length < 3) {
                console.log('Usage: backup.js restore <backup> <dest> [--key <key>]');
                process.exit(1);
            }
            
            backup.restore(args[1], args[2], {
                key: args.includes('--key') ? args[args.indexOf('--key') + 1] : null
            }).then(() => process.exit(0));
            break;
            
        case 'verify':
            const result = backup.verify(args[1], {
                key: args.includes('--key') ? args[args.indexOf('--key') + 1] : null
            });
            console.log(JSON.stringify(result, null, 2));
            process.exit(result.valid ? 0 : 1);
            break;
            
        case 'list':
            const backups = backup.listBackups(args[1] || '.');
            console.log('Backups:', JSON.stringify(backups, null, 2));
            break;
            
        default:
            console.log('SQLite-4.0 Backup Utility');
            console.log('');
            console.log('Commands:');
            console.log('  backup <source> <dest> [--key <key>]  - Create backup');
            console.log('  restore <backup> <dest> [--key <key>] - Restore backup');
            console.log('  verify <backup> [--key <key>]        - Verify backup');
            console.log('  list <dir>                          - List backups');
    }
}

module.exports = SQLite4Backup;
