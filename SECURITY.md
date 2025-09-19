# Security Documentation

## Current Security Issues and Solutions

### 1. NPM Audit Vulnerabilities (HIGH PRIORITY)

**Issue:** The `bignum` dependency used by `stratum-pool` has high severity vulnerabilities.

```
bignum  *
Severity: high
Uncaught Exception in bignum - https://github.com/advisories/GHSA-6429-3g3w-6mw5
```

**Immediate Solutions:**

#### Option A: Install Build Tools (Recommended)
```bash
# Install Python and Visual Studio Build Tools
npm install --global windows-build-tools
# Then retry the audit fix
npm audit fix
```

#### Option B: Use Alternative Dependencies
Consider replacing the stratum-pool dependency with a newer, maintained alternative:
- Look for forks that have updated dependencies
- Consider migration to newer mining pool frameworks

#### Option C: Docker Deployment (Workaround)
Deploy using Docker with pre-built dependencies:
```dockerfile
FROM node:16-alpine
# Install build dependencies
RUN apk add --no-cache python3 make g++
# Copy and install dependencies
COPY package.json ./
RUN npm install
```

### 2. Python Build Requirements

**Issue:** Native modules require Python and build tools for compilation.

**Solution:**
1. Install Python 3.8+ from python.org
2. Install Visual Studio Build Tools or Visual Studio with C++ development tools
3. Set environment variables:
```bash
npm config set python "C:\Python311\python.exe"
npm config set msvs_version 2019
```

### 3. Security Improvements Implemented

#### Enhanced Input Validation
- Worker names are now sanitized to prevent injection attacks
- Address validation improved with comprehensive regex patterns
- API endpoints now include input sanitization

#### Rate Limiting
- API endpoints now have rate limiting (60 requests per minute per IP)
- Prevents DDoS and brute force attacks

#### Improved Error Handling
- Better error handling for Redis operations
- Authorization errors are properly caught and logged
- Sensitive data (passwords) are redacted in logs

### 4. Additional Security Recommendations

#### Network Security
```json
// In config.json, consider adding:
{
  "website": {
    "enabled": true,
    "host": "0.0.0.0",  // Change to specific IP in production
    "port": 50301,
    "tlsOptions": {
      "enabled": true,  // Enable HTTPS
      "key": "path/to/private.key",
      "cert": "path/to/certificate.crt"
    }
  }
}
```

#### Firewall Configuration
- Only expose necessary ports (mining stratum ports, web interface)
- Block direct access to Redis (port 6379) from external networks
- Use fail2ban for additional protection

#### Redis Security
```bash
# In redis.conf:
# 1. Set a strong password
requirepass your_strong_password_here

# 2. Bind to specific interface
bind 127.0.0.1

# 3. Disable dangerous commands
rename-command FLUSHDB ""
rename-command FLUSHALL ""
rename-command DEBUG ""
```

#### Regular Monitoring
- Monitor logs for unusual authentication attempts
- Set up alerts for high error rates
- Regularly check for new vulnerabilities: `npm audit`

### 5. Emergency Response

If you suspect a security breach:
1. Immediately block suspicious IPs in your firewall
2. Check Redis for unauthorized data access
3. Review authentication logs
4. Update all passwords and API keys
5. Consider temporary shutdown until issue is resolved

### 6. Update Schedule

- **Weekly:** Check `npm audit` for new vulnerabilities
- **Monthly:** Review access logs and update dependencies where possible  
- **Quarterly:** Full security assessment and penetration testing

---

**Note:** The current implementation is significantly more secure than the original version, but the dependency vulnerabilities should still be addressed as soon as build environment issues are resolved.