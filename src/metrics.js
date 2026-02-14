#!/usr/bin/env node

/**
 * SQLite-4.0 Metrics & Observability
 * Prometheus-compatible metrics collection
 */

const fs = require('fs');
const path = require('path');

class Metrics {
    constructor(options = {}) {
        this.prefix = options.prefix || 'sqlite4_';
        this.labels = options.labels || {};
        this.exportDir = options.exportDir || './metrics';
        
        this.counters = new Map();
        this.gauges = new Map();
        this.histograms = new Map();
        this.timers = new Map();
        
        // Create export directory
        if (this.exportDir && !fs.existsSync(this.exportDir)) {
            fs.mkdirSync(this.exportDir, { recursive: true });
        }
        
        // Start collecting
        this._startCollection();
    }
    
    // Counter - monotonically increasing
    counter(name, options = {}) {
        const key = this._key(name);
        const counter = {
            name: key,
            value: 0,
            help: options.help || '',
            labels: { ...this.labels, ...options.labels },
            type: 'counter'
        };
        
        this.counters.set(key, counter);
        return {
            inc: (value = 1) => {
                counter.value += value;
                this._emit('counter', key, counter.value, counter.labels);
            },
            reset: () => {
                counter.value = 0;
            },
            getValue: () => counter.value
        };
    }
    
    // Gauge - can increase or decrease
    gauge(name, options = {}) {
        const key = this._key(name);
        const gauge = {
            name: key,
            value: options.initialValue || 0,
            help: options.help || '',
            labels: { ...this.labels, ...options.labels },
            type: 'gauge'
        };
        
        this.gauges.set(key, gauge);
        return {
            set: (value) => {
                gauge.value = value;
                this._emit('gauge', key, gauge.value, gauge.labels);
            },
            inc: (value = 1) => {
                gauge.value += value;
                this._emit('gauge', key, gauge.value, gauge.labels);
            },
            dec: (value = 1) => {
                gauge.value -= value;
                this._emit('gauge', key, gauge.value, gauge.labels);
            },
            getValue: () => gauge.value
        };
    }
    
    // Histogram - buckets for timing/distributions
    histogram(name, options = {}) {
        const key = this._key(name);
        const buckets = options.buckets || [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10];
        
        const histogram = {
            name: key,
            count: 0,
            sum: 0,
            buckets: {},
            help: options.help || '',
            labels: { ...this.labels, ...options.labels },
            type: 'histogram',
            bucketValues: buckets.reduce((acc, b) => ({ ...acc, [b]: 0 }), {})
        };
        
        this.histograms.set(key, histogram);
        return {
            observe: (value) => {
                histogram.count++;
                histogram.sum += value;
                for (const bucket of buckets) {
                    if (value <= bucket) {
                        histogram.bucketValues[bucket]++;
                    }
                }
                this._emit('histogram', key, { count: histogram.count, sum: histogram.sum, buckets: histogram.bucketValues }, histogram.labels);
            },
            getValue: () => ({ ...histogram, buckets: { ...histogram.bucketValues } }),
            reset: () => {
                histogram.count = 0;
                histogram.sum = 0;
                for (const bucket of buckets) {
                    histogram.bucketValues[bucket] = 0;
                }
            }
        };
    }
    
    // Timer - convenience wrapper around histogram
    timer(name, options = {}) {
        const hist = this.histogram(name, options);
        
        return {
            start: () => {
                const start = process.hrtime.bigint();
                return {
                    done: (labels = {}) => {
                        const end = process.hrtime.bigint();
                        const seconds = Number(end - start) / 1e9;
                        hist.observe(seconds);
                        return seconds;
                    }
                };
            },
            observe: (seconds) => hist.observe(seconds)
        };
    }
    
    // Track a query
    trackQuery() {
        const timer = this.timer('query_duration_seconds', {
            help: 'Query execution time in seconds',
            labels: { query_type: 'unknown' }
        });
        
        const counter = this.counter('queries_total', {
            help: 'Total number of queries',
            labels: { query_type: 'unknown' }
        });
        
        return {
            start: (queryType = 'unknown') => {
                counter.inc({ query_type: queryType });
                const t = timer.start();
                return {
                    done: (labels = {}) => {
                        const seconds = t.done({ query_type: queryType });
                        return seconds;
                    }
                };
            }
        };
    }
    
    // Generate Prometheus format output
    toPrometheus() {
        let output = '';
        
        // Headers
        output += '# TYPE sqlite4_info gauge\n';
        output += `${this.prefix}info{version="4.0.0"} 1\n`;
        
        // Counters
        for (const [name, counter] of this.counters) {
            output += `# TYPE ${name} counter\n`;
            if (counter.help) output += `# HELP ${name} ${counter.help}\n`;
            const labelStr = this._labelsToString(counter.labels);
            output += `${name}${labelStr} ${counter.value}\n`;
        }
        
        // Gauges
        for (const [name, gauge] of this.gauges) {
            output += `# TYPE ${name} gauge\n`;
            if (gauge.help) output += `# HELP ${name} ${gauge.help}\n`;
            const labelStr = this._labelsToString(gauge.labels);
            output += `${name}${labelStr} ${gauge.value}\n`;
        }
        
        // Histograms
        for (const [name, hist] of this.histograms) {
            output += `# TYPE ${name} histogram\n`;
            if (hist.help) output += `# HELP ${name} ${hist.help}\n`;
            const labelStr = this._labelsToString(hist.labels);
            
            for (const [bucket, count] of Object.entries(hist.bucketValues)) {
                const le = parseFloat(bucket);
                output += `${name}_bucket${labelStr}{le="${le}"} ${count}\n`;
            }
            output += `${name}_bucket${labelStr}{le="+Inf"} ${hist.count}\n`;
            output += `${name}_sum${labelStr} ${hist.sum.toFixed(6)}\n`;
            output += `${name}_count${labelStr} ${hist.count}\n`;
        }
        
        return output;
    }
    
    // Export to file
    exportToFile(filename = 'metrics') {
        if (!this.exportDir) return;
        
        const filepath = path.join(this.exportDir, filename);
        fs.writeFileSync(filepath + '.prom', this.toPrometheus());
        
        // Also export JSON
        const json = {
            timestamp: new Date().toISOString(),
            counters: Object.fromEntries(this.counters),
            gauges: Object.fromEntries(this.gauges),
            histograms: Object.fromEntries(this.histograms)
        };
        fs.writeFileSync(filepath + '.json', JSON.stringify(json, null, 2));
    }
    
    // Reset all metrics
    reset() {
        for (const counter of this.counters.values()) counter.value = 0;
        for (const gauge of this.gauges.values()) gauge.value = 0;
        for (const hist of this.histograms.values()) {
            hist.count = 0;
            hist.sum = 0;
            for (const bucket of Object.values(hist.bucketValues)) {
                bucket = 0;
            }
        }
    }
    
    // Get all metrics as JSON
    toJSON() {
        return {
            timestamp: new Date().toISOString(),
            counters: Array.from(this.counters.entries()).map(([k, v]) => ({
                name: k,
                value: v.value,
                labels: v.labels
            })),
            gauges: Array.from(this.gauges.entries()).map(([k, v]) => ({
                name: k,
                value: v.value,
                labels: v.labels
            })),
            histograms: Array.from(this.histograms.entries()).map(([k, v]) => ({
                name: k,
                count: v.count,
                sum: v.sum,
                buckets: v.bucketValues,
                labels: v.labels
            }))
        };
    }
    
    // HTTP handler for Prometheus scraping
    httpHandler() {
        return (req, res) => {
            res.set('Content-Type', 'text/plain');
            res.send(this.toPrometheus());
        };
    }
    
    // Helper: create key with prefix
    _key(name) {
        return `${this.prefix}${name}`;
    }
    
    // Helper: labels to string
    _labelsToString(labels) {
        if (Object.keys(labels).length === 0) return '';
        const labelStr = Object.entries(labels)
            .map(([k, v]) => `${k}="${v}"`)
            .join(',');
        return `{${labelStr}}`;
    }
    
    // Emit event (for debugging)
    _emit(type, name, value, labels) {
        // Could emit to event emitter for debugging
        // this.emit('metric', { type, name, value, labels });
    }
    
    // Start background collection
    _startCollection() {
        // Could collect system metrics periodically
    }
}

// Export
module.exports = Metrics;
