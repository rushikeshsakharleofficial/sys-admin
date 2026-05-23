# Deep UI QA Coverage Matrix

Use this matrix to prevent shallow testing.

| Area | Minimum coverage | Stronger coverage |
| --- | --- | --- |
| Routes | Home + discovered nav links | Source route tree + sitemap + auth routes |
| Layout | Header/sidebar/main/footer | Every scroll point and breakpoint |
| Forms | Empty + invalid + valid | Server error, slow network, double submit |
| Buttons | Hover + safe click | Keyboard activation + network assertions |
| Links | Visible + href valid | Back/forward and active route states |
| Tables | Load + sort + paginate | Filter, select rows, export, mobile overflow |
| Modals | Open + close | Focus trap, Escape, scroll lock, nested overlay |
| Floating UI | Visible + click | Mobile collision and scroll stability |
| Network | Failures + leaks | Payload size, duplicate calls, auth leakage |
| Storage | Cookies + local/session | IndexedDB, Cache API, logout clearing |
| Accessibility | Labels + keyboard | Focus order, ARIA, landmarks, contrast review |
| Responsive | Desktop + mobile | 5 viewport matrix + cross-browser smoke |
| Performance | No obvious infinite loading | DOM growth, layout shift, route timing |
| SEO | Title + favicon | Description, canonical, OG, noindex check |

## Pass rule

A page passes only when layout, interactions, network, storage, accessibility basics, and responsive behavior have been checked.

## Fail rule

A page fails if any Critical or High issue exists. Medium issues may allow conditional pass only if they do not block core user flows.

| Forms | Audit + empty submit | Fill + validation states + double-submit check |
| Overlays | Open + close + Escape | Focus trap, aria-modal, nested overlays |
| SEO | Title + robots | OG tags, canonical, favicon, h1, alt text |
| Security | Token-in-URL + DOM secrets | Security headers, iframe sandbox, mixed content |
| Web Vitals | TTFB + FCP | LCP, CLS, DOM growth across scroll |
| Console | Errors + page errors | React key warnings, hydration, CSP violations |
| Storage security | Sensitive value scan | Cookie flags (Secure, HttpOnly, SameSite) |
