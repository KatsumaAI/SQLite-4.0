#!/usr/bin/env node

/**
 * SQLite-4.0 NPM Publishing Script
 * 
 * This script helps prepare and publish SQLite-4.0 to npmjs.com
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const colors = {
    reset: '\x1b[0m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    red: '\x1b[31m',
    blue: '\x1b[34m'
};

function log(msg, color = colors.reset) {
    console.log(`${color}${msg}${colors.reset}`);
}

function run(cmd) {
    log(`Running: ${cmd}`, colors.blue);
    execSync(cmd, { stdio: 'inherit' });
}

async function main() {
    log('\nSQLite-4.0 NPM Publishing Helper\n', colors.green);
    log('='.repeat(50), colors.blue);
    
    // Check Node version
    log('\n1. Checking Node.js version...', colors.yellow);
    const nodeVersion = process.version;
    log(`   Node.js: ${nodeVersion}`);
    
    // Check npm version
    log('\n2. Checking npm version...', colors.yellow);
    try {
        const npmVersion = execSync('npm --version').toString().trim();
        log(`   npm: ${npmVersion}`);
    } catch (e) {
        log('   npm not found. Please install npm.', colors.red);
        process.exit(1);
    }
    
    // Check if logged in to npm
    log('\n3. Checking npm authentication...', colors.yellow);
    try {
        execSync('npm whoami', { stdio: 'pipe' });
        const user = execSync('npm whoami').toString().trim();
        log(`   Logged in as: ${user}`, colors.green);
    } catch (e) {
        log('   Not logged in to npm!', colors.red);
        log('\n   To login, run:', colors.yellow);
        log('   npm login', colors.blue);
        process.exit(1);
    }
    
    // Update version
    log('\n4. Current package version:', colors.yellow);
    const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
    log(`   ${pkg.version}`, colors.green);
    
    // Ask for version bump
    log('\n5. Version bump:', colors.yellow);
    log('   Current:', colors.yellow, false);
    log(` ${pkg.version}`, colors.green, false);
    log('\n   Options: patch | minor | major | custom', colors.blue);
    
    // Check for changes
    log('\n6. Checking for uncommitted changes...', colors.yellow);
    try {
        const status = execSync('git status --porcelain').toString().trim();
        if (status) {
            log('   Uncommitted changes found:', colors.red);
            log(status, colors.blue);
            log('\n   Consider committing first:', colors.yellow);
            log('   git add . && git commit -m "Release v' + pkg.version + '"', colors.blue);
        } else {
            log('   No uncommitted changes', colors.green);
        }
    } catch (e) {
        log('   Unable to check git status', colors.red);
    }
    
    // Run tests
    log('\n7. Running tests...', colors.yellow);
    try {
        run('npm test');
        log('   All tests passed!', colors.green);
    } catch (e) {
        log('   Tests failed!', colors.red);
        log('   Please fix tests before publishing.', colors.yellow);
        process.exit(1);
    }
    
    // Build (if needed)
    log('\n8. Building...', colors.yellow);
    try {
        run('npm run docs 2>/dev/null || true');
        log('   Build complete', colors.green);
    } catch (e) {
        log('   Build step completed', colors.yellow);
    }
    
    // Dry run publish
    log('\n9. Dry run publish...', colors.yellow);
    try {
        run('npm publish --dry-run');
        log('\n   Dry run successful!', colors.green);
    } catch (e) {
        log('   Dry run failed:', colors.red);
        console.error(e.message);
        process.exit(1);
    }
    
    // Summary
    log('\n' + '='.repeat(50), colors.blue);
    log('\nPublishing Steps:', colors.green);
    log('1. npm login', colors.blue);
    log('2. npm test', colors.blue);
    log('3. npm version patch|minor|major', colors.blue);
    log('4. npm publish', colors.blue);
    log('5. git push --tags', colors.blue);
    
    log('\nTo publish now, run:', colors.yellow);
    log(`   npm version patch`, colors.blue);
    log('   npm publish', colors.blue);
    log('   git push --tags && git push origin main', colors.blue);
    
    log('\nGood luck! 🍀', colors.green);
}

main().catch(console.error);
