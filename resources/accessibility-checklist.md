# Accessibility Checklist

## Keyboard

- Tab reaches all interactive controls.
- Shift+Tab works backward.
- Focus is visible.
- Focus order follows visual order.
- Enter/Space activate buttons correctly.
- Arrow keys work in menus, tabs, radios, and selects where expected.
- Escape closes overlays.

## Names and labels

- Every button has an accessible name.
- Icon-only buttons have `aria-label` or visible text.
- Inputs have labels.
- Error messages are connected to fields.
- Links have meaningful names.

## Structure

- Page has a sensible heading hierarchy.
- Major regions use semantic landmarks when possible.
- Tables use header cells.
- Lists use list markup where meaningful.

## Dialogs and overlays

- Focus moves inside modal.
- Focus is trapped inside modal.
- Focus returns to trigger after close.
- Background content is not reachable while modal is open.
- Escape behavior is consistent.

## Visual

- Text contrast is not obviously poor.
- Focus ring is visible.
- Text remains readable on mobile.
- Error text is not color-only.

## ARIA

- No duplicate IDs.
- No invalid ARIA roles.
- No aria-hidden focusable elements.
- No role/button without keyboard support.
