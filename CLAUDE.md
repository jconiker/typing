# KeyQuest (typing) — repo notes

**At session start:** check git sync, then read **`HANDOFF.md`** for where we left off.

This program follows the **Coniker Hub conventions**: Claude does all git (sync at start, push
when done); local/private data stays on the Mac (never pushed); web apps follow the shared
WEB_APP_STANDARDS — PWA + offline service worker, single-source version, in-app **🔄 Update**
button, `© <year> Coniker Systems™ · v<version>` footer, Coniker-standard About page, and never
trap a standalone (home-screen) app with top-level navigation.

KeyQuest specifics: vanilla **static PWA**, no build step. Version is single-sourced in
`js/version.js` — bump it **and** the `?v=` query strings in `index.html`/`about.html` **and**
`CACHE_NAME` in `sw.js` together on every deploy. Lessons gate sequentially (≥1 star unlocks the
next); a locked lesson can be **tapped to unlock** it (`forceUnlocked` map in `js/app.js`).
