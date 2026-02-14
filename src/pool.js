#!/usr/bin/env node

/**
 * SQLite-4.0 Connection Pool
 * Manage multiple database connections efficiently
 */

const events = require('events');

class ConnectionPool extends events.EventEmitter {
    constructor(options = {}) {
        super();
        
        this.min = options.min || 2;
        this.max = options.max || 10;
        this.acquireTimeout = options.acquireTimeout || 30000;
        this.idleTimeout = options.idleTimeout || 60000;
        this.reapInterval = options.reapInterval || 1000;
        
        this.available = [];
        this.allocated = new Map();
        this.pending = [];
        
        this.creator = options.creator || null;
        this.validator = options.validator || null;
        this.destructor = options.destructor || null;
        
        this._reaping = false;
        this.initialized = false;
    }
    
    // Initialize the pool
    async initialize() {
        if (this.initialized) return;
        
        // Create minimum connections
        const promises = [];
        for (let i = 0; i < this.min; i++) {
            promises.push(this._createConnection());
        }
        
        await Promise.all(promises);
        this.initialized = true;
        
        // Start reaping idle connections
        this._startReaping();
        
        this.emit('initialized');
    }
    
    // Create a new connection
    async _createConnection() {
        if (!this.creator) {
            throw new Error('No creator function provided');
        }
        
        const connection = await this.creator();
        const id = connection.id || Math.random().toString(36).slice(2);
        
        connection.id = id;
        connection.created = Date.now();
        connection.lastUsed = Date.now();
        connection.pooled = true;
        
        this.available.push(connection);
        this.emit('connectionCreated', connection);
        
        return connection;
    }
    
    // Acquire a connection from the pool
    async acquire() {
        // Initialize if needed
        if (!this.initialized) {
            await this.initialize();
        }
        
        // Check for available connections
        while (this.available.length > 0) {
            const connection = this.available.pop();
            
            // Validate if validator provided
            if (this.validator) {
                const valid = await this.validator(connection);
                if (!valid) {
                    await this._destroyConnection(connection);
                    continue;
                }
            }
            
            connection.lastUsed = Date.now();
            this.allocated.set(connection.id, connection);
            this.emit('acquire', connection);
            
            return connection;
        }
        
        // Check if we can create more
        if (this.allocated.size + this.pending.length < this.max) {
            return new Promise((resolve, reject) => {
                const timeout = setTimeout(() => {
                    const idx = this.pending.indexOf({ resolve, reject });
                    if (idx !== -1) this.pending.splice(idx, 1);
                    reject(new Error('Acquire timeout'));
                }, this.acquireTimeout);
                
                this.pending.push({ resolve, reject, timeout });
                
                // Create new connection in background
                this._createConnection().then(conn => {
                    this._processPending();
                }).catch(err => {
                    this._processPending(err);
                });
            });
        }
        
        // Wait for a connection to be released
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                const idx = this.pending.indexOf({ resolve, reject });
                if (idx !== -1) this.pending.splice(idx, 1);
                reject(new Error('Pool exhausted'));
            }, this.acquireTimeout);
            
            this.pending.push({ resolve, reject, timeout });
        });
    }
    
    // Release a connection back to the pool
    release(connection) {
        if (!connection || !connection.id) return;
        
        // Remove from allocated
        if (!this.allocated.has(connection.id)) {
            return; // Already released
        }
        
        this.allocated.delete(connection.id);
        
        // Check if connection is still valid
        if (this.validator) {
            this.validator(connection).then(valid => {
                if (valid) {
                    this._releaseConnection(connection);
                } else {
                    this._destroyConnection(connection);
                }
            });
        } else {
            this._releaseConnection(connection);
        }
        
        this.emit('release', connection);
        this._processPending();
    }
    
    _releaseConnection(connection) {
        connection.lastUsed = Date.now();
        this.available.push(connection);
    }
    
    // Destroy a connection
    async _destroyConnection(connection) {
        if (this.destructor) {
            await this.destructor(connection);
        }
        this.emit('connectionDestroyed', connection);
    }
    
    // Process pending acquire requests
    _processPending(error) {
        if (this.pending.length === 0) return;
        
        // Find a pending request to fulfill
        if (error) {
            const pending = this.pending.shift();
            clearTimeout(pending.timeout);
            pending.reject(error);
            return;
        }
        
        if (this.available.length > 0) {
            const pending = this.pending.shift();
            clearTimeout(pending.timeout);
            
            const connection = this.available.pop();
            connection.lastUsed = Date.now();
            this.allocated.set(connection.id, connection);
            pending.resolve(connection);
        }
    }
    
    // Start reaping idle connections
    _startReaping() {
        if (this._reaping) return;
        
        this._reaping = true;
        
        const reap = async () => {
            const now = Date.now();
            const toRelease = [];
            
            // Check available connections
            for (const connection of this.available) {
                if (now - connection.lastUsed > this.idleTimeout && 
                    this.allocated.size + this.available.length > this.min) {
                    toRelease.push(connection);
                }
            }
            
            // Release excess connections
            for (const connection of toRelease) {
                const idx = this.available.indexOf(connection);
                if (idx !== -1) {
                    this.available.splice(idx, 1);
                    await this._destroyConnection(connection);
                }
            }
        };
        
        this._reapInterval = setInterval(reap, this.reapInterval);
    }
    
    // Get pool status
    getStatus() {
        return {
            available: this.available.length,
            allocated: this.allocated.size,
            pending: this.pending.length,
            min: this.min,
            max: this.max,
            total: this.available.length + this.allocated.size
        };
    }
    
    // Drain the pool (close all connections)
    async drain() {
        // Clear reap interval
        if (this._reapInterval) {
            clearInterval(this._reapInterval);
            this._reapInterval = null;
        }
        this._reaping = false;
        
        // Close all available connections
        for (const connection of this.available) {
            await this._destroyConnection(connection);
        }
        this.available = [];
        
        // Close all allocated connections
        for (const [id, connection] of this.allocated) {
            await this._destroyConnection(connection);
        }
        this.allocated.clear();
        
        // Reject pending
        for (const pending of this.pending) {
            clearTimeout(pending.timeout);
            pending.reject(new Error('Pool drained'));
        }
        this.pending = [];
        
        this.initialized = false;
        this.emit('drained');
    }
}

// Export
module.exports = ConnectionPool;
