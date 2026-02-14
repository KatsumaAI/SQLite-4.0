#!/usr/bin/env node

/**
 * SQLite-4.0 Cache Layer
 * LRU cache with TTL support
 */

class Cache {
    constructor(options = {}) {
        this.maxSize = options.maxSize || 1000;
        this.ttl = options.ttl || 60000; // 1 minute default
        this.interval = options.interval || 10000; // Cleanup every 10s
        
        this.cache = new Map();
        this.stats = {
            hits: 0,
            misses: 0,
            sets: 0,
            deletes: 0,
            evictions: 0
        };
        
        // Start cleanup interval
        if (this.ttl > 0) {
            this._startCleanup();
        }
    }
    
    // Get value from cache
    get(key) {
        const item = this.cache.get(key);
        
        if (!item) {
            this.stats.misses++;
            return undefined;
        }
        
        // Check TTL
        if (Date.now() > item.expires) {
            this.cache.delete(key);
            this.stats.deletes++;
            return undefined;
        }
        
        this.stats.hits++;
        return item.value;
    }
    
    // Get value or set if not exists
    async getOrSet(key, factory, ttl = null) {
        const existing = this.get(key);
        if (existing !== undefined) {
            return existing;
        }
        
        const value = await Promise.resolve(factory());
        this.set(key, value, ttl);
        return value;
    }
    
    // Set value in cache
    set(key, value, ttl = null) {
        // Check if we need to evict
        if (this.cache.size >= this.maxSize && !this.cache.has(key)) {
            this._evictOldest();
        }
        
        const expires = Date.now() + (ttl || this.ttl);
        this.cache.set(key, { value, expires });
        this.stats.sets++;
        
        return this;
    }
    
    // Delete from cache
    delete(key) {
        const result = this.cache.delete(key);
        if (result) {
            this.stats.deletes++;
        }
        return result;
    }
    
    // Check if key exists (without updating TTL)
    has(key) {
        const item = this.cache.get(key);
        if (!item) return false;
        
        if (Date.now() > item.expires) {
            this.cache.delete(key);
            return false;
        }
        
        return true;
    }
    
    // Get remaining TTL for key
    ttl(key) {
        const item = this.cache.get(key);
        if (!item) return -1;
        
        const remaining = item.expires - Date.now();
        return remaining > 0 ? remaining : -1;
    }
    
    // Clear all cache
    clear() {
        this.cache.clear();
        return this;
    }
    
    // Get oldest key (for LRU)
    _getOldest() {
        let oldest = null;
        let oldestTime = Infinity;
        
        for (const [key, item] of this.cache) {
            if (item.expires < oldestTime) {
                oldestTime = item.expires;
                oldest = key;
            }
        }
        
        return oldest;
    }
    
    // Evict oldest expired item
    _evictOldest() {
        const oldest = this._getOldest();
        if (oldest) {
            this.cache.delete(oldest);
            this.stats.evictions++;
        }
    }
    
    // Start cleanup interval
    _startCleanup() {
        this._cleanupInterval = setInterval(() => {
            this._cleanup();
        }, this.interval);
    }
    
    // Remove expired items
    _cleanup() {
        const now = Date.now();
        const toDelete = [];
        
        for (const [key, item] of this.cache) {
            if (item.expires < now) {
                toDelete.push(key);
            }
        }
        
        for (const key of toDelete) {
            this.cache.delete(key);
            this.stats.deletes++;
        }
    }
    
    // Get statistics
    getStats() {
        return {
            size: this.cache.size,
            maxSize: this.maxSize,
            ...this.stats,
            hitRate: this.stats.hits + this.stats.misses > 0 
                ? (this.stats.hits / (this.stats.hits + this.stats.misses) * 100).toFixed(2) + '%'
                : '0%'
        };
    }
    
    // Stop cleanup
    destroy() {
        if (this._cleanupInterval) {
            clearInterval(this._cleanupInterval);
        }
        this.cache.clear();
    }
}

// Export
module.exports = Cache;
