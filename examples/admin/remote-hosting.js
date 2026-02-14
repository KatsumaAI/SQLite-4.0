#!/usr/bin/env node

/**
 * SQLite-4.0 Example: Remote Hosting with ngrok
 * 
 * This example demonstrates:
 * - Setting up a TCP server
 * - Exposing via ngrok
 * - Connecting from a remote client
 */

const SQLite4 = require('../src/sqlite4.js');

async function main() {
    console.log('SQLite-4.0 Remote Hosting Example\n');
    console.log('='.repeat(50));
    
    // ========================================
    // SERVER SIDE
    // ========================================
    
    console.log('\n--- SERVER SIDE ---\n');
    
    // Create and configure server
    console.log('1. Creating database server...');
    
    const server = new SQLite4.Server({
        port: 4444,
        host: '0.0.0.0',  // Listen on all interfaces
        tls: false,         // Set to true in production with certificates
        auth: true,         // Require authentication
        rateLimit: {
            windowMs: 60000,   // 1 minute window
            max: 100           // Max 100 requests per window
        },
        ipAllowlist: []      // Empty = allow all IPs, or specify ['192.168.1.0/24']
    });
    
    console.log('   Server configured on port 4444');
    
    // Configure TLS for production (optional but recommended)
    const tlsConfig = {
        key: fs.readFileSync('./certs/server.key'),
        cert: fs.readFileSync('./certs/server.crt'),
        ca: fs.readFileSync('./certs/ca.crt'),
        requestCert: true,
        rejectUnauthorized: false
    };
    
    console.log('   TLS configuration available for production use');
    
    // Start server
    console.log('\n2. Starting server...');
    
    server.start(() => {
        console.log('   Server listening on 0.0.0.0:4444');
        
        // Configure ngrok (run separately)
        console.log('\n3. ngrok setup (run in separate terminal):');
        console.log('   $ ngrok tcp 4444');
        console.log('');
        console.log('   This will give you a public URL like:');
        console.log('   tcp://0.tcp.ngrok.io:12345 -> localhost:4444');
        console.log('');
        console.log('   Or HTTP tunnel:');
        console.log('   $ ngrok http 8443');
    });
    
    // ========================================
    // CLIENT SIDE (connecting remotely)
    // ========================================
    
    console.log('\n--- CLIENT SIDE ---\n');
    
    // When connecting from a remote machine or after ngrok is running:
    
    const ngrokUrl = '0.tcp.ngrok.io:12345';  // Replace with your ngrok URL
    const [host, port] = ngrokUrl.split(':');
    
    console.log('4. Connecting to remote database...');
    console.log(`   Connecting to: ${ngrokUrl}`);
    
    // Create client connection
    const db = new SQLite4({
        host: host,
        port: parseInt(port),
        username: 'admin',
        password: 'secure-password',
        tls: false  // Set to true if using HTTPS tunnel
    });
    
    console.log('   Connected successfully!');
    
    // Execute queries (same API as local database)
    console.log('\n5. Executing queries...');
    
    // Create table
    db.execute(`
        CREATE TABLE IF NOT EXISTS remote_users (
            id INTEGER PRIMARY KEY,
            name TEXT,
            email TEXT UNIQUE,
            connected_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);
    
    // Insert data
    db.execute(
        `INSERT INTO remote_users (name, email) VALUES (?, ?)`,
        ['Remote User', 'remote@example.com']
    );
    
    // Query data
    const users = db.all('SELECT * FROM remote_users');
    console.log(`   Found ${users.length} users in remote database`);
    
    // Close connection
    console.log('\n6. Closing connection...');
    db.close();
    console.log('   Connection closed');
    
    // ========================================
    // DOCKER + NGINX (Production Setup)
    // ========================================
    
    console.log('\n--- PRODUCTION SETUP WITH NGINX ---\n');
    
    console.log('For production, use nginx as reverse proxy:');
    console.log('');
    console.log('nginx.conf example:');
    console.log('```');
    console.log('server {');
    console.log('    listen 443 ssl;');
    console.log('    server_name db.yourdomain.com;');
    console.log('');
    console.log('    ssl_certificate /etc/nginx/ssl/cert.pem;');
    console.log('    ssl_certificate_key /etc/nginx/ssl/key.pem;');
    console.log('');
    console.log('    location / {');
    console.log('        proxy_pass https://localhost:4444;');
    console.log('        proxy_http_version 1.1;');
    console.log('        proxy_set_header Upgrade $http_upgrade;');
    console.log('        proxy_set_header Connection "upgrade";');
    console.log('        proxy_set_header Host $host;');
    console.log('        proxy_set_header X-Real-IP $remote_addr;');
    console.log('    }');
    console.log('}');
    console.log('```');
    
    // Summary
    console.log('\n' + '='.repeat(50));
    console.log('\nRemote Hosting Options:');
    console.log('');
    console.log('1. ngrok TCP tunnel:');
    console.log('   - Quick setup');
    console.log('   - Public URL in seconds');
    console.log('   - Good for development/testing');
    console.log('');
    console.log('2. nginx reverse proxy:');
    console.log('   - Production-ready');
    console.log('   - Custom domain support');
    console.log('   - SSL/TLS termination');
    console.log('   - Load balancing');
    console.log('');
    console.log('3. Docker deployment:');
    console.log('   - Containerized');
    console.log('   - Scalable');
    console.log('   - Kubernetes-ready');
    
    console.log('\nExample completed!');
}

main().catch(console.error);
