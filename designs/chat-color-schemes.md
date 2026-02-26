# Chat Color Schemes

| | |
|---|---|
| **Date** | 2026-02-26 |
| **Author** | Kris Kowal (prompted) |
| **Status** | Not Started |

## Motivation

The Chat application currently uses a hardcoded light color scheme.
This makes the application uncomfortable in low-light environments and
inconsistent with the broader Endo project's visual identity on endojs.org.

**Goals:**

1. Parameterize all colors in `index.css` using CSS custom properties
2. Introduce a dark mode scheme derived from the endojs.org palette
3. Respect the user's system preference via `prefers-color-scheme`
4. Preserve the existing light theme as the default

## Current State

### Existing CSS Custom Properties (`:root`)

The stylesheet already defines semantic custom properties for the light theme:

| Variable | Value | Semantic Role |
|----------|-------|---------------|
| `--bg-primary` | `#ffffff` | Main content background |
| `--bg-secondary` | `#f8f9fa` | Chat bar, headers, hints |
| `--bg-sidebar` | `#f1f3f5` | Inventory sidebar background |
| `--bg-hover` | `#e9ecef` | Hover state backgrounds |
| `--bg-active` | `#dee2e6` | Active/pressed backgrounds, gutter |
| `--text-primary` | `#212529` | Primary body text |
| `--text-secondary` | `#495057` | Secondary labels, descriptions |
| `--text-muted` | `#868e96` | Placeholders, hints, separators |
| `--accent-primary` | `#228be6` | Links, focus rings, interactive elements |
| `--accent-hover` | `#1c7ed6` | Accent hover state |
| `--accent-light` | `#e7f5ff` | Accent backgrounds, token chips, focus glow |
| `--border-color` | `#dee2e6` | Primary borders |
| `--border-light` | `#e9ecef` | Subtle borders between sections |
| `--shadow-sm` | `0 1px 2px rgba(0,0,0,0.05)` | Subtle elevation |
| `--shadow-md` | `0 4px 6px rgba(0,0,0,0.07)` | Medium elevation |
| `--shadow-lg` | `0 10px 25px rgba(0,0,0,0.1)` | Modals, dropdowns |

### Hardcoded Colors Requiring Parameterization

The stylesheet contains approximately 94 hardcoded color values outside
of `:root`.
These fall into the following semantic categories:

#### Error / Danger (reds)

| Hardcoded Value | Occurrences | Usage |
|-----------------|-------------|-------|
| `#e03131` | 5 | Badge backgrounds, delete menu text, error borders |
| `#c92a2a` | 5 | Error tooltip backgrounds, error arrow |
| `#e53e3e` | 3 | Dismiss button, eval error text |
| `#dc2626` | 2 | Rejected status badge, rejection reason |
| `#b91c1c` | 1 | Reject button hover |
| `#fff5f5` | 1 | Error background tint |
| `#ffc9c9` | 1 | Error border tint |
| `#fca5a5` | 1 | Rejection reason in sent messages |
| `rgba(224,49,49,0.1)` | 2 | Delete hover, error background |
| `rgba(224,49,49,0.3)` | 1 | Error border |

**Proposed variables:**

- `--danger` — primary error/danger color (`#e03131` light, `#f87171` dark)
- `--danger-hover` — hover state for danger actions
- `--danger-bg` — tinted background for error states
- `--danger-border` — border for error states

#### Success (greens)

| Hardcoded Value | Occurrences | Usage |
|-----------------|-------------|-------|
| `#059669` | 2 | Granted status, grant button hover |
| `#37b24d` | 2 | Selected message badge, bigint syntax |

**Proposed variables:**

- `--success` — primary success color
- `--success-hover` — hover state

#### Message Bubbles

Messages define their own local custom properties (`--bubble-*`),
but these are set to hardcoded values:

| Variable | Received | Sent |
|----------|----------|------|
| `--bubble-fg` | (inherits `--text-primary`) | `#ffffff` |
| `--bubble-bg` | (inherits `--bg-secondary`) | `#3b82f6` |
| `--bubble-border` | (inherits `--border-light`) | `#2563eb` |
| `--bubble-muted` | (inherits `--text-muted`) | `rgba(255,255,255,0.7)` |
| `--bubble-chip-fg` | `#ffffff` | `#ffffff` |
| `--bubble-chip-bg` | `#3b82f6` | `rgba(255,255,255,0.2)` |
| `--bubble-code-bg` | `#e9ecef` | `rgba(255,255,255,0.9)` |
| `--bubble-code-fg` | `#24292f` | `#24292f` |
| `--bubble-code-inline-bg` | `rgba(0,0,0,0.08)` | `rgba(255,255,255,0.2)` |

**Proposed:** Move the received-message defaults into `:root` as
scheme-aware custom properties.
The sent-message overrides can remain as-is since they are
designed to work on a saturated blue background regardless of scheme.

#### Code Syntax Highlighting

| Hardcoded Value | Usage |
|-----------------|-------|
| `#cf222e` | Keywords |
| `#0a3069` | Strings |
| `#6e7781` | Comments |
| `#0550ae` | Numbers |
| `#e9ecef` | Code fence background |
| `#24292f` | Code fence text |

**Proposed variables:**

- `--code-bg` — code block background
- `--code-fg` — code block text
- `--code-keyword` — keyword color
- `--code-string` — string color
- `--code-comment` — comment color
- `--code-number` — number color

#### Tooltips and Popups

| Hardcoded Value | Usage |
|-----------------|-------|
| `#2d3748` | Tooltip/popup background |
| `#f7fafc` | Tooltip text |

**Proposed variables:**

- `--tooltip-bg` — tooltip/popup background
- `--tooltip-fg` — tooltip/popup text

#### Badges and Indicators

| Hardcoded Value | Usage |
|-----------------|-------|
| `#000000` | Message number badge, shortcut badge bg |
| `#ffffff` | Badge text |

**Proposed:** Use `--tooltip-bg` / `--tooltip-fg` for these
(same visual role: small overlays on contrasting backgrounds).

#### Backdrops

| Hardcoded Value | Occurrences | Usage |
|-----------------|-------------|-------|
| `rgba(0,0,0,0.4)` | 3 | Modal backdrops |
| `rgba(0,0,0,0.5)` | 2 | Eval/counter-proposal backdrops |

**Proposed variable:**

- `--backdrop` — modal/dialog backdrop overlay

#### Button Colors

| Hardcoded Value | Usage |
|-----------------|-------|
| `#3b82f6` | Grant proposal from-badge fallback |
| `#2563eb` | Show-result button hover |

**Proposed:** Use `--accent-primary` and `--accent-hover` which already
serve this role.

#### Active Conversation Highlight

Several rules under `.pet-item-wrapper.active-conversation` use
`white` and `rgba(255,255,255,...)` because the active row has a
blue accent background.
These are analogous to the sent-message bubble and can remain
hardcoded since they are designed against `--accent-primary`.

### Summary of New Variables

The following new custom properties are needed beyond the existing set:

```css
:root {
  /* Existing (to be made scheme-aware) */
  --bg-primary: ...;
  --bg-secondary: ...;
  --bg-sidebar: ...;
  --bg-hover: ...;
  --bg-active: ...;
  --text-primary: ...;
  --text-secondary: ...;
  --text-muted: ...;
  --accent-primary: ...;
  --accent-hover: ...;
  --accent-light: ...;
  --border-color: ...;
  --border-light: ...;
  --shadow-sm: ...;
  --shadow-md: ...;
  --shadow-lg: ...;

  /* New */
  --danger: ...;
  --danger-hover: ...;
  --danger-bg: ...;
  --danger-border: ...;
  --success: ...;
  --success-hover: ...;
  --code-bg: ...;
  --code-fg: ...;
  --code-keyword: ...;
  --code-string: ...;
  --code-comment: ...;
  --code-number: ...;
  --tooltip-bg: ...;
  --tooltip-fg: ...;
  --backdrop: ...;
  --bubble-code-bg: ...;
  --bubble-code-fg: ...;
  --bubble-code-inline-bg: ...;
  --bubble-chip-fg: ...;
  --bubble-chip-bg: ...;
}
```

## Dark Mode Color Scheme

The dark scheme is derived from the endojs.org brand palette:

- **Brand burgundy:** `#BB2D40` — used for accent/link color
- **Brand gradient:** `#fb923c` to `#f87171` — warm orange-to-coral
- **Button dark:** `#32373c` — used for dark UI elements

### Proposed Dark Values

```css
@media (prefers-color-scheme: dark) {
  :root {
    /* Backgrounds - warm dark grays, not pure black */
    --bg-primary: #1a1b1e;
    --bg-secondary: #212226;
    --bg-sidebar: #18191c;
    --bg-hover: #2c2d31;
    --bg-active: #35363b;

    /* Text - off-whites for reduced glare */
    --text-primary: #e1e3e6;
    --text-secondary: #a1a5ab;
    --text-muted: #6b7078;

    /* Accent - brand burgundy from endojs.org */
    --accent-primary: #d4455a;
    --accent-hover: #BB2D40;
    --accent-light: rgba(187, 45, 64, 0.15);

    /* Borders */
    --border-color: #2e2f33;
    --border-light: #262729;

    /* Shadows - deeper in dark mode */
    --shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.3);
    --shadow-md: 0 4px 6px rgba(0, 0, 0, 0.4);
    --shadow-lg: 0 10px 25px rgba(0, 0, 0, 0.5);

    /* Danger - warmer reds that read well on dark backgrounds */
    --danger: #f87171;
    --danger-hover: #ef4444;
    --danger-bg: rgba(248, 113, 113, 0.1);
    --danger-border: rgba(248, 113, 113, 0.25);

    /* Success */
    --success: #4ade80;
    --success-hover: #22c55e;

    /* Code - dark editor theme */
    --code-bg: #141517;
    --code-fg: #e1e3e6;
    --code-keyword: #f87171;
    --code-string: #fb923c;
    --code-comment: #6b7078;
    --code-number: #60a5fa;

    /* Tooltips/badges - inverted from dark-on-light to light-on-dark */
    --tooltip-bg: #e1e3e6;
    --tooltip-fg: #1a1b1e;

    /* Backdrop - slightly lighter to distinguish from bg */
    --backdrop: rgba(0, 0, 0, 0.6);

    /* Message bubble defaults (received) */
    --bubble-code-bg: #141517;
    --bubble-code-fg: #e1e3e6;
    --bubble-code-inline-bg: rgba(255, 255, 255, 0.08);
    --bubble-chip-fg: #ffffff;
    --bubble-chip-bg: #d4455a;
  }
}
```

### Color Rationale

| Role | Light | Dark | Rationale |
|------|-------|------|-----------|
| Accent | `#228be6` (blue) | `#d4455a` (burgundy) | Brand color from endojs.org links (`#BB2D40`), lightened for dark bg contrast |
| Code strings | `#0a3069` | `#fb923c` | Orange from endojs.org brand gradient |
| Code keywords | `#cf222e` | `#f87171` | Coral from endojs.org brand gradient |
| Code numbers | `#0550ae` | `#60a5fa` | Lightened blue for contrast |
| Backgrounds | Cool grays | Warm dark grays | Warm tones complement the burgundy/coral accent palette |
| Danger | Various reds | `#f87171` | Uses the brand coral; lighter reds read better on dark |
| Tooltips | Dark on light | Light on dark | Inverted for contrast in each scheme |

### Sent Message Bubbles

The sent-message bubble uses `#3b82f6` (blue) with white text.
In dark mode, this should shift to use the brand burgundy accent:

```css
@media (prefers-color-scheme: dark) {
  .message.sent {
    --bubble-bg: #BB2D40;
    --bubble-border: #9e2436;
    --bubble-chip-bg: rgba(255, 255, 255, 0.2);
  }
}
```

This makes sent messages visually consistent with the brand while
maintaining the light-on-saturated pattern for readability.

## Implementation

### Step 1: Add New Custom Properties to Light Theme

Add the new semantic variables to `:root` with light-mode values.
Replace all hardcoded color references with the corresponding variable.

This step is purely mechanical and should produce no visual change.

### Step 2: Add Dark Theme Media Query

Add the `@media (prefers-color-scheme: dark)` block at the end of
`index.css` with the dark values listed above.

### Step 3: Override Sent Bubble Colors

Add the dark-mode sent-message overrides within the media query.

### Step 4: Handle Monaco Editor Theme

The eval form embeds Monaco in an iframe.
The iframe must detect the color scheme and load a dark editor theme.
This requires passing a `theme` query parameter or using
`matchMedia('(prefers-color-scheme: dark)')` inside the iframe's
initialization.

## Files

### Modified

- `packages/chat/index.css`:
  - Add new custom properties to `:root`
  - Replace ~94 hardcoded color values with `var(--*)` references
  - Add `@media (prefers-color-scheme: dark)` block
- `packages/chat/monaco-iframe-main.js`:
  - Detect color scheme and set Monaco theme to `'vs-dark'`

## Testing

1. Verify light mode is visually unchanged after Step 1
2. Toggle macOS Appearance to Dark and verify dark mode renders
3. Verify error states (red badges, error tooltips) are legible in both modes
4. Verify code syntax highlighting contrast in both modes
5. Verify modal backdrops and tooltips in both modes
6. Verify Monaco editor theme switches with system preference

## Future Enhancements

1. **Manual toggle** — A button in the UI to override the system preference,
   stored in the host's pet-store alongside spaces configuration
2. **Per-space themes** — Allow each space to define its own accent color
3. **High contrast mode** — An accessibility-oriented scheme with stronger
   borders and larger contrast ratios
