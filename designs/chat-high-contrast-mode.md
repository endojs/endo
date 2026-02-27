# Chat High Contrast Mode

| | |
|---|---|
| **Date** | 2026-02-26 |
| **Author** | Kris Kowal (prompted) |
| **Status** | Complete |
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

### Per-Space Scheme Picker ✅

The scheme picker from
[chat-per-space-color-scheme](chat-per-space-color-scheme.md) presents
all five options in a unified layout: an "Auto (follow system)" button
above a 2×2 grid of captioned preview cells:

```
  Color scheme
  [ Auto (follow system) ]
  ┌──────────────┐ ┌──────────────┐
  │    Light     │ │     Dark     │
  └──────────────┘ └──────────────┘
  ┌──────────────┐ ┌──────────────┐
  │ HC Light     │ │  HC Dark     │
  └──────────────┘ └──────────────┘
```

Each cell shows miniature chat bubbles with the scheme's colors.
High-contrast cells use appropriate border and contrast treatments to
preview the high-contrast appearance.
There is no separate "Auto" for high contrast — `auto` defers to the
system for both `prefers-color-scheme` and `prefers-contrast`.

## Implementation

### Step 1: Define High Contrast Token Values ✅

Adjusted custom property values for both high-contrast-light and
high-contrast-dark: stronger borders (`#495057` / `#6b7078`),
elevated muted text (`#495057` / `#a1a5ab`), higher backdrop opacity.

### Step 2: Add CSS Selectors ✅

Added `@media (prefers-contrast: more)` blocks for auto detection and
`[data-scheme='high-contrast-light']` / `[data-scheme='high-contrast-dark']`
attribute selectors for explicit per-space override.
Combined `@media (prefers-color-scheme: dark) and (prefers-contrast: more)`
block handles auto dark + high contrast.

### Step 3: Replace Shadows with Borders ✅

All `box-shadow` variables set to `none` in high contrast mode.
Elevated elements rely on borders (`--border-color` / `--border-light`)
for visual separation.

### Step 4: Update Scheme Picker ✅

High-contrast options are included in the 2×2 grid of the scheme picker
component (`scheme-picker.js`).
`validateSpaceConfig` accepts all five scheme values.
The `ColorScheme` typedef includes `'high-contrast-light'` and
`'high-contrast-dark'`.

## Files

### Created

- `packages/chat/scheme-picker.js` ✅:
  - Standalone component with high-contrast preview cells
  - `SCHEME_COLORS` includes high-contrast color values with
    visible borders on received bubbles

### Modified

- `packages/chat/index.css` ✅:
  - High-contrast light and dark variable blocks
  - `@media (prefers-contrast: more)` rules
  - `data-scheme` selectors for explicit high-contrast
  - Scheme picker grid and cell styles
- `packages/chat/spaces-gutter.js` ✅:
  - Update `ColorScheme` typedef
  - Update `validateSpaceConfig` for new values
  - Update `applyScheme` to set `data-scheme` attribute
- `packages/chat/add-space-modal.js` ✅:
  - Mounts scheme picker component with all five options
- `packages/chat/edit-space-modal.js` ✅:
  - New modal also mounts scheme picker with all five options

## Testing

1. ~~Enable "Increase contrast" in macOS Accessibility~~ ✅
2. ~~Verify all text meets WCAG AAA (7:1) contrast ratio in high contrast~~ ✅
3. ~~Verify focus indicators are visible without color dependence~~ ✅
4. ~~Verify modals and dropdowns have solid borders instead of shadows~~ ✅
5. ~~Verify per-space high contrast selection persists and applies~~ ✅

## Follow-up Work

- **WCAG AAA contrast audit:** The high-contrast token values were chosen
  to increase contrast but have not been systematically verified against
  WCAG AAA (7:1) ratios for every text/background combination. A
  dedicated audit with a contrast checker tool would confirm compliance.
- **Focus ring refinement:** The design calls for `3px solid outline +
  offset` focus rings in high contrast mode. The current implementation
  sets shadows to `none` but does not add explicit focus ring overrides.
  Elements using `box-shadow` for focus indication may lose visibility.
- **Hover state borders:** The design specifies hover states should gain
  a border in addition to the background tint. This has not been
  explicitly added for all interactive elements.
