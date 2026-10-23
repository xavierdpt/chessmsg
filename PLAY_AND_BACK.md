# Play and Back buttons

## Goal

Right now the only thing you can do with a selected move is **Share** it: the
URL gets the move appended and goes to the opponent. We want to be able to
explore locally as well:

- **Play** applies the selected move on the board, and the app continues
  from the new position, with the other side to move.
- **Back** undoes the last move and returns to the previous position.

**Share** keeps working as it does now. It always shares the current position
plus the selected move.

## UI

The bottom row (`#share-row`) becomes three buttons:

```
[ ← Back ][   Play   ][   Share   ]
```

- **Back**: narrow (48px, like the old Discord button), shows an arrow icon,
  with `aria-label="Back"`. Disabled when there is no move to undo (`san` is
  empty).
- **Play**: same flexible width as Share, styled as a secondary button
  (outlined or neutral) so that Share stays the main action. Disabled when no
  move is selected (`!pickedSan`).
- **Share**: unchanged.

`updateShare()` becomes `updateActions()` and sets the disabled state of all
three buttons. `rerender()` already calls it, so the buttons always reflect the
current state.

## Behavior

### Current state model (`script.js`)

- `san`: the moves played so far (from `?san=` in the URL).
- `baseChess`: a chess.js instance at the position after `san`.
- `chess`: a copy of `baseChess`.
- `pickedSan`: the selected candidate move, or `null`.
- `rowData`: the legal moves in `baseChess`, each with an engine `label` that
  Stockfish fills in one move at a time.
- `sourceSq`: the source square of a square-tap selection that is in progress.

Everything derives from `san` (orientation, legal moves, engine queue), so Play
and Back only need to change `san` and then rebuild the derived state.

### New helper: `setPosition(newSan, selected)`

```js
function setPosition(newSan, selected) {
  san = newSan;
  baseChess = new Chess();
  replaySan(baseChess, san);
  chess = new Chess(baseChess.fen());
  pickedSan = selected || null;
  sourceSq = null;
  hidePromotionPopup();
  posGen++;               // invalidates in-flight engine work (see below)
  loadMoveRows();
  syncUrl();
  rerender();
  pumpQueue();
}
```

### Play

```js
function doPlay() {
  if (!pickedSan) return;
  setPosition(san.concat([pickedSan]), null);
}
```

After Play:
- The board is flipped automatically, because orientation follows
  `baseChess.turn()`. This is the right behavior for pass-and-play. It also
  matches how the opponent sees the position when they open a shared link.
- The move list is rebuilt for the new side, and Stockfish starts evaluating
  the new candidates.
- Nothing is selected.

### Back

```js
function doBack() {
  if (!san.length) return;
  const last = san[san.length - 1];
  setPosition(san.slice(0, -1), last);
}
```

The move that was undone stays **selected**: its arrow is drawn and its row
is highlighted. That makes Back followed by Play a no-op round trip, and it is
easy to choose a different move instead.

Back can go all the way to the initial position, including through moves that
came from a shared URL. That's intended: it lets the receiver look at the
history of the game.

### URL sync

`syncUrl()` calls `history.replaceState` with `?san=…` (using the same format
as `shareUrl()`), so that a reload keeps the current position. It uses
`replaceState`, not `pushState`, so the browser back button doesn't fight with
the in-app Back button and no `popstate` handling is needed.

`shareUrl()` keeps reading `san` and `pickedSan`, so it automatically shares
from the position you have played to.

## Engine: stale results

This is the subtle part. Stockfish analyzes one candidate at a time
(`pumpQueue` → `bestmove`). If the user presses Play or Back while a search is
running:

1. The `bestmove` that arrives belongs to the **old** position.
2. `handleEngineLine` matches results by SAN (`sfBusySan`), and the same SAN
   (for example `Nf3`) can be legal in the new position too. The old score
   would be attached to the wrong row.
3. `sfLastInfo` is normalized with `baseChess.turn()` when it arrives, so the
   sign could also be wrong.

Fix:
- Add `let posGen = 0;` and increment it in `setPosition`.
- In `pumpQueue`, record `sfBusyGen = posGen` when starting a search.
- In the `bestmove` branch, apply the label only if `sfBusyGen === posGen`.
  Otherwise, discard the result. In both cases, clear `sfBusy` and call
  `pumpQueue()`.
- In `setPosition`, if `sfBusy`, send `sf.postMessage("stop")` so the stale
  search finishes quickly.

## Engine: score cache

Computed labels are cached in memory for as long as the page is open
(`scoreCache: Map<positionKey, Map<san, label>>`). The key is the first four
FEN fields (pieces, side to move, castling rights, en passant square), so the
move clocks are ignored and the same position reached by a different move
order also hits the cache. `loadMoveRows()` fills rows from the cache and sorts
them, and `pumpQueue()` only analyzes rows that still have no label, so going
back to a position that was already evaluated shows its scores right away and
starts no search. The cache is not persisted and is cleared on reload.

## Edge cases

- **Game over after Play** (checkmate or stalemate): `rowData` is empty, so
  Play and Share are disabled and Back is still enabled. Optionally, show
  "Checkmate" or "Stalemate" in `#engine-status`.
- **Promotion**: a promotion picked through the popup sets `pickedSan` like
  any other move, so Play needs no special handling. `setPosition` closes the
  popup if it is open.
- **Invalid `?san=` on load**: `init()` already resets to the start. `init()`
  can now call `setPosition(parseInitialSan(), null)`, with a fallback to `[]`
  if the replay fails.
- **Keyboard (optional)**: `ArrowLeft` → Back, `Enter` → Play, unless the
  promotion popup is open.

## Files to change

- `index.html`: add the `#back` and `#play` buttons to `#share-row`, and add
  their CSS (Back: 48px wide and square, like the old Discord button; Play:
  `flex: 1 1 auto` with a secondary style).
- `script.js`: add `posGen`, `setPosition`, `syncUrl`, `doPlay` and `doBack`;
  rename `updateShare` to `updateActions`; add the generation guard in
  `pumpQueue` and `handleEngineLine`; wire the click handlers in `init()`.

## Verification

- Start → select `e4` → Play: the board flips, Black's candidates are listed
  and evaluated, the URL is `?san=e4`, Back is enabled, and Play and Share
  are disabled.
- Back: returns to the start with `e4` selected and its arrow drawn, the URL
  has no `?san`, and Back is disabled.
- Press Play, then quickly press Back while evaluation is running: no scores
  from the wrong position appear, and evaluation restarts cleanly.
- Play a few moves, then Share: the shared URL contains all the played moves
  plus the selected one.
- Reload after playing a few moves: the same position is shown.
- Play into checkmate (for example the fool's mate `f3 e5 g4 Qh4#`): the list
  is empty, Play and Share are disabled, and Back works.
