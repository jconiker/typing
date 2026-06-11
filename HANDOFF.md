# HANDOFF — resume notes for the next session
_Updated 2026-06-11 · KeyQuest (typing) · local (Mac)_

**Start here:** check git sync (Claude does all git — sync at start, push at end), then read
this, then `CLAUDE.md`.

## Where things stand
- Version **1.2.1**; service-worker cache **keyquest-v13**. Single source of version:
  `js/version.js` (`window.APP_VERSION`); keep the `?v=` query strings in `index.html` +
  `about.html` and `CACHE_NAME` in `sw.js` in lockstep when bumping.
- Pushed to `github.com/ConikerSystems/typing` (origin/main). Hosted at
  `conikersystems.github.io/typing/`.

## What we did (recent sessions)
- Adopted the Simpli Piano **web-app standard**: `js/version.js`; footer
  `© <year> Coniker Systems™ · v<version>` (auto-year, stamped by `stampVersion()` in
  `js/app.js`); in-app **🔄 Update** button (`updateApp()`); feedback email →
  `info@conikersystems.com`; standalone `about.html` (Coniker standard) + `keyquest-about.pdf`.
- **Tap-to-unlock**: tapping a locked lesson confirms, then unlocks just that one and continues
  forward on the normal path. Lives in `js/app.js`: `forceUnlocked` map in per-profile progress
  (`loadProgress`), honored by `isLessonUnlocked()`, set by `unlockLesson()`, wired in
  `createLessonCard()`. Exams keep their normal gating.
- **About → Download PDF** now does a real file download (blob → `<a download>`, saves to
  Files/Downloads); **Share** sends the link via the share sheet (desktop copies it); no `sms:`.
- Fixed the About page not scrolling on the standalone page (`<html class="about-doc">` +
  override in `css/app.css`, since the base stylesheet pins `html/body` to `overflow:hidden`).

## Unfinished / in progress
- None blocking.

## Next steps
- If About copy changes, regenerate `keyquest-about.pdf` (headless Chrome `--print-to-pdf` of
  `about.html`, served from the typing/ folder — watch the print CSS / no box-shadow).
- Axis & Allies still needs the web-app-standard treatment (separate program, Vite/React).

## How to run / test
- Serve locally from `typing/`: `python3 -m http.server 8820 --directory .` → open
  `http://localhost:8820/`. The service worker is intentionally disabled on localhost.
- Or use the Claude Code preview config **`keyquest`** in `.claude/launch.json` (Hub root) for
  eval/screenshotting.
