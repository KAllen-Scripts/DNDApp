# Phone layout: plan

The owner, 2026-10-14: "We want to start working on a mobile UI. It can't work like the desktop one. It needs to be more compact. Each page should be a full layout with no wasted space, and nav buttons should be only visible when called on. Compact menus are key."

## How it works

- **When:** `look-boot.js` puts `data-phone` on `<html>` on a phone (narrower than 640px, or a touch screen under 500px tall, so a phone on its side too). Look → Page → **Phone layout** can set it to Always or Never instead. It switches live when the phone turns.
- **Styles:** `mobile.css`, loaded after `themes.css`. Every rule starts with `:root[data-phone]`, so the desktop page can't change by accident (a test checks this). It overrides the page layouts, including the App layout's bottom tabs.
- **Behaviour:** `phone.js`.
  - **☰** (top right corner, always there) opens the top bar as a sheet from the bottom: who you are, the pages as tiles, then Dice, Rest, Settings, Look, password, log out. Choosing anything closes it; so do tapping outside it and Escape.
  - **`phoneMenu(bar)`** folds a toolbar into a **⋯** button: only the bar's children marked `.phone-keep` stay in the row, and ⋯ opens the rest as a list from the bottom. Same buttons, only shown differently, so their handlers and ids keep working.
  - One menu is open at a time.
- **Pages fill the screen** (`100dvh`), with small margins. The first row of each page leaves room for ☰ on its right.
- **Nothing beside the map on a phone** (`besidePanel()` returns null there).
- No text box gets focus by itself on a phone (it would pop the keyboard up).

## Order

Each stage is one PR, merged when `npm test` is green, with real-phone checks added to HANDOFF's "Checks to run in VS Code".

1. **Shell, Ask, Notes, Handouts** (done 2026-10-14). ☰ menu, ⋯ menus, Look option. Ask: the chat's pin, rename, delete and New chat in ⋯; one-line question box that grows as you type. Notes: the box and Save in one row. Handouts: tighter cards. Pages not converted yet are left as they were, pushed below ☰.
2. **Sheet and Inventory** (players use them most at the table). The sheet bar (Review, Upload, Download, Print, Pop out) into ⋯ with Next d20 kept in the row; the sheet in one column with tighter boxes, or the Tabs layout by default on a phone; Inventory's add row on one line.
3. **Map.** The map fills the whole screen. The tools become a small floating row (the main ones) plus ⋯ for the rest; the DM's set-up tools (fog, walls) in their own ⋯ sheet; the picked token's bar and the turn order as small sheets from the bottom. Pinch zoom checked on a real phone.
4. **Dice and dialogs.** The dice tray, Rest, Settings, Look, shop and item dialogs as full-width sheets from the bottom.
5. **The DM's pages:** Creatures, Items, Merchants, Archivist (search and New in the row, the rest in ⋯; cards in one column). The map creator stays a big-screen tool (it says so on a phone).
6. **Login, campaign picker, password, admin screen.**

## Not doing (unless asked)

- A separate phone app or a second set of pages: it is the same page, styled and arranged differently.
- Swipe gestures between pages.
