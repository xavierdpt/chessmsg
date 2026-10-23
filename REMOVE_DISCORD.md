# Removing the Discord links

## Goal

Remove every Discord entry point from chessmsg: the Discord button next to
**Share**, the widget popup it opens, the invite-link mode, and the related
preferences. After the change the app should have no outbound links to
`discord.com` or `discord.gg`, and the Share button should fill the bottom row
on its own.

## Current state

The Discord feature lives in two files.

### `index.html`

| Lines (approx.) | What | Action |
|---|---|---|
| 197–221 | `#discord` button styles (blurple background, hover, focus ring, SVG size) | Delete |
| 222–279 | `.discord-popup`, `.discord-card`, `.discord-title`, `.discord-frame-wrap`, `#discord-frame`, `.discord-fallback`, `.discord-close` styles | Delete |
| 297–303 | `<button id="discord">` with the inline Discord logo SVG, inside `#share-row` | Delete |
| 315–332 | `<div id="discord-popup">` dialog containing the `discord.com/widget` iframe, fallback text and Close button | Delete |

### `script.js`

| Lines (approx.) | What | Action |
|---|---|---|
| 23–25 | `PREFS.DISCORD_BUTTON_MODE`, `PREFS.DISCORD_INVITE_SLUG`, `PREFS.DISCORD_WIDGET_ID` | Delete |
| 905–929 | `openDiscordPopup()`: builds the `https://discord.com/widget?id=…` iframe URL | Delete |
| 931–937 | `closeDiscordPopup()` | Delete |
| 939–977 | `initDiscord()`: wires up `"invite"` mode (`https://discord.gg/<slug>`) or `"widget"` mode, plus the Escape-key and backdrop-click handlers | Delete |
| 991 | `initDiscord();` call inside `init()` | Delete |

## Steps

1. **HTML markup:** remove the `#discord` button from `#share-row` and the
   whole `#discord-popup` dialog.
2. **CSS:** remove all `#discord*` and `.discord-*` rules.
3. **JavaScript:** remove the three `DISCORD_*` prefs, the three Discord
   functions, and the `initDiscord()` call in `init()`.
4. **Layout check:** `#share-row` is a flex row and `#share` already uses
   `flex: 1 1 auto`, so Share should stretch to the full width with no CSS
   changes. Confirm this visually.

## Verification

- `grep -rni discord index.html script.js` returns nothing.
- The page loads with no console errors (in particular, no `null` errors from
  removed elements).
- The bottom row shows only the Share button, at full width, on mobile and
  desktop.
- Share still works: it is disabled until there is a move, then shares the URL.
- The Escape key still behaves as before in other dialogs (the promotion popup
  is unaffected; it had no Discord-specific handling).

## Notes

- The Discord widget iframe was the only third-party iframe. Removing it also
  removes a request to `discord.com` whenever the popup was opened.
- Nothing else references the Discord server (no README or footer links), so
  this is the full scope.
- Revert path: everything is self-contained in the sections above, so
  `git revert` of the removal commit restores the feature cleanly.
