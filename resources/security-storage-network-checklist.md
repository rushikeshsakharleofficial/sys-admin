# Security, Storage, and Network Checklist

## Network

- No unexpected 4xx or 5xx.
- No CORS failures.
- No duplicate requests on initial render.
- No duplicate requests on hover/click unless expected.
- No token in URL query string.
- No private data in unauthenticated response.
- No internal stack trace.
- No database error.
- No debug fields in production.
- No cross-user data.

## Sensitive pattern scan

Scan URLs, headers, request bodies, and response bodies for:

```text
password
passwd
secret
api_key
apikey
access_token
refresh_token
id_token
authorization
bearer
private_key
client_secret
session
cookie
jwt
database
stack
trace
exception
sql
mongodb
firebase
supabase
aws_secret
stripe_secret
ghp_
sk-
AKIA
AIza
xoxb-
```

## Cookies

- Auth cookies use HttpOnly where required.
- Secure is set on HTTPS.
- SameSite is set appropriately.
- Logout clears auth cookies.
- No raw PII is stored in cookies.

## localStorage/sessionStorage

- No passwords.
- No refresh tokens.
- Access token storage is documented if present.
- Logout clears sensitive keys.
- User switch does not leave old user data.

## IndexedDB and Cache API

- Protected data is not cached after logout.
- Offline cache does not expose private pages.
- Cache entries are not unexpectedly huge.
- Old user data does not remain after login switch.

## Service worker

- Does not serve stale protected content.
- Update behavior is sane.
- Offline fallback does not leak auth content.
