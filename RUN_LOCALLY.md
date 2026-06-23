# Run locally (2 minutes)

This is the Network Intelligence **TPRM** platform. It runs fully offline for the
demo — **no API key or database needed**.

## Prerequisites
- **Node.js 20+** (developed on Node 22) — https://nodejs.org
- That's it. No Docker, no Postgres, no API key required for the demo.

## Steps
```bash
cd web
npm install      # one-time, downloads dependencies
npm run dev      # starts the app
```
Then open **http://localhost:3000** in your browser.

## Sign in (demo accounts — password is `demo` for all)
| Username | Role | Lands on |
|----------|------|----------|
| `root`   | Root Administrator | /admin |
| `dbs`    | Assessor | /console |
| `apex`   | Vendor | /vendor |
| `viewer` | Audit Viewer | /admin (read-only) |

## Try it
- **Assessor** (`dbs`): open the console, pick the demo vendor, click **Adjudicate**
  on a control, or **Run AI on all controls**. View the **Changelog** (header link).
- **Vendor** (`apex`): answer a question (it autosaves), attach evidence, **Submit**.
- **Root** (`root`): Admin → Processing engine / Users / Audit log.

## Notes
- The demo uses the free **Static** engine by default — no API key needed. To use
  live cloud AI (Claude / OpenAI / Grok / Gemini), sign in as `root` →
  **Admin → Processing engine**, pick a provider and paste a token.
- Data is stored locally under `web/.data/` (gitignored). Delete that folder to reset.
- **If the page ever looks broken or unstyled** (e.g. after an earlier run), it's a
  cached page — do a hard refresh: **Ctrl+Shift+R** (Windows/Linux) or
  **Cmd+Shift+R** (Mac), or open it in a private/incognito window.

## Stop
Press **Ctrl+C** in the terminal running `npm run dev`.
