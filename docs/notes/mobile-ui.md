# Phone layout: plan

The owner, 2026-10-14: "We want to start working on a mobile UI. It can't work like the desktop one. It needs to be more compact. Each page should be a full layout with no wasted space, and nav buttons should be only visible when called on. Compact menus are key."

## How it works

- **When:** `look-boot.js` puts `data-phone` on `<html>` on a phone (narrower than 640px, or a touch screen under 500px tall, so a phone on its side too). Look → Page → **Phone layout** can set it to Always or Never instead. It switches live when the phone turns.
- **Styles:** `mobile.css`, loaded after `themes.css`. Every rule starts with `:root[data-phone]`, so the desktop page can't change by accident (a test checks this). It overrides the page layouts, including the App layout's bottom tabs.
- **Behaviour:** `phone.js`.
  - **☰** (top right corner, always there) opens the top bar as a sheet from the bottom: who you are, the pages as tiles, then Dice, Rest, Settings, Look, password, log out. Choosing anything closes it; so do tapping outside it and Escape.
  - **`phoneMenu(bar, { keep })`** folds a toolbar into a **⋯** button: the bar's children matching `keep` stay in the row, the rest move into a list inside the bar (`display: contents` off a phone, so the desktop page doesn't change) that ⋯ opens from the bottom, with a Close button. Same buttons, so their handlers and ids keep working.
  - **`phoneSheet(box, button)`** opens a bar that already floats (the map's tools) as the sheet itself, without moving anything.
  - One menu is open at a time.
- **Pages fill the screen** (`100dvh`), with small margins. The first row of each page leaves room for ☰ on its right.
- **Nothing beside the map on a phone** (`besidePanel()` returns null there).
- No text box gets focus by itself on a phone (it would pop the keyboard up).

## Order

Each stage is one PR, merged when `npm test` is green, with real-phone checks added to HANDOFF's "Checks to run in VS Code".

1. **Shell, Ask, Notes, Handouts** (done 2026-10-14). ☰ menu, ⋯ menus, Look option. Ask: the chat's pin, rename, delete and New chat in ⋯; one-line question box that grows as you type. Notes: the box and Save in one row. Handouts: tighter cards. Pages not converted yet are left as they were, pushed below ☰.
2. **Sheet and Inventory** (done 2026-10-14). The sheet bar sticks to the top: Next d20 and the save status in the row, Review, Upload, Download, Print and Pop out in ⋯; tighter boxes (the sheet layout stays the player's choice under Look). Inventory: the item box and Add in one sticky row, Add by hand in ⋯.
3. **Map** (done 2026-10-14). The map fills the whole screen. Fit, Measure, Ping, Draw and Initiative (and any tool that's on) float in a row at the bottom; ⋯ opens every tool as a sheet (`phoneSheet()` on full screen's More button, nothing moved). The DM's fog and wall tools are strips that scroll sideways above it. The picked token's bar sits above the tools; the turn order under ☰. No Beside the map, Sheet window or Full screen on a phone. Pinch zoom still to check on a real phone.
4. **Dice and dialogs** (done 2026-10-14). Every dialog except the map creator is a full-width sheet from the bottom, its buttons in a row that stays at the bottom. The dice tray comes up from the bottom without the keyboard tips, and doesn't focus its text box.
5. **The DM's pages:** Creatures, Items, Merchants, Archivist (search and New in the row, the rest in ⋯; cards in one column). The map creator stays a big-screen tool (it says so on a phone).
6. **Login, campaign picker, password, admin screen.**

## Not doing (unless asked)

- A separate phone app or a second set of pages: it is the same page, styled and arranged differently.
- Swipe gestures between pages.
