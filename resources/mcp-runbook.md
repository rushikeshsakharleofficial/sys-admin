# Playwright MCP Runbook

Follow this sequence with Playwright MCP.

## Start

1. Navigate to the target URL.
2. Resize to desktop 1440x900.
3. Take an accessibility snapshot.
4. Take a screenshot.
5. Identify visible regions and controls.
6. Create a page test plan.

## Page loop

For each route:

1. Navigate to the route.
2. Wait for DOM content loaded.
3. Wait briefly for app data.
4. Capture top screenshot.
5. Capture full-page screenshot if available.
6. Scroll to 25%, 50%, 75%, and bottom.
7. Screenshot each position.
8. Return to top.
9. Test menus, sidebars, modals, drawers, popovers, floating controls.
10. Test forms safely.
11. Inspect network requests.
12. Inspect storage.
13. Inspect console/page errors if available.
14. Repeat key checks on tablet and mobile.

## Interaction loop

For each interactive element:

1. Record role and accessible name.
2. Hover.
3. Screenshot.
4. Focus with keyboard if possible.
5. Screenshot.
6. Click only if safe.
7. Wait for UI response.
8. Screenshot.
9. Check network and console.
10. Revert state.

## Stop conditions

Stop and ask for user takeover when:

- login requires password or OTP
- payment is required
- form would send public or real user content
- action may delete or mutate production data

## Evidence naming

Use predictable filenames:

```text
<route>/<viewport>/<step>-<state>.png
```

Example:

```text
dashboard/desktop/after-click-user-menu.png
```
