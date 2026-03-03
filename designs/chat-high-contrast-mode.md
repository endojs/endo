# Chat High Contrast Mode

| | |
|---|---|
| **Date** | 2026-02-26 |
| **Author** | Kris Kowal (prompted) |
| **Status** | Not Started |
| **Depends on** | [chat-color-schemes](chat-color-schemes.md), [chat-per-space-color-scheme](chat-per-space-color-scheme.md) |

## Motivation

Users with low vision or in high-glare environments need stronger visual
contrast than the standard light and dark schemes provide.
macOS, Windows, and some Linux desktops expose a high-contrast preference
(`prefers-contrast: more`) that applications can respond to.

This design adds a high-contrast variant for both the light and dark
schemes introduced in [chat-color-schemes](chat-color-schemes.md),
and extends the per-space scheme selector from
[chat-per-space-color-scheme](chat-per-space-color-scheme.md) to include
high-contrast options.

## Design

### Scheme Values Extension

The `ColorScheme` type from
[chat-per-space-color-scheme](chat-per-space-color-scheme.md) is extended:

```js
/**
 * @typedef {'auto' | 'light' | 'dark' | 'high-contrast-light' | 'high-contrast-dark'} ColorScheme
 */
```

The `'auto'` value now also respects `prefers-contrast: more` in
combination with `prefers-color-scheme`.

### High Contrast Adjustments

High contrast mode makes the following changes relative to the
corresponding base scheme:

| Property | Standard | High Contrast |
|----------|----------|---------------|
| Borders | 1px subtle gray | 2px solid, higher contrast |
| Text contrast ratio | >= 4.5:1 (AA) | >= 7:1 (AAA) |
| Focus rings | 3px accent glow | 3px solid outline + offset |
| Muted text | Low contrast | Medium contrast (still distinguishable) |
| Hover states | Background tint | Background tint + border |
| Shadows | Soft blurs | Replaced with solid borders |
| Backdrop | Semi-transparent | Higher opacity |

### CSS Structure

```css
/* High contrast light */
@media (prefers-contrast: more) {
  :root:not([data-scheme]) {
    --border-color: #495057;
    --border-light: #868e96;
    --text-muted: #495057;
    --shadow-sm: none;
    --shadow-md: none;
    --shadow-lg: none;
    /* ... */
  }
}

/* Explicit high contrast */
:root[data-scheme="high-contrast-light"] {
  /* same overrides */
}

/* High contrast dark (combined media query) */
@media (prefers-color-scheme: dark) and (prefers-contrast: more) {
  :root:not([data-scheme]) {
    --border-color: #6b7078;
    --text-muted: #a1a5ab;
    /* ... */
  }
}

:root[data-scheme="high-contrast-dark"] {
  /* dark values + high contrast overrides */
}
```

### Per-Space Scheme Picker

The segmented control from
[chat-per-space-color-scheme](chat-per-space-color-scheme.md) gains two
additional options, presented as a second row or as a dropdown for the
extended choices:

```
  Color scheme
  [ Auto ] [ Light ] [ Dark ]
  [ ] High contrast
```

A checkbox beneath the segmented control toggles high contrast
independently of the light/dark choice.
When checked, the stored scheme becomes `'high-contrast-light'` or
`'high-contrast-dark'` respectively.
When the base scheme is `'auto'`, the checkbox is hidden (system
`prefers-contrast` governs).

## Implementation

### Step 1: Define High Contrast Token Values

For each of light and dark, define the adjusted custom property values
that meet WCAG AAA (7:1) contrast ratios for text and meaningful
boundaries for interactive elements.

### Step 2: Add CSS Selectors

Add `@media (prefers-contrast: more)` blocks and `data-scheme` attribute
selectors for the high-contrast variants.

### Step 3: Replace Shadows with Borders

In high contrast mode, replace all `box-shadow` usage with solid borders.
This ensures elevation cues remain visible without relying on subtle
transparency.

### Step 4: Update Scheme Picker

Add the high contrast checkbox to the add/edit space modal.
Update `validateSpaceConfig` to accept the new scheme values.

## Files

### Modified

- `packages/chat/index.css`:
  - Add high-contrast light and dark variable blocks
  - Add `@media (prefers-contrast: more)` rules
  - Add `data-scheme` selectors for explicit high-contrast
- `packages/chat/spaces-gutter.js`:
  - Update `ColorScheme` typedef
  - Update `validateSpaceConfig` for new values
  - Update `applyScheme` to set `data-scheme` attribute
- `packages/chat/add-space-modal.js`:
  - Add high-contrast checkbox to scheme picker

## Testing

1. Enable "Increase contrast" in macOS Accessibility — verify auto mode
   activates high contrast
2. Verify all text meets WCAG AAA (7:1) contrast ratio in high contrast
3. Verify focus indicators are visible without color dependence
4. Verify modals and dropdowns have solid borders instead of shadows
5. Verify per-space high contrast selection persists and applies
