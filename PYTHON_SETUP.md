# Python Installation Guide for npm Dependencies

## Problem
Your npm dependencies (specifically `bignum` used by `stratum-pool`) require Python and C++ build tools to compile native modules, but Python is not properly configured on your system.

## Quick Solutions

### Option 1: Install Python from Microsoft Store (Easiest)
1. Open Microsoft Store
2. Search for "Python 3.11" or "Python 3.12"
3. Click "Install"
4. After installation, restart your PowerShell/terminal
5. Try: `npm audit fix` again

### Option 2: Install Python from python.org
1. Go to https://www.python.org/downloads/
2. Download Python 3.11 or 3.12 (NOT 3.13, some node-gyp versions have issues)
3. **IMPORTANT**: Check "Add Python to PATH" during installation
4. After installation, verify: `python --version`
5. Try: `npm audit fix` again

### Option 3: Use Pre-compiled Dependencies (Recommended)
Since the vulnerabilities are in old dependencies, let's use a workaround:

```bash
# Remove existing problematic packages
npm uninstall stratum-pool

# Install newer alternatives or use --legacy-peer-deps
npm install stratum-pool --legacy-peer-deps --no-optional

# Or skip the audit fix and run the pool with current dependencies
# (The pool will work fine, just with the security warnings)
```

### Option 4: Docker Solution (Most Reliable)
Create a Dockerfile:

```dockerfile
FROM node:16-alpine

# Install build dependencies
RUN apk add --no-cache python3 make g++ git

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies with build tools available
RUN npm install

# Copy rest of application
COPY . .

EXPOSE 50301
EXPOSE 3333

CMD ["npm", "start"]
```

Build and run:
```bash
docker build -t sha256-nomp .
docker run -p 50301:50301 -p 3333:3333 sha256-nomp
```

## Current Status Check

Let's check what Python installations node-gyp found:
- It detected Python installations in multiple locations but couldn't execute them
- This is likely due to PATH issues or corrupted installations

## Manual Python Setup

If automatic installation fails, try this manual setup:

```bash
# Set Python path manually (adjust path as needed)
npm config set python "C:\Python311\python.exe"

# Set Visual Studio version
npm config set msvs_version 2019

# Clear npm cache
npm cache clean --force

# Try audit fix again
npm audit fix
```

## Alternative: Skip Vulnerability Fix

The mining pool will work with current dependencies. The vulnerabilities are in mathematical library functions that are not typically exploitable in mining pool context.

To proceed without fixing:
1. Accept the security warnings for now
2. Run: `npm start` to test the pool
3. Plan to migrate to newer mining pool frameworks in the future

## Verification Commands

After any Python installation:
```bash
python --version          # Should show Python 3.x.x
npm config get python     # Should show Python path
node-gyp list             # Should list available configurations
```