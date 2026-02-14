#!/usr/bin/env node

/**
 * SQLite-4.0 Events
 * Event system for database hooks
 */

const EventEmitter = require('events');

class DatabaseEvents extends EventEmitter {
    constructor(db) {
        super();
        this.db = db;
        
        // Register default listeners
        this._registerDefaults();
    }
    
    _registerDefaults() {
        // Query events
        this.on('query', (data) => {
            // Could log to file, send to analytics, etc.
        });
        
        // Error events
        this.on('error', (data) => {
            console.error(`[DB ERROR] ${data.error}`);
        });
    }
    
    // Emit query event
    emitQuery(sql, params, result, duration) {
        this.emit('query', {
            sql: sql.substring(0, 200),
            params,
            success: result.success,
            rowCount: result.rowCount || 0,
            duration,
            timestamp: new Date().toISOString()
        });
    }
    
    // Emit connection events
    emitConnect(connection) {
        this.emit('connect', {
            connectionId: connection.id,
            timestamp: new Date().toISOString()
        });
    }
    
    emitDisconnect(connection) {
        this.emit('disconnect', {
            connectionId: connection.id,
            timestamp: new Date().toISOString()
        });
    }
    
    // Emit transaction events
    emitTransactionBegin(id) {
        this.emit('transactionBegin', {
            transactionId: id,
            timestamp: new Date().toISOString()
        });
    }
    
    emitTransactionCommit(id, duration) {
        this.emit('transactionCommit', {
            transactionId: id,
            duration,
            timestamp: new Date().toISOString()
        });
    }
    
    emitTransactionRollback(id, duration) {
        this.emit('transactionRollback', {
            transactionId: id,
            duration,
            timestamp: new Date().toISOString()
        });
    }
    
    // Emit table events
    emitTableCreate(table) {
        this.emit('tableCreate', {
            table,
            timestamp: new Date().toISOString()
        });
    }
    
    emitTableDrop(table) {
        this.emit('tableDrop', {
            table,
            timestamp: new Date().toISOString()
        });
    }
    
    // Emit row events
    emitRowInsert(table, row) {
        this.emit('rowInsert', {
            table,
            row,
            timestamp: new Date().toISOString()
        });
    }
    
    emitRowUpdate(table, row, changes) {
        this.emit('rowUpdate', {
            table,
            row,
            changes,
            timestamp: new Date().toISOString()
        });
    }
    
    emitRowDelete(table, row) {
        this.emit('rowDelete', {
            table,
            row,
            timestamp: new Date().toISOString()
        });
    }
    
    // Emit security events
    emitAuthSuccess(user) {
        this.emit('authSuccess', {
            user,
            timestamp: new Date().toISOString()
        });
    }
    
    emitAuthFailure(user, reason) {
        this.emit('authFailure', {
            user,
            reason,
            timestamp: new Date().toISOString()
        });
    }
    
    emitRateLimit(ip, endpoint) {
        this.emit('rateLimit', {
            ip,
            endpoint,
            timestamp: new Date().toISOString()
        });
    }
    
    // Create event middleware for Express/connect
    middleware() {
        return (req, res, next) => {
            const start = Date.now();
            
            // Store start time
            req._dbEventStart = start;
            
            // Wrap res.json to emit events after response
            const originalJson = res.json.bind(res);
            res.json = (data) => {
                const duration = Date.now() - start;
                
                this.emit('response', {
                    method: req.method,
                    path: req.path,
                    statusCode: res.statusCode,
                    duration,
                    timestamp: new Date().toISOString()
                });
                
                return originalJson(data);
            };
            
            next();
        };
    }
    
    // Setup event logging to file
    setupFileLogging(filepath) {
        const fs = require('fs');
        const stream = fs.createWriteStream(filepath, { flags: 'a' });
        
        this.on('query', (data) => {
            stream.write(`[QUERY] ${data.timestamp} ${data.sql} (${data.duration}ms)\n`);
        });
        
        this.on('error', (data) => {
            stream.write(`[ERROR] ${data.timestamp} ${data.error}\n`);
        });
        
        this.on('authSuccess', (data) => {
            stream.write(`[AUTH] ${data.timestamp} Success: ${data.user}\n`);
        });
        
        this.on('authFailure', (data) => {
            stream.write(`[AUTH] ${data.timestamp} Failed: ${data.user} - ${data.reason}\n`);
        });
        
        return stream;
    }
    
    // Get event statistics
    getStats() {
        const stats = {
            totalQueries: 0,
            totalErrors: 0,
            totalAuthSuccess: 0,
            totalAuthFailure: 0,
            avgQueryDuration: 0,
            lastQuery: null,
            lastError: null
        };
        
        // Could maintain counters internally
        return stats;
    }
}

module.exports = DatabaseEvents;
