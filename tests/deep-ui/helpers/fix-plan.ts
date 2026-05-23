import fs from 'fs';
import path from 'path';
import { normalizeRoute } from './routes';

// ─── Types ────────────────────────────────────────────────────────────────────

type Severity = 'critical' | 'high' | 'medium' | 'low' | 'info';
type Effort = 'XS' | 'S' | 'M' | 'L';

interface FixMeta {
  fix: string;
  effort: Effort;
  wcag?: string;
}

interface NormalizedFinding {
  route: string;
  source: string;
  severity: Severity;
  type: string;
  message: string;
  selector?: string;
  text?: string;
  evidencePath: string;
}

// ─── Fix recommendation map ───────────────────────────────────────────────────
// Maps issue `type` (as emitted by helpers) → { fix, effort, wcag? }

const FIX_RECOMMENDATIONS: Record<string, FixMeta> = {
  // Accessibility
  'missing-accessible-name': {
    fix: 'Add aria-label or visible text to element',
    effort: 'XS',
    wcag: 'WCAG 4.1.2',
  },
  'input-missing-label': {
    fix: 'Add <label for="..."> or aria-label to input field',
    effort: 'XS',
    wcag: 'WCAG 1.3.1',
  },
  'role-button-not-focusable': {
    fix: 'Add tabindex="0" to element with role="button"',
    effort: 'XS',
    wcag: 'WCAG 2.1.1',
  },
  'clickable-without-role': {
    fix: 'Replace div/span with <button> or add role="button" + tabindex="0" + keyboard handler',
    effort: 'S',
    wcag: 'WCAG 4.1.2',
  },
  'duplicate-id': {
    fix: 'Ensure all id attributes are unique within the document',
    effort: 'S',
    wcag: 'WCAG 4.1.1',
  },
  'heading-level-skip': {
    fix: 'Fix heading hierarchy — do not skip levels (e.g. h1 → h3); use h2 between them',
    effort: 'XS',
    wcag: 'WCAG 1.3.1',
  },
  'missing-main-landmark': {
    fix: 'Wrap main page content in <main> element',
    effort: 'XS',
    wcag: 'WCAG 1.3.6',
  },
  'missing-nav-landmark': {
    fix: 'Wrap navigation links in <nav> element',
    effort: 'XS',
    wcag: 'WCAG 1.3.6',
  },
  'missing-header-landmark': {
    fix: 'Wrap site header in <header> element',
    effort: 'XS',
    wcag: 'WCAG 1.3.6',
  },
  'missing-html-lang': {
    fix: 'Add lang attribute to <html> element (e.g. lang="en")',
    effort: 'XS',
    wcag: 'WCAG 3.1.1',
  },
  'poor-color-contrast': {
    fix: 'Increase text/background contrast to meet WCAG AA (4.5:1 normal, 3:1 large text)',
    effort: 'S',
    wcag: 'WCAG 1.4.3',
  },
  'poor-color-contrast-summary': {
    fix: 'Audit and fix all color contrast failures — run full Lighthouse a11y audit',
    effort: 'M',
    wcag: 'WCAG 1.4.3',
  },
  'aria-expanded-no-controls': {
    fix: 'Add aria-controls="<id-of-controlled-element>" to element with aria-expanded',
    effort: 'XS',
    wcag: 'WCAG 4.1.2',
  },
  // Layout
  'horizontal-overflow': {
    fix: 'Remove fixed pixel widths wider than viewport; use max-width: 100% on offending element',
    effort: 'S',
  },
  'negative-left-overflow': {
    fix: 'Check negative margins or absolute positioning pushing element off-screen to the left',
    effort: 'S',
  },
  'fixed-overlay-too-large': {
    fix: 'Reduce fixed/absolute overlay size or add max-height + overflow-y: auto',
    effort: 'S',
  },
  'text-or-content-clipping': {
    fix: 'Add overflow-x: auto to container or increase its min-width',
    effort: 'XS',
  },
  'page-horizontal-scroll': {
    fix: 'Add overflow-x: hidden to body/html; find element wider than viewport',
    effort: 'S',
  },
  // Zoom + scroll
  'scroll-stuck': {
    fix: 'Remove overflow: hidden from html and body elements; check for passive wheel listener overrides',
    effort: 'M',
    wcag: 'WCAG 2.1.1',
  },
  'horizontal-scroll-at-zoom': {
    fix: 'Use clamp(), max-width: 100%, or relative units so content reflows at 320 px (400% zoom)',
    effort: 'M',
    wcag: 'WCAG 1.4.10',
  },
  // Theme comparison
  'element-invisible-in-dark': {
    fix: 'Add dark-mode variant for text color (e.g. Tailwind dark:text-white or CSS prefers-color-scheme override)',
    effort: 'S',
    wcag: 'WCAG 1.4.3',
  },
  'element-invisible-in-dark-summary': {
    fix: 'Systematically audit and fix all hardcoded colors without dark-mode variants',
    effort: 'L',
    wcag: 'WCAG 1.4.3',
  },
  'element-invisible-in-light': {
    fix: 'Add light-mode variant for text color; avoid dark-only color values leaking into light theme',
    effort: 'S',
    wcag: 'WCAG 1.4.3',
  },
  'dark-mode-not-responsive': {
    fix: 'Implement CSS prefers-color-scheme media query support, or ensure localStorage theme initialises before first paint',
    effort: 'L',
  },
  'dark-mode-layout-overflow': {
    fix: 'Check dark-mode specific CSS for wider backgrounds, longer translated labels, or different padding causing overflow',
    effort: 'S',
  },
  'toggle-no-visual-change': {
    fix: 'Verify theme toggle handler applies class/attribute to <html> or <body> and CSS responds to it',
    effort: 'M',
  },
  // Security
  'missing-csp': {
    fix: 'Add Content-Security-Policy header. Start with report-only mode; tighten gradually',
    effort: 'L',
  },
  'missing-x-frame-options': {
    fix: 'Add X-Frame-Options: SAMEORIGIN header to prevent clickjacking',
    effort: 'XS',
  },
  'missing-x-content-type-options': {
    fix: 'Add X-Content-Type-Options: nosniff header',
    effort: 'XS',
  },
  'missing-referrer-policy': {
    fix: 'Add Referrer-Policy: strict-origin-when-cross-origin header',
    effort: 'XS',
  },
  'missing-permissions-policy': {
    fix: 'Add Permissions-Policy header restricting camera, microphone, geolocation',
    effort: 'XS',
  },
  'unsafe-blank-target': {
    fix: 'Add rel="noopener noreferrer" to all a[target="_blank"] links',
    effort: 'XS',
  },
  'sandbox-missing-on-iframe': {
    fix: 'Add sandbox attribute to <iframe> elements; grant only needed permissions',
    effort: 'S',
  },
  'token-in-url': {
    fix: 'Move token from query string to Authorization header or POST body',
    effort: 'M',
  },
  'mixed-content': {
    fix: 'Change all http:// resource URLs to https:// or use protocol-relative //URL',
    effort: 'S',
  },
  'secret-in-html-comment': {
    fix: 'Remove secret from HTML comment; rotate the exposed key immediately',
    effort: 'XS',
  },
  // Forms
  'form-missing-submit': {
    fix: 'Add a <button type="submit"> to the form',
    effort: 'XS',
  },
  'form-action-placeholder': {
    fix: 'Replace action="#" with a real endpoint or form submission handler',
    effort: 'M',
  },
  'password-no-autocomplete': {
    fix: 'Add autocomplete="current-password" or autocomplete="new-password" to password field',
    effort: 'XS',
  },
  'submit-disabled-on-load': {
    fix: 'Only disable submit during active submission; remove disabled state on initial render unless form is intentionally gated',
    effort: 'S',
  },
  // SEO
  'missing-title': {
    fix: 'Add a unique, descriptive <title> element (10–80 characters)',
    effort: 'XS',
  },
  'missing-meta-description': {
    fix: 'Add <meta name="description" content="..."> (50–165 characters)',
    effort: 'XS',
  },
  'missing-canonical': {
    fix: 'Add <link rel="canonical" href="..."> to prevent duplicate-content issues',
    effort: 'XS',
  },
  'missing-og-tags': {
    fix: 'Add Open Graph meta tags: og:title, og:description, og:image',
    effort: 'S',
  },
  'robots-noindex': {
    fix: 'Remove noindex from robots meta on public pages unless intentionally hidden from search',
    effort: 'XS',
  },
  'missing-h1': {
    fix: 'Add a single <h1> as the primary page heading',
    effort: 'XS',
  },
  'missing-favicon': {
    fix: 'Add <link rel="icon" href="/favicon.ico"> and provide favicon file',
    effort: 'XS',
  },
  // Network
  'duplicate-api-calls': {
    fix: 'Deduplicate API calls — check for double useEffect, extra renders, or missing React StrictMode guard',
    effort: 'M',
  },
  'large-payload': {
    fix: 'Enable gzip/brotli compression; paginate large lists; trim unused response fields',
    effort: 'M',
  },
  // Broken images
  'broken-src': { fix: 'Fix broken image URL; verify file exists at path or CDN', effort: 'S' },
  'empty-src': { fix: 'Remove img with empty src or set a valid placeholder URL', effort: 'XS' },
  'missing-alt': { fix: 'Add descriptive alt text; use alt="" for decorative images', effort: 'XS', wcag: 'WCAG 1.1.1' },
  'broken-background-image': { fix: 'Fix CSS background-image URL; verify asset path', effort: 'S' },
  'picture-no-fallback': { fix: 'Add <img> fallback inside <picture> element', effort: 'XS' },
  // Lazy images
  'lazy-image-not-loaded': { fix: 'Fix lazy-load trigger — check IntersectionObserver threshold, data-src swap logic', effort: 'M' },
  'images-below-fold-not-lazy': { fix: 'Add loading="lazy" to images below the fold to improve LCP', effort: 'XS' },
  // Reduced motion (WCAG 2.3.3)
  'reduced-motion-not-respected': { fix: 'Add @media (prefers-reduced-motion: reduce) CSS rule to disable/reduce animations', effort: 'S', wcag: 'WCAG 2.3.3' },
  'animation-still-running': { fix: 'Set animation-play-state: paused or animation: none inside prefers-reduced-motion media query', effort: 'S', wcag: 'WCAG 2.3.3' },
  // Responsive behavior
  'mobile-nav-missing': { fix: 'Add hamburger menu / mobile drawer for nav at ≤768px breakpoint', effort: 'L' },
  'tablet-nav-missing': { fix: 'Add collapsed navigation for tablet breakpoint (768px)', effort: 'M' },
  'horizontal-overflow-at-1440': { fix: 'Find element wider than 1440px viewport; add max-width: 100%', effort: 'S' },
  'horizontal-overflow-at-768': { fix: 'Fix layout overflow at 768px; use flex-wrap or responsive grid', effort: 'S' },
  'horizontal-overflow-at-390': { fix: 'Fix layout overflow on mobile (390px); check fixed-width containers', effort: 'M' },
  'text-too-small-at-768': { fix: 'Increase font-size to ≥12px at tablet breakpoint', effort: 'XS' },
  'text-too-small-at-390': { fix: 'Increase font-size to ≥12px on mobile', effort: 'XS' },
  'floating-ui-covers-cta': { fix: 'Adjust z-index or position of fixed element so it does not cover submit/CTA button', effort: 'S' },
  'table-clipped-on-mobile': { fix: 'Wrap table in overflow-x: auto container for mobile scroll', effort: 'XS' },
  'image-overflow-at-390': { fix: 'Add max-width: 100% to img elements; remove fixed pixel width', effort: 'XS' },
  // Toasts
  'toast-stack-overflow': { fix: 'Limit toast queue to max 3-5 items; dismiss oldest on new arrival', effort: 'S' },
  'toast-poor-contrast': { fix: 'Increase toast text/background contrast to 4.5:1', effort: 'S', wcag: 'WCAG 1.4.3' },
  'toast-covers-content': { fix: 'Move toast to bottom/top edge of screen (outside 20%-80% viewport height band)', effort: 'S' },
  'toast-missing-role': { fix: 'Add role="status" (non-urgent) or role="alert" (urgent) to toast element', effort: 'XS', wcag: 'WCAG 4.1.3' },
  'toast-not-dismissible': { fix: 'Add dismiss button with aria-label="Close" inside long-lived toasts', effort: 'XS' },
  'toast-no-aria-live': { fix: 'Add aria-live="polite" region in document for toast announcements', effort: 'XS', wcag: 'WCAG 4.1.3' },
  // Tables
  'table-missing-label': { fix: 'Add <caption> or aria-label to table element', effort: 'XS', wcag: 'WCAG 1.3.1' },
  'table-missing-headers': { fix: 'Add <th> elements as column/row headers', effort: 'S', wcag: 'WCAG 1.3.1' },
  'table-th-missing-scope': { fix: 'Add scope="col" or scope="row" to all <th> elements', effort: 'XS', wcag: 'WCAG 1.3.1' },
  'table-horizontal-overflow': { fix: 'Wrap table in overflow-x: auto container', effort: 'XS' },
  'table-cell-nowrap': { fix: 'Remove white-space: nowrap from table cells; allow text to wrap', effort: 'XS' },
  'table-duplicate-rows': { fix: 'Investigate deduplication logic in data fetch/rendering layer', effort: 'M' },
  'table-sort-no-aria': { fix: 'Update aria-sort attribute on <th> after sort click (ascending/descending/none)', effort: 'S', wcag: 'WCAG 4.1.2' },
  'table-pagination-no-change': { fix: 'Fix pagination next-page handler — verify route/query param updates and data re-fetches', effort: 'M' },
  'table-no-empty-state': { fix: 'Add empty state UI when search/filter returns no results', effort: 'S' },
  // PWA
  'manifest-fetch-failed': { fix: 'Fix manifest URL in <link rel="manifest">; verify file is served correctly', effort: 'S' },
  'sw-without-manifest': { fix: 'Add web app manifest for full PWA support', effort: 'M' },
  'no-offline-fetch-handler': { fix: 'Add fetch event handler in service worker for offline fallback', effort: 'L' },
  'missing-theme-color': { fix: 'Add <meta name="theme-color" content="#..."> for PWA browser chrome tinting', effort: 'XS' },
  'missing-viewport-meta': { fix: 'Add <meta name="viewport" content="width=device-width, initial-scale=1">', effort: 'XS' },
  'manifest-missing-name': { fix: 'Add name or short_name field to web app manifest', effort: 'XS' },
  'manifest-missing-icons': { fix: 'Add 192x192 and 512x512 PNG icons to web app manifest', effort: 'S' },
  'manifest-missing-start-url': { fix: 'Add start_url field to web app manifest', effort: 'XS' },
  'manifest-missing-display': { fix: 'Add display: "standalone" or "minimal-ui" to web app manifest', effort: 'XS' },
  // Auth surface
  'password-field-exposed': { fix: 'Set type="password" on password input field — CRITICAL exposure', effort: 'XS' },
  'no-forgot-password-link': { fix: 'Add "Forgot password?" link on login form', effort: 'XS' },
  'token-in-localstorage': { fix: 'Move auth token from localStorage to httpOnly cookie; localStorage is XSS-accessible', effort: 'M' },
  'token-in-sessionstorage': { fix: 'Move auth token from sessionStorage to httpOnly cookie', effort: 'M' },
  'auth-cookie-not-httponly': { fix: 'Set HttpOnly flag on auth cookies to prevent JS access', effort: 'S' },
  'protected-route-unauthenticated': { fix: 'Verify auth gate is enforced server-side; add redirect to login for unauthenticated access', effort: 'M' },
  // Back/forward navigation
  'back-navigation-broken': { fix: 'Fix history management — ensure popstate/navigation events correctly restore previous route state', effort: 'M' },
  'page-blank-after-back': { fix: 'Handle popstate event to re-render route content; check SPA router history mode config', effort: 'M' },
  'forward-navigation-broken': { fix: 'Ensure forward navigation (history.forward) works after back; check router history stack', effort: 'S' },
  'page-blank-after-reload': { fix: 'Ensure server returns HTML for all SPA routes (not just index); configure server-side fallback', effort: 'M' },
  // Edge states
  'infinite-spinner': { fix: 'Add timeout/error fallback to loading state; show error UI if data fetch exceeds 10s', effort: 'M' },
  'skeleton-not-resolved': { fix: 'Skeleton still visible after 3s — fix data loading or add error state fallback', effort: 'M' },
  'error-boundary-visible': { fix: 'Fix JavaScript error causing component crash; check React/component error boundary logs', effort: 'M' },
  '404-not-handled': { fix: 'Add 404 route handler returning proper not-found page (not homepage content)', effort: 'S' },
  // Placeholder content
  'lorem-ipsum': { fix: 'Replace lorem ipsum text with real copy before shipping to production', effort: 'M' },
  'todo-comment-visible': { fix: 'Remove or resolve TODO/FIXME comments from production UI', effort: 'XS' },
  'placeholder-image': { fix: 'Replace placeholder/generic image with real content image', effort: 'S' },
  'test-data-visible': { fix: 'Remove test/sample data from production; use a real seeded dataset or empty state', effort: 'M' },
  'example-com-link': { fix: 'Replace example.com URL with real destination link', effort: 'XS' },
  'hardcoded-name': { fix: 'Replace hardcoded test user name with real dynamic content', effort: 'S' },
  'placeholder-attribute-visible': { fix: 'Placeholder attribute should not substitute for a real label; add visible label or aria-label', effort: 'XS', wcag: 'WCAG 1.3.1' },
  // Link checker
  'empty-href': { fix: 'Add a real URL or remove the anchor; replace href="#" only-click with a <button>', effort: 'S' },
  'noop-href': { fix: 'Replace href="#" placeholder with a real destination URL or convert to <button>', effort: 'S' },
  'missing-noopener': { fix: 'Add rel="noopener noreferrer" to all a[target="_blank"] links to prevent tab-napping', effort: 'XS' },
  'empty-link-text': { fix: 'Add visible text or aria-label to link so screen readers can identify its purpose', effort: 'XS', wcag: 'WCAG 2.4.4' },
  'mailto-no-text': { fix: 'Add visible email address or descriptive text inside mailto: link', effort: 'XS' },
  'tel-no-text': { fix: 'Add visible phone number or descriptive text inside tel: link', effort: 'XS' },
  // Cookie consent
  'cookies-before-consent': { fix: 'Do not set non-essential cookies until user accepts consent; move cookie-set to accept handler', effort: 'L' },
  'no-consent-banner': { fix: 'Add GDPR cookie consent banner with Accept/Reject options before setting analytics/tracking cookies', effort: 'L' },
  'consent-no-reject-button': { fix: 'Add "Reject all" / "Decline" button to consent banner; GDPR requires equal-weight opt-out', effort: 'S' },
  'consent-no-privacy-link': { fix: 'Add link to Privacy Policy inside consent banner', effort: 'XS' },
  'consent-pre-checked-optional': { fix: 'Do not pre-check optional analytics/marketing checkboxes in consent UI', effort: 'S' },
  // HTML validation
  'duplicate-id-html': { fix: 'Ensure all id attributes are unique; duplicate IDs break ARIA references and JS querySelector', effort: 'S', wcag: 'WCAG 4.1.1' },
  'missing-lang-attribute': { fix: 'Add lang attribute to <html> element (e.g. lang="en")', effort: 'XS', wcag: 'WCAG 3.1.1' },
  'deprecated-html-tag': { fix: 'Replace deprecated HTML tag with semantic equivalent (e.g. <b>→<strong>, <i>→<em>, <center>→CSS)', effort: 'XS' },
  'nested-interactive': { fix: 'Remove interactive element nested inside another (e.g. <a> inside <a>, <button> inside <a>)', effort: 'S', wcag: 'WCAG 4.1.1' },
  'missing-doctype': { fix: 'Add <!DOCTYPE html> as first line of HTML document', effort: 'XS' },
  'form-missing-action-method': { fix: 'Add action and method attributes to <form> or add JS submit handler', effort: 'S' },
  // Media players
  'video-no-captions': { fix: 'Add <track kind="captions"> or <track kind="subtitles"> to <video> element', effort: 'M', wcag: 'WCAG 1.2.2' },
  'video-autoplay-unmuted': { fix: 'Add muted attribute to autoplaying video, or remove autoplay', effort: 'XS', wcag: 'WCAG 1.4.2' },
  'video-no-controls': { fix: 'Add controls attribute to <video> or provide custom accessible player controls', effort: 'S', wcag: 'WCAG 1.2.1' },
  'audio-no-controls': { fix: 'Add controls attribute to <audio> element so users can pause/adjust volume', effort: 'S', wcag: 'WCAG 1.2.1' },
  'video-no-poster': { fix: 'Add poster attribute with a representative frame image to <video>', effort: 'XS' },
  'media-not-keyboard-accessible': { fix: 'Ensure media controls are reachable via Tab key and operable with keyboard', effort: 'S', wcag: 'WCAG 2.1.1' },
  // Carousels
  'carousel-no-keyboard-support': { fix: 'Implement keyboard navigation for carousel (arrow keys for slides, Tab for controls)', effort: 'M', wcag: 'WCAG 2.1.1' },
  'carousel-autoplay-no-pause': { fix: 'Add pause-on-hover and a visible pause/stop button to auto-advancing carousel', effort: 'S', wcag: 'WCAG 2.2.2' },
  'carousel-no-aria-label': { fix: 'Add aria-label or aria-labelledby to carousel container and aria-label to prev/next buttons', effort: 'XS', wcag: 'WCAG 4.1.2' },
  'carousel-no-live-region': { fix: 'Add aria-live="polite" region to announce slide changes to screen readers', effort: 'S', wcag: 'WCAG 4.1.3' },
  // Print media
  'no-print-stylesheet': { fix: 'Add @media print CSS rules to hide nav/sidebar/ads and ensure readable print layout', effort: 'M' },
  'nav-visible-in-print': { fix: 'Add @media print { nav { display: none } } to hide navigation in print output', effort: 'XS' },
  'print-horizontal-overflow': { fix: 'Add @media print { * { max-width: 100% } } to prevent overflow in print layout', effort: 'XS' },
  'print-low-contrast': { fix: 'In @media print, force text to black and background to white for print readability', effort: 'XS' },
  // CSRF
  'form-missing-csrf-token': { fix: 'Add CSRF token to form as hidden input; verify server-side CSRF validation middleware is active', effort: 'M' },
  'get-form-with-sensitive-field': { fix: 'Change form method to POST to prevent sensitive data appearing in URL/server logs', effort: 'XS' },
  // Sitemap + robots
  'missing-sitemap': { fix: 'Create /sitemap.xml listing all public URLs; submit to Google Search Console', effort: 'S' },
  'missing-robots': { fix: 'Create /robots.txt to control crawl behavior; at minimum add User-agent: * and Sitemap: URL', effort: 'XS' },
  'sitemap-noindex-conflict': { fix: 'Remove noindex from pages that are listed in sitemap.xml — conflicting signals hurt SEO', effort: 'S' },
  'robots-disallow-all': { fix: 'Review robots.txt — "Disallow: /" blocks all crawlers; replace with more targeted disallow rules', effort: 'S' },
  'canonical-mismatch': { fix: 'Update canonical URL to match actual page URL, or implement canonical redirects', effort: 'S' },
  // Search
  'search-no-results-state': { fix: 'Add "No results found" message when search returns empty results', effort: 'S' },
  'search-no-aria-label': { fix: 'Add aria-label="Search" to search input and role="search" to containing landmark', effort: 'XS', wcag: 'WCAG 4.1.2' },
  'search-xss-reflection': { fix: 'Sanitize/encode search query before inserting into DOM — potential XSS vector', effort: 'M' },
  'search-keyboard-submit': { fix: 'Ensure pressing Enter in search input triggers search (submit event or keydown handler)', effort: 'XS' },
  'search-empty-query-unguarded': { fix: 'Guard against empty string search queries — show prompt or disable submit when input is empty', effort: 'XS' },
  // Scroll axes
  'vertical-scroll-broken': { fix: 'Remove overflow: hidden from html/body; check no JS is blocking wheel/touch events', effort: 'M', wcag: 'WCAG 2.1.1' },
  'h-scroll-container-broken': { fix: 'Set overflow-x: auto on container with scrollWidth > clientWidth; verify scrollLeft mutation is not blocked', effort: 'S' },
  'unexpected-page-h-scroll': { fix: 'Find element wider than viewport and add max-width: 100%; set overflow-x: hidden on body as last resort', effort: 'S' },
  'scroll-snap-missing-align': { fix: 'Add scroll-snap-align: start|center|end to children of scroll-snap-type container', effort: 'XS' },
  // Button animations
  'btn-animation-layout-prop': { fix: 'Replace transition on layout properties (width/height/top/left) with transform/opacity for GPU compositing', effort: 'S' },
  'btn-animation-too-slow': { fix: 'Reduce button transition duration to ≤300ms for hover/focus feedback', effort: 'XS' },
  'btn-animation-too-fast': { fix: 'Increase button transition duration to ≥100ms so the animation is perceptible', effort: 'XS' },
  'btn-no-hover-feedback': { fix: 'Add :hover CSS rule with background-color, transform: scale(1.02), or box-shadow change to button', effort: 'S' },
  'btn-no-active-state': { fix: 'Add :active CSS rule with transform: scale(0.98) or darker background to button for press feedback', effort: 'XS' },
  'btn-disabled-no-visual': { fix: 'Add opacity: 0.5 and cursor: not-allowed to disabled/aria-disabled buttons', effort: 'XS', wcag: 'WCAG 1.4.3' },
  'btn-loading-no-spinner': { fix: 'Add visible spinner/loader inside button when aria-busy="true" or loading class is applied', effort: 'S' },
  // Popup quality
  'popup-no-shadow': { fix: 'Add box-shadow to modal/popup for visual elevation above page content (e.g. 0 8px 32px rgba(0,0,0,0.2))', effort: 'XS' },
  'popup-no-backdrop': { fix: 'Add semi-transparent backdrop behind modal dialog (e.g. rgba(0,0,0,0.5)) to separate from background', effort: 'S' },
  'popup-transparent-backdrop': { fix: 'Set non-zero opacity on backdrop element (e.g. background: rgba(0,0,0,0.4)) so background is visually muted', effort: 'XS' },
  'popup-no-open-animation': { fix: 'Add CSS transition: opacity 200ms, transform 200ms to popup for smooth entry (transform: scale(0.95)→scale(1))', effort: 'S' },
  'popup-animation-layout-prop': { fix: 'Replace top/left/width/height animation on popup with transform: translate/scale for GPU compositing', effort: 'S' },
  'popup-animation-too-slow': { fix: 'Reduce popup open/close animation to ≤300ms', effort: 'XS' },
  'popup-low-zindex': { fix: 'Increase modal z-index to 1000+ to ensure it renders above all page content', effort: 'XS' },
  'popup-clipped-right': { fix: 'Add max-width: calc(100vw - 2rem) and margin: auto to center popup within viewport', effort: 'S' },
  'popup-clipped-bottom': { fix: 'Add max-height: calc(100vh - 2rem) and overflow-y: auto to popup for tall content', effort: 'S' },
  'popup-clipped-left': { fix: 'Ensure popup left position is ≥ 0; check negative margin or transform causing off-screen placement', effort: 'S' },
  'popup-no-internal-scroll': { fix: 'Add overflow-y: auto and max-height: 80vh to modal body content area for tall popups', effort: 'XS' },
  // Performance
  'poor-lcp': {
    fix: 'Preload largest contentful image; defer non-critical scripts; check server response time',
    effort: 'M',
    wcag: 'Performance best practice',
  },
  'poor-cls': {
    fix: 'Set explicit width/height on images; avoid inserting content above visible area after load',
    effort: 'M',
  },
  'poor-fcp': {
    fix: 'Reduce render-blocking resources; inline critical CSS; use font-display: swap',
    effort: 'M',
  },
  'poor-ttfb': {
    fix: 'Investigate server latency; enable caching; consider CDN or edge delivery',
    effort: 'L',
  },
};

const DEFAULT_FIX: FixMeta = {
  fix: 'Investigate root cause and apply targeted fix. Review element in DevTools.',
  effort: 'M',
};

// ─── Severity ordering ────────────────────────────────────────────────────────

const SEVERITY_ORDER: Record<Severity, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
  info: 4,
};

const SEVERITY_EMOJI: Record<Severity, string> = {
  critical: '🔴',
  high: '🟠',
  medium: '🟡',
  low: '🔵',
  info: 'ℹ️',
};

const EFFORT_LABEL: Record<Effort, string> = {
  XS: 'XS ~mins',
  S: 'S ~1h',
  M: 'M ~half day',
  L: 'L ~1+ day',
};

// ─── Severity normalization ───────────────────────────────────────────────────

/** Maps accessibility issue types (which carry no severity) to a severity level. */
function a11ySeverity(type: string): Severity {
  const critical: string[] = [];
  const high = [
    'missing-accessible-name', 'input-missing-label', 'role-button-not-focusable',
    'clickable-without-role', 'missing-html-lang', 'poor-color-contrast', 'poor-color-contrast-summary',
  ];
  const medium = [
    'duplicate-id', 'heading-level-skip', 'aria-expanded-no-controls',
  ];
  if (critical.includes(type)) return 'critical';
  if (high.includes(type)) return 'high';
  if (medium.includes(type)) return 'medium';
  return 'low';
}

function webVitalSeverity(rating: string): Severity {
  if (rating === 'poor') return 'medium';
  if (rating === 'needs-improvement') return 'low';
  return 'info';
}

// ─── Artifact readers ─────────────────────────────────────────────────────────

function safeReadJson<T>(filePath: string): T | null {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as T;
  } catch {
    return null;
  }
}

function globArtifacts(folder: string, pattern: RegExp): string[] {
  const dir = path.join('qa-artifacts', folder);
  try {
    return fs.readdirSync(dir)
      .filter((f: string) => pattern.test(f))
      .map((f: string) => path.join(dir, f));
  } catch {
    return [];
  }
}

// ─── Ingest functions ─────────────────────────────────────────────────────────

function ingestAccessibility(route: string, routeName: string): NormalizedFinding[] {
  const filePath = path.join('qa-artifacts', 'accessibility', `${routeName}-accessibility.json`);
  const data = safeReadJson<Array<{ type: string; message: string; selector?: string; text?: string }>>(filePath);
  if (!data) return [];
  return data.map(item => ({
    route,
    source: 'accessibility',
    severity: a11ySeverity(item.type),
    type: item.type,
    message: item.message,
    selector: item.selector,
    text: item.text,
    evidencePath: filePath,
  }));
}

function ingestSecurity(route: string, routeName: string): NormalizedFinding[] {
  const filePath = path.join('qa-artifacts', 'security', `${routeName}-security.json`);
  const data = safeReadJson<Array<{ severity?: string; type?: string; message?: string; header?: string }>>(filePath);
  if (!data) return [];
  return data.map(item => ({
    route,
    source: 'security',
    severity: (item.severity as Severity) || 'medium',
    type: item.type || item.header || 'security-finding',
    message: item.message || JSON.stringify(item),
    evidencePath: filePath,
  }));
}

function ingestZoomScroll(route: string, routeName: string): NormalizedFinding[] {
  const filePath = path.join('qa-artifacts', 'zoom-scroll', `${routeName}-zoom-scroll.json`);
  const data = safeReadJson<{ findings: Array<{ severity: string; type: string; message: string; zoom?: number }> }>(filePath);
  if (!data?.findings) return [];
  return data.findings
    .filter(f => f.severity !== 'info')
    .map(item => ({
      route,
      source: 'zoom-scroll',
      severity: item.severity as Severity,
      type: item.type,
      message: item.message,
      evidencePath: filePath,
    }));
}

function ingestThemeComparison(route: string, routeName: string): NormalizedFinding[] {
  const filePath = path.join('qa-artifacts', 'theme-comparison', `${routeName}-theme-comparison.json`);
  const data = safeReadJson<{
    issues: Array<{
      severity: string; source: string; type: string; message: string;
      selector?: string; text?: string;
    }>
  }>(filePath);
  if (!data?.issues) return [];
  return data.issues
    .filter(f => f.severity !== 'info')
    .map(item => ({
      route,
      source: 'theme-comparison',
      severity: item.severity as Severity,
      type: item.type,
      message: item.message,
      selector: item.selector,
      text: item.text,
      evidencePath: filePath,
    }));
}

function ingestLayout(route: string, routeName: string): NormalizedFinding[] {
  const files = globArtifacts('layout', new RegExp(`^${routeName}-layout-scroll-`));
  const findings: NormalizedFinding[] = [];
  for (const filePath of files) {
    const data = safeReadJson<Array<{ type: string; message: string; selector?: string }>>(filePath);
    if (!data) continue;
    for (const item of data) {
      findings.push({
        route,
        source: 'layout',
        severity: 'medium',
        type: item.type,
        message: item.message,
        selector: item.selector,
        evidencePath: filePath,
      });
    }
  }
  return findings;
}

function ingestForms(route: string, routeName: string): NormalizedFinding[] {
  const filePath = path.join('qa-artifacts', 'forms', `${routeName}-forms.json`);
  const data = safeReadJson<Array<{ type?: string; message?: string; severity?: string }>>(filePath);
  if (!data) return [];
  return data.map(item => ({
    route,
    source: 'forms',
    severity: (item.severity as Severity) || 'medium',
    type: item.type || 'form-issue',
    message: item.message || JSON.stringify(item),
    evidencePath: filePath,
  }));
}

function ingestSeo(route: string, routeName: string): NormalizedFinding[] {
  const filePath = path.join('qa-artifacts', 'seo', `${routeName}-seo.json`);
  const data = safeReadJson<Array<{ type?: string; message?: string }>>(filePath);
  if (!data) return [];
  return data.map(item => ({
    route,
    source: 'seo',
    severity: 'low' as Severity,
    type: item.type || 'seo-issue',
    message: item.message || JSON.stringify(item),
    evidencePath: filePath,
  }));
}

function ingestPerformance(route: string, routeName: string): NormalizedFinding[] {
  const filePath = path.join('qa-artifacts', 'performance', `${routeName}-poor-vitals.json`);
  const data = safeReadJson<Array<{ name: string; value: number; rating: string }>>(filePath);
  if (!data) return [];
  return data.map(item => ({
    route,
    source: 'performance',
    severity: webVitalSeverity(item.rating),
    type: `poor-${item.name.toLowerCase()}`,
    message: `${item.name} = ${item.value} (${item.rating})`,
    evidencePath: filePath,
  }));
}

function ingestNetwork(route: string, routeName: string): NormalizedFinding[] {
  const findings: NormalizedFinding[] = [];

  const dupeFile = path.join('qa-artifacts', 'network', `${routeName}-duplicates.json`);
  const dupes = safeReadJson<Array<{ url: string; count: number }>>(dupeFile);
  if (dupes) {
    for (const d of dupes) {
      findings.push({
        route,
        source: 'network',
        severity: 'medium',
        type: 'duplicate-api-calls',
        message: `URL called ${d.count}x: ${d.url}`,
        evidencePath: dupeFile,
      });
    }
  }

  const largeFile = path.join('qa-artifacts', 'network', `${routeName}-large-payloads.json`);
  const large = safeReadJson<Array<{ url: string; size: number }>>(largeFile);
  if (large) {
    for (const l of large) {
      findings.push({
        route,
        source: 'network',
        severity: 'low',
        type: 'large-payload',
        message: `Large response (${(l.size / 1024).toFixed(0)} KB): ${l.url}`,
        evidencePath: largeFile,
      });
    }
  }

  return findings;
}

function ingestBrokenImages(route: string, routeName: string): NormalizedFinding[] {
  const filePath = path.join('qa-artifacts', 'broken-images', `${routeName}-broken-images.json`);
  const data = safeReadJson<Array<{ severity?: string; type?: string; message?: string; src?: string; selector?: string }>>(filePath);
  if (!data) return [];
  return data.map(item => ({
    route, source: 'broken-images',
    severity: (item.severity as Severity) || 'medium',
    type: item.type || 'broken-image',
    message: item.message || JSON.stringify(item),
    selector: item.selector || item.src,
    evidencePath: filePath,
  }));
}

function ingestLazyImages(route: string, routeName: string): NormalizedFinding[] {
  const filePath = path.join('qa-artifacts', 'lazy-images', `${routeName}-lazy-images.json`);
  const data = safeReadJson<{ findings: Array<{ severity?: string; type?: string; message?: string; src?: string; selector?: string }> }>(filePath);
  if (!data?.findings) return [];
  return data.findings.filter(f => f.severity !== 'info').map(item => ({
    route, source: 'lazy-images',
    severity: (item.severity as Severity) || 'medium',
    type: item.type || 'lazy-image-issue',
    message: item.message || JSON.stringify(item),
    selector: item.selector || item.src,
    evidencePath: filePath,
  }));
}

function ingestReducedMotion(route: string, routeName: string): NormalizedFinding[] {
  const filePath = path.join('qa-artifacts', 'reduced-motion', `${routeName}-reduced-motion.json`);
  const data = safeReadJson<{ findings: Array<{ severity?: string; type?: string; message?: string }> }>(filePath);
  if (!data?.findings) return [];
  return data.findings.filter(f => f.severity !== 'info').map(item => ({
    route, source: 'reduced-motion',
    severity: (item.severity as Severity) || 'medium',
    type: item.type || 'motion-issue',
    message: item.message || JSON.stringify(item),
    evidencePath: filePath,
  }));
}

function ingestResponsiveBehavior(route: string, routeName: string): NormalizedFinding[] {
  const filePath = path.join('qa-artifacts', 'responsive-behavior', `${routeName}-responsive-behavior.json`);
  const data = safeReadJson<{ findings: Array<{ severity?: string; type?: string; message?: string; viewport?: string; selector?: string }> }>(filePath);
  if (!data?.findings) return [];
  return data.findings.filter(f => f.severity !== 'info').map(item => ({
    route, source: 'responsive-behavior',
    severity: (item.severity as Severity) || 'medium',
    type: item.type || 'responsive-issue',
    message: item.message || JSON.stringify(item),
    selector: item.selector,
    evidencePath: filePath,
  }));
}

function ingestToasts(route: string, routeName: string): NormalizedFinding[] {
  const filePath = path.join('qa-artifacts', 'toasts', `${routeName}-toasts.json`);
  const data = safeReadJson<{ findings: Array<{ severity?: string; type?: string; message?: string; selector?: string }> }>(filePath);
  if (!data?.findings) return [];
  return data.findings.filter(f => f.severity !== 'info').map(item => ({
    route, source: 'toasts',
    severity: (item.severity as Severity) || 'medium',
    type: item.type || 'toast-issue',
    message: item.message || JSON.stringify(item),
    selector: item.selector,
    evidencePath: filePath,
  }));
}

function ingestTables(route: string, routeName: string): NormalizedFinding[] {
  const filePath = path.join('qa-artifacts', 'tables', `${routeName}-tables.json`);
  const data = safeReadJson<{ findings: Array<{ severity?: string; type?: string; message?: string; selector?: string }> }>(filePath);
  if (!data?.findings) return [];
  return data.findings.filter(f => f.severity !== 'info').map(item => ({
    route, source: 'tables',
    severity: (item.severity as Severity) || 'medium',
    type: item.type || 'table-issue',
    message: item.message || JSON.stringify(item),
    selector: item.selector,
    evidencePath: filePath,
  }));
}

function ingestAuth(route: string, routeName: string): NormalizedFinding[] {
  const filePath = path.join('qa-artifacts', 'auth', `${routeName}-auth.json`);
  const data = safeReadJson<{ findings: Array<{ severity?: string; type?: string; message?: string; selector?: string }> }>(filePath);
  if (!data?.findings) return [];
  return data.findings.filter(f => f.severity !== 'info').map(item => ({
    route, source: 'auth',
    severity: (item.severity as Severity) || 'medium',
    type: item.type || 'auth-issue',
    message: item.message || JSON.stringify(item),
    selector: item.selector,
    evidencePath: filePath,
  }));
}

function ingestBackForward(route: string, routeName: string): NormalizedFinding[] {
  const filePath = path.join('qa-artifacts', 'back-forward', `${routeName}-back-forward.json`);
  const data = safeReadJson<{ findings: Array<{ severity?: string; type?: string; message?: string }> }>(filePath);
  if (!data?.findings) return [];
  return data.findings.filter(f => f.severity !== 'info').map(item => ({
    route, source: 'back-forward',
    severity: (item.severity as Severity) || 'medium',
    type: item.type || 'nav-issue',
    message: item.message || JSON.stringify(item),
    evidencePath: filePath,
  }));
}

function ingestEdgeStates(route: string, routeName: string): NormalizedFinding[] {
  const filePath = path.join('qa-artifacts', 'edge-states', `${routeName}-edge-states.json`);
  const data = safeReadJson<{ findings: Array<{ severity?: string; type?: string; message?: string }> }>(filePath);
  if (!data?.findings) return [];
  return data.findings.filter(f => f.severity !== 'info').map(item => ({
    route, source: 'edge-states',
    severity: (item.severity as Severity) || 'medium',
    type: item.type || 'edge-state-issue',
    message: item.message || JSON.stringify(item),
    evidencePath: filePath,
  }));
}

function ingestScrollAxes(route: string, routeName: string): NormalizedFinding[] {
  const filePath = path.join('qa-artifacts', 'scroll-axes', `${routeName}-scroll-axes.json`);
  const data = safeReadJson<{ findings: Array<{ severity?: string; type?: string; message?: string; selector?: string }> }>(filePath);
  if (!data?.findings) return [];
  return data.findings.filter(f => f.severity !== 'info').map(item => ({
    route, source: 'scroll-axes',
    severity: (item.severity as Severity) || 'medium',
    type: item.type || 'scroll-issue',
    message: item.message || JSON.stringify(item),
    selector: item.selector,
    evidencePath: filePath,
  }));
}

function ingestButtonAnimations(route: string, routeName: string): NormalizedFinding[] {
  const filePath = path.join('qa-artifacts', 'button-animations', `${routeName}-button-animations.json`);
  const data = safeReadJson<{ findings: Array<{ severity?: string; type?: string; message?: string; selector?: string }> }>(filePath);
  if (!data?.findings) return [];
  return data.findings.filter(f => f.severity !== 'info').map(item => ({
    route, source: 'button-animations',
    severity: (item.severity as Severity) || 'low',
    type: item.type || 'btn-animation-issue',
    message: item.message || JSON.stringify(item),
    selector: item.selector,
    evidencePath: filePath,
  }));
}

function ingestPopupQuality(route: string, routeName: string): NormalizedFinding[] {
  const filePath = path.join('qa-artifacts', 'popup-quality', `${routeName}-popup-quality.json`);
  const data = safeReadJson<{ findings: Array<{ severity?: string; type?: string; message?: string; selector?: string }> }>(filePath);
  if (!data?.findings) return [];
  return data.findings.filter(f => f.severity !== 'info').map(item => ({
    route, source: 'popup-quality',
    severity: (item.severity as Severity) || 'low',
    type: item.type || 'popup-quality-issue',
    message: item.message || JSON.stringify(item),
    selector: item.selector,
    evidencePath: filePath,
  }));
}

function ingestPlaceholderContent(route: string, routeName: string): NormalizedFinding[] {
  const filePath = path.join('qa-artifacts', 'placeholder-content', `${routeName}-placeholder-content.json`);
  const data = safeReadJson<Array<{ severity?: string; type?: string; message?: string; selector?: string; text?: string }>>(filePath);
  if (!data) return [];
  return data.filter(f => f.severity !== 'info').map(item => ({
    route, source: 'placeholder-content',
    severity: (item.severity as Severity) || 'medium',
    type: item.type || 'placeholder-content',
    message: item.message || JSON.stringify(item),
    selector: item.selector,
    text: item.text,
    evidencePath: filePath,
  }));
}

function ingestLinkChecker(route: string, routeName: string): NormalizedFinding[] {
  const filePath = path.join('qa-artifacts', 'link-checker', `${routeName}-link-checker.json`);
  const data = safeReadJson<{ findings: Array<{ severity?: string; type?: string; message?: string; href?: string; selector?: string }> }>(filePath);
  if (!data?.findings) return [];
  return data.findings.filter(f => f.severity !== 'info').map(item => ({
    route, source: 'link-checker',
    severity: (item.severity as Severity) || 'medium',
    type: item.type || 'link-issue',
    message: item.message || JSON.stringify(item),
    selector: item.selector || item.href,
    evidencePath: filePath,
  }));
}

function ingestCookieConsent(route: string, routeName: string): NormalizedFinding[] {
  const filePath = path.join('qa-artifacts', 'cookie-consent', `${routeName}-cookie-consent.json`);
  const data = safeReadJson<{ findings: Array<{ severity?: string; type?: string; message?: string; selector?: string }> }>(filePath);
  if (!data?.findings) return [];
  return data.findings.filter(f => f.severity !== 'info').map(item => ({
    route, source: 'cookie-consent',
    severity: (item.severity as Severity) || 'medium',
    type: item.type || 'cookie-consent-issue',
    message: item.message || JSON.stringify(item),
    selector: item.selector,
    evidencePath: filePath,
  }));
}

function ingestHtmlValidation(route: string, routeName: string): NormalizedFinding[] {
  const filePath = path.join('qa-artifacts', 'html-validation', `${routeName}-html-validation.json`);
  const data = safeReadJson<Array<{ severity?: string; type?: string; message?: string; selector?: string }>>(filePath);
  if (!data) return [];
  return data.filter(f => f.severity !== 'info').map(item => ({
    route, source: 'html-validation',
    severity: (item.severity as Severity) || 'medium',
    type: item.type || 'html-validation-issue',
    message: item.message || JSON.stringify(item),
    selector: item.selector,
    evidencePath: filePath,
  }));
}

function ingestMediaPlayers(route: string, routeName: string): NormalizedFinding[] {
  const filePath = path.join('qa-artifacts', 'media-player', `${routeName}-media-player.json`);
  const data = safeReadJson<{ findings: Array<{ severity?: string; type?: string; message?: string; selector?: string }> }>(filePath);
  if (!data?.findings) return [];
  return data.findings.filter(f => f.severity !== 'info').map(item => ({
    route, source: 'media-player',
    severity: (item.severity as Severity) || 'medium',
    type: item.type || 'media-player-issue',
    message: item.message || JSON.stringify(item),
    selector: item.selector,
    evidencePath: filePath,
  }));
}

function ingestCarousels(route: string, routeName: string): NormalizedFinding[] {
  const filePath = path.join('qa-artifacts', 'carousel', `${routeName}-carousel.json`);
  const data = safeReadJson<{ findings: Array<{ severity?: string; type?: string; message?: string; selector?: string }> }>(filePath);
  if (!data?.findings) return [];
  return data.findings.filter(f => f.severity !== 'info').map(item => ({
    route, source: 'carousel',
    severity: (item.severity as Severity) || 'medium',
    type: item.type || 'carousel-issue',
    message: item.message || JSON.stringify(item),
    selector: item.selector,
    evidencePath: filePath,
  }));
}

function ingestPrintMedia(route: string, routeName: string): NormalizedFinding[] {
  const filePath = path.join('qa-artifacts', 'print-media', `${routeName}-print-media.json`);
  const data = safeReadJson<{ findings: Array<{ severity?: string; type?: string; message?: string; selector?: string }> }>(filePath);
  if (!data?.findings) return [];
  return data.findings.filter(f => f.severity !== 'info').map(item => ({
    route, source: 'print-media',
    severity: (item.severity as Severity) || 'low',
    type: item.type || 'print-media-issue',
    message: item.message || JSON.stringify(item),
    selector: item.selector,
    evidencePath: filePath,
  }));
}

function ingestCsrf(route: string, routeName: string): NormalizedFinding[] {
  const filePath = path.join('qa-artifacts', 'csrf', `${routeName}-csrf.json`);
  const data = safeReadJson<Array<{ severity?: string; type?: string; message?: string; selector?: string; formIndex?: number }>>(filePath);
  if (!data) return [];
  return data.filter(f => f.severity !== 'info').map(item => ({
    route, source: 'csrf',
    severity: (item.severity as Severity) || 'medium',
    type: item.type || 'csrf-issue',
    message: item.message || JSON.stringify(item),
    selector: item.selector,
    evidencePath: filePath,
  }));
}

function ingestSitemap(route: string, routeName: string): NormalizedFinding[] {
  const filePath = path.join('qa-artifacts', 'sitemap', `${routeName}-sitemap.json`);
  const data = safeReadJson<{ findings: Array<{ severity?: string; type?: string; message?: string; url?: string }> }>(filePath);
  if (!data?.findings) return [];
  return data.findings.filter(f => f.severity !== 'info').map(item => ({
    route, source: 'sitemap',
    severity: (item.severity as Severity) || 'low',
    type: item.type || 'sitemap-issue',
    message: item.message || JSON.stringify(item),
    selector: item.url,
    evidencePath: filePath,
  }));
}

function ingestSearch(route: string, routeName: string): NormalizedFinding[] {
  const filePath = path.join('qa-artifacts', 'search', `${routeName}-search.json`);
  const data = safeReadJson<{ findings: Array<{ severity?: string; type?: string; message?: string; selector?: string }> }>(filePath);
  if (!data?.findings) return [];
  return data.findings.filter(f => f.severity !== 'info').map(item => ({
    route, source: 'search',
    severity: (item.severity as Severity) || 'medium',
    type: item.type || 'search-issue',
    message: item.message || JSON.stringify(item),
    selector: item.selector,
    evidencePath: filePath,
  }));
}

// ─── Deduplication ────────────────────────────────────────────────────────────

function dedupeFindings(findings: NormalizedFinding[]): NormalizedFinding[] {
  const seen = new Set<string>();
  return findings.filter(f => {
    const key = `${f.source}|${f.route}|${f.type}|${f.selector || ''}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// ─── Markdown generation ──────────────────────────────────────────────────────

function renderFixPlan(allFindings: NormalizedFinding[], generatedAt: string): string {
  const sorted = [...allFindings].sort((a, b) => {
    const sev = SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];
    if (sev !== 0) return sev;
    return a.route.localeCompare(b.route);
  });

  const bySeverity = new Map<Severity, NormalizedFinding[]>();
  for (const f of sorted) {
    if (!bySeverity.has(f.severity)) bySeverity.set(f.severity, []);
    bySeverity.get(f.severity)!.push(f);
  }

  const counts: Record<Severity, number> = {
    critical: bySeverity.get('critical')?.length ?? 0,
    high: bySeverity.get('high')?.length ?? 0,
    medium: bySeverity.get('medium')?.length ?? 0,
    low: bySeverity.get('low')?.length ?? 0,
    info: 0,
  };

  const lines: string[] = [];

  lines.push('# QA Fix Plan');
  lines.push('');
  lines.push(`Generated: ${generatedAt}`);
  lines.push('');
  lines.push('## Summary');
  lines.push('');
  lines.push('| Severity | Count |');
  lines.push('|----------|-------|');
  lines.push(`| 🔴 Critical | ${counts.critical} |`);
  lines.push(`| 🟠 High | ${counts.high} |`);
  lines.push(`| 🟡 Medium | ${counts.medium} |`);
  lines.push(`| 🔵 Low | ${counts.low} |`);
  lines.push(`| **Total** | **${counts.critical + counts.high + counts.medium + counts.low}** |`);
  lines.push('');

  const severities: Severity[] = ['critical', 'high', 'medium', 'low'];
  let defectNum = 0;

  for (const sev of severities) {
    const group = bySeverity.get(sev);
    if (!group || group.length === 0) continue;

    const label = sev.charAt(0).toUpperCase() + sev.slice(1);
    lines.push(`## ${SEVERITY_EMOJI[sev]} ${label} (${group.length})`);
    lines.push('');

    for (const f of group) {
      defectNum++;
      const meta = FIX_RECOMMENDATIONS[f.type] ?? DEFAULT_FIX;
      const routeLabel = f.route === '/' ? '/' : f.route;
      const wcagLine = meta.wcag ? ` · ${meta.wcag}` : '';

      lines.push(`### FIX-${String(defectNum).padStart(3, '0')}: ${f.type}`);
      lines.push('');
      lines.push(`**Route:** \`${routeLabel}\``);
      lines.push(`**Source:** ${f.source}${wcagLine}`);
      lines.push(`**Effort:** ${EFFORT_LABEL[meta.effort]}`);
      if (f.selector) lines.push(`**Element:** \`${f.selector}\``);
      if (f.text) lines.push(`**Text:** "${f.text}"`);
      lines.push('');
      lines.push(`**Finding:** ${f.message}`);
      lines.push('');
      lines.push(`**Fix:** ${meta.fix}`);
      lines.push('');
      lines.push(`**Evidence:** \`${f.evidencePath}\``);
      lines.push('');
      lines.push('---');
      lines.push('');
    }
  }

  if (allFindings.length === 0) {
    lines.push('## ✅ No actionable findings');
    lines.push('');
    lines.push('All artifact checks passed or produced no findings.');
  }

  return lines.join('\n');
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Reads all QA artifacts for the given routes, aggregates findings across every
 * category (accessibility, security, zoom-scroll, theme, layout, forms, SEO,
 * performance, network), deduplicates, sorts by severity, and writes a
 * prioritised fix plan to `qa-artifacts/reports/fix-plan.md`.
 *
 * Must be called AFTER all per-route tests complete (artifacts must be written).
 * Safe to call even if some routes failed mid-test — missing artifact files are
 * silently skipped.
 *
 * @param routes Array of route paths (e.g. ['/', '/about', '/dashboard'])
 */
export function writeFixPlan(routes: string[]): void {
  const allFindings: NormalizedFinding[] = [];

  for (const route of routes) {
    const routeName = normalizeRoute(route);
    allFindings.push(
      ...ingestAccessibility(route, routeName),
      ...ingestSecurity(route, routeName),
      ...ingestZoomScroll(route, routeName),
      ...ingestThemeComparison(route, routeName),
      ...ingestLayout(route, routeName),
      ...ingestForms(route, routeName),
      ...ingestSeo(route, routeName),
      ...ingestPerformance(route, routeName),
      ...ingestNetwork(route, routeName),
      ...ingestBrokenImages(route, routeName),
      ...ingestLazyImages(route, routeName),
      ...ingestReducedMotion(route, routeName),
      ...ingestResponsiveBehavior(route, routeName),
      ...ingestToasts(route, routeName),
      ...ingestTables(route, routeName),
      ...ingestAuth(route, routeName),
      ...ingestBackForward(route, routeName),
      ...ingestEdgeStates(route, routeName),
      ...ingestPlaceholderContent(route, routeName),
      ...ingestLinkChecker(route, routeName),
      ...ingestCookieConsent(route, routeName),
      ...ingestHtmlValidation(route, routeName),
      ...ingestMediaPlayers(route, routeName),
      ...ingestCarousels(route, routeName),
      ...ingestPrintMedia(route, routeName),
      ...ingestCsrf(route, routeName),
      ...ingestSitemap(route, routeName),
      ...ingestSearch(route, routeName),
      ...ingestScrollAxes(route, routeName),
      ...ingestButtonAnimations(route, routeName),
      ...ingestPopupQuality(route, routeName),
    );
  }

  const deduped = dedupeFindings(allFindings);
  const generatedAt = new Date().toISOString();
  const markdown = renderFixPlan(deduped, generatedAt);

  const dir = path.join('qa-artifacts', 'reports');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'fix-plan.md'), markdown, 'utf-8');
}
