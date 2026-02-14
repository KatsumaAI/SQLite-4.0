#!/usr/bin/env node

/**
 * SQLite-4.0 Auth0 Integration
 * Enterprise authentication with multiple providers
 */

const crypto = require('crypto');
const jwt = require('jsonwebtoken');

class Auth0Integration {
    constructor(db, options = {}) {
        this.db = db;
        this.options = {
            domain: options.domain || process.env.AUTH0_DOMAIN,
            clientId: options.clientId || process.env.AUTH0_CLIENT_ID,
            clientSecret: options.clientSecret || process.env.AUTH0_CLIENT_SECRET,
            audience: options.audience || process.env.AUTH0_AUDIENCE,
            redirectUri: options.redirectUri || process.env.AUTH0_REDIRECT_URI,
            issuers: options.issuers || {},
            tokenExpiry: options.tokenExpiry || '24h',
            refreshTokenExpiry: '7d'
        };
        
        // Supported OAuth providers
        this.providers = {
            discord: {
                authUrl: 'https://discord.com/oauth2/authorize',
                tokenUrl: 'https://discord.com/api/oauth2/token',
                userUrl: 'https://discord.com/api/users/@me',
                scope: 'identify email'
            },
            google: {
                authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
                tokenUrl: 'https://oauth2.googleapis.com/token',
                userUrl: 'https://www.googleapis.com/oauth2/v2/userinfo',
                scope: 'openid email profile'
            },
            github: {
                authUrl: 'https://github.com/login/oauth/authorize',
                tokenUrl: 'https://github.com/login/oauth/access_token',
                userUrl: 'https://api.github.com/user',
                scope: 'read:user user:email'
            },
            twitter: {
                authUrl: 'https://twitter.com/i/oauth2/authorize',
                tokenUrl: 'https://api.twitter.com/2/oauth2/token',
                userUrl: 'https://api.twitter.com/2/users/me',
                scope: 'tweet.read users.read'
            },
            microsoft: {
                authUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
                tokenUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
                userUrl: 'https://graph.microsoft.com/v1.0/me',
                scope: 'openid email profile User.Read'
            }
        };
        
        // Custom endpoints
        this.customEndpoints = options.customEndpoints || {};
        
        this._init();
    }
    
    _init() {
        // Create auth tables if not exist
        this.db.execute(`
            CREATE TABLE IF NOT EXISTS _auth_sessions (
                id TEXT PRIMARY KEY,
                user_id TEXT,
                provider TEXT,
                access_token TEXT,
                refresh_token TEXT,
                expires_at INTEGER,
                metadata TEXT,
                created_at INTEGER DEFAULT CURRENT_TIMESTAMP
            )
        `);
        
        this.db.execute(`
            CREATE TABLE IF NOT EXISTS _auth_users (
                id TEXT PRIMARY KEY,
                email TEXT UNIQUE,
                name TEXT,
                picture TEXT,
                provider TEXT,
                roles TEXT,
                mfa_enabled INTEGER DEFAULT 0,
                last_login INTEGER,
                metadata TEXT,
                created_at INTEGER DEFAULT CURRENT_TIMESTAMP
            )
        `);
    }
    
    // Generate OAuth authorization URL
    getAuthorizationUrl(provider, options = {}) {
        const config = this.providers[provider];
        if (!config) {
            throw new Error(`Unknown provider: ${provider}`);
        }
        
        const state = this._generateState(options.state);
        const codeVerifier = options.pkce ? this._generateCodeVerifier() : null;
        
        const params = new URLSearchParams({
            client_id: this.options.clientId,
            redirect_uri: this.options.redirectUri,
            response_type: options.pkce ? 'code' : 'code',
            scope: options.scope || config.scope,
            state,
            ...(options.pkce && { code_challenge: this._generateCodeChallenge(codeVerifier) }),
            ...(options.extraParams || {})
        });
        
        // Store code verifier for token exchange
        if (codeVerifier) {
            this._storeCodeVerifier(state, codeVerifier);
        }
        
        return {
            url: `${config.authUrl}?${params.toString()}`,
            state,
            codeVerifier
        };
    }
    
    // Exchange authorization code for tokens
    async exchangeCode(provider, code, codeVerifier = null) {
        const config = this.providers[provider];
        if (!config) {
            throw new Error(`Unknown provider: ${provider}`);
        }
        
        // Build token request
        const tokenParams = {
            client_id: this.options.clientId,
            client_secret: this.options.clientSecret,
            code,
            grant_type: 'authorization_code',
            redirect_uri: this.options.redirectUri,
            ...(codeVerifier && { code_verifier: codeVerifier })
        };
        
        // Exchange code for tokens
        const response = await fetch(config.tokenUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: new URLSearchParams(tokenParams)
        });
        
        if (!response.ok) {
            const error = await response.text();
            throw new Error(`Token exchange failed: ${error}`);
        }
        
        const tokens = await response.json();
        
        // Get user info
        const userInfo = await this._getUserInfo(provider, tokens.access_token);
        
        // Create or update user
        const userId = await this._upsertUser(userInfo, provider);
        
        // Store session
        const sessionId = this._createSession(userId, provider, tokens);
        
        return {
            sessionId,
            user: userInfo,
            tokens: {
                accessToken: tokens.access_token,
                refreshToken: tokens.refresh_token,
                expiresIn: tokens.expires_in,
                tokenType: tokens.token_type
            }
        };
    }
    
    // Refresh access token
    async refreshAccessToken(sessionId) {
        const session = this._getSession(sessionId);
        if (!session) {
            throw new Error('Invalid session');
        }
        
        const config = this.providers[session.provider];
        if (!config) {
            throw new Error(`Unknown provider: ${session.provider}`);
        }
        
        const response = await fetch(config.tokenUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: new URLSearchParams({
                client_id: this.options.clientId,
                client_secret: this.options.clientSecret,
                refresh_token: session.refresh_token,
                grant_type: 'refresh_token'
            })
        });
        
        if (!response.ok) {
            this._deleteSession(sessionId);
            throw new Error('Token refresh failed');
        }
        
        const tokens = await response.json();
        
        // Update session
        this._updateSession(sessionId, tokens);
        
        return tokens;
    }
    
    // Custom endpoint authentication
    async authenticateCustomEndpoint(endpoint, credentials) {
        const config = this.customEndpoints[endpoint];
        if (!config) {
            throw new Error(`Unknown custom endpoint: ${endpoint}`);
        }
        
        // Call custom authentication endpoint
        const response = await fetch(config.url, {
            method: config.method || 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...(config.headers || {})
            },
            body: JSON.stringify(credentials)
        });
        
        if (!response.ok) {
            throw new Error(`Custom auth failed: ${await response.text()}`);
        }
        
        const userInfo = await response.json();
        
        // Create or update user
        const userId = await this._upsertUser(userInfo, `custom:${endpoint}`);
        
        // Generate session
        const sessionId = this._generateSessionId();
        const expiresAt = Date.now() + (this.tokenExpiry * 1000);
        
        this.db.execute(
            `INSERT INTO _auth_sessions 
             (id, user_id, provider, access_token, expires_at, metadata) 
             VALUES (?, ?, ?, ?, ?, ?)`,
            [sessionId, userId, `custom:${endpoint}`, 
             userInfo.token || crypto.randomBytes(32).toString('hex'),
             expiresAt, JSON.stringify(userInfo.metadata || {})]
        );
        
        return { sessionId, user: userInfo };
    }
    
    // Verify Auth0 JWT token
    verifyToken(token) {
        try {
            const decoded = jwt.verify(token, this.options.clientSecret, {
                audience: this.options.audience,
                issuer: `https://${this.options.domain}/`
            });
            return { valid: true, payload: decoded };
        } catch (e) {
            return { valid: false, error: e.message };
        }
    }
    
    // Generate Auth0 custom login page tokens
    generateCustomToken(user, options = {}) {
        return jwt.sign({
            sub: user.id,
            aud: this.options.audience,
            iss: `https://${this.options.domain}/`,
            iat: Math.floor(Date.now() / 1000),
            exp: Math.floor(Date.now() / 1000) + (options.expiresIn || 3600),
            ...(options.claims || {})
        }, this.options.clientSecret);
    }
    
    // Get user info from provider
    async _getUserInfo(provider, accessToken) {
        const config = this.providers[provider];
        
        const response = await fetch(config.userUrl, {
            headers: {
                'Authorization': `Bearer ${accessToken}`
            }
        });
        
        if (!response.ok) {
            throw new Error(`Failed to get user info: ${await response.text()}`);
        }
        
        const data = await response.json();
        
        // Normalize user info
        return {
            id: data.id || data.sub,
            email: data.email,
            name: data.name || data.username,
            picture: data.picture || data.avatar_url,
            provider,
            raw: data
        };
    }
    
    // Upsert user
    async _upsertUser(userInfo, provider) {
        const existing = this.db.execute(
            `SELECT id FROM _auth_users WHERE provider = ? AND id = ?`,
            [provider, userInfo.id]
        );
        
        if (existing.rows.length > 0) {
            this.db.execute(
                `UPDATE _auth_users SET 
                 email = ?, name = ?, picture = ?, 
                 last_login = ?, metadata = ? 
                 WHERE id = ? AND provider = ?`,
                [userInfo.email, userInfo.name, userInfo.picture,
                 Date.now(), JSON.stringify(userInfo.raw),
                 userInfo.id, provider]
            );
            return userInfo.id;
        }
        
        this.db.execute(
            `INSERT INTO _auth_users 
             (id, email, name, picture, provider, roles) 
             VALUES (?, ?, ?, ?, ?, ?)`,
            [userInfo.id, userInfo.email, userInfo.name, userInfo.picture,
             provider, JSON.stringify(['user'])]
        );
        
        return userInfo.id;
    }
    
    // Session management
    _createSession(userId, provider, tokens) {
        const sessionId = this._generateSessionId();
        const expiresAt = Date.now() + (tokens.expires_in * 1000);
        
        this.db.execute(
            `INSERT INTO _auth_sessions 
             (id, user_id, provider, access_token, refresh_token, expires_at) 
             VALUES (?, ?, ?, ?, ?, ?)`,
            [sessionId, userId, provider, tokens.access_token, 
             tokens.refresh_token, expiresAt]
        );
        
        return sessionId;
    }
    
    _getSession(sessionId) {
        const result = this.db.execute(
            `SELECT * FROM _auth_sessions WHERE id = ? AND expires_at > ?`,
            [sessionId, Date.now()]
        );
        return result.rows[0] || null;
    }
    
    _updateSession(sessionId, tokens) {
        this.db.execute(
            `UPDATE _auth_sessions SET 
             access_token = ?, expires_at = ? 
             WHERE id = ?`,
            [tokens.access_token, Date.now() + (tokens.expires_in * 1000), sessionId]
        );
    }
    
    _deleteSession(sessionId) {
        this.db.execute(`DELETE FROM _auth_sessions WHERE id = ?`, [sessionId]);
    }
    
    // Utility methods
    _generateSessionId() {
        return crypto.randomBytes(32).toString('hex');
    }
    
    _generateState(existingState) {
        return existingState || crypto.randomBytes(16).toString('hex');
    }
    
    _generateCodeVerifier() {
        return crypto.randomBytes(32).toString('base64url');
    }
    
    _generateCodeChallenge(verifier) {
        return crypto.createHash('sha256')
            .update(verifier)
            .digest('base64url');
    }
    
    _storeCodeVerifier(state, verifier) {
        // In production, use Redis or similar
        this._codeVerifiers = this._codeVerifiers || {};
        this._codeVerifiers[state] = verifier;
        setTimeout(() => delete this._codeVerifiers[state], 600000); // 10 min
    }
    
    // Get user roles
    getUserRoles(userId) {
        const result = this.db.execute(
            `SELECT roles FROM _auth_users WHERE id = ?`,
            [userId]
        );
        return result.rows[0] ? JSON.parse(result.rows[0].roles) : [];
    }
    
    // Set user roles
    setUserRoles(userId, roles) {
        this.db.execute(
            `UPDATE _auth_users SET roles = ? WHERE id = ?`,
            [JSON.stringify(roles), userId]
        );
    }
}

module.exports = Auth0Integration;
