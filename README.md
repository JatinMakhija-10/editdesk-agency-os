# EditDesk — Agency OS (Desktop + Anywhere iPhone App)

An owner-only operations & finance workspace for a video-editing / creative agency. Runs natively as a **Windows Electron Desktop App** with a local SQLite database AND syncs live with an installable **iPhone App (PWA)** hosted on Netlify — so you can add orders and record payments from iPhone on any network (even when your PC is off), or use local Wi-Fi when offline.

## Quick Launch (Windows Desktop)

1. Install dependencies once:
   ```bash
   npm install
   ```
2. Double-click **`EditDesk.bat`** (or run `npm run desktop`).
3. On a fresh clone, EditDesk initializes `data/editdesk.db` with a clean sample workspace (`2025` baseline + `SYN0001`–`SYN0012`). Your local database stays strictly in `data/editdesk.db` (gitignored so private agency financials are never pushed to GitHub).
4. **Import Existing Spreadsheet:** Click **Orders → Import CSV** (or **Settings → Import CSV**) to upload or paste either multi-section spreadsheets (`Client Income`, `Editor Payouts`, `Yearly`) or standard single-table CSVs. Matching `Project ID`s update idempotently without duplicates.
5. Closing the desktop window minimizes EditDesk to the **Windows System Tray** (toggleable in Settings).

## Use on iPhone From Anywhere (No Same Wi-Fi Needed)

1. Deploy this repo to **Netlify** (configured via `netlify.toml` + `netlify/functions/api.mjs` using `@netlify/blobs` + `sql.js`):
   - Set `EDITDESK_OWNER_PIN` and `EDITDESK_AUTH_SECRET` in Netlify Environment Variables (optional `GEMINI_API_KEY` / `OPENAI_API_KEY` for cloud AI parsing).
2. On your Windows Desktop App, open **Settings → Cloud sync (anywhere iPhone)**, enter your published Netlify URL and Owner PIN, turn on **Auto-sync**, and click **Push local → cloud**.
3. Open **Connect iPhone → Anywhere (Cloud Sync)**, scan the QR code on your iPhone over 4G/5G or any Wi-Fi, enter your Owner PIN once, and tap **Share → Add to Home Screen** in Safari.
4. Changes made on iPhone save directly to your private cloud store, and Desktop automatically syncs updates in the background (while keeping a local SQLite mirror in `data/editdesk.db`).
5. **Local Wi-Fi / Offline Mode:** Use the **Same Wi-Fi (Local)** tab in **Connect iPhone** anytime without cloud internet.

## Core Financial & Workflow Rules

- **Orders vs. Money:** Production stages (`New → Unassigned / Assigned → Editing → Internal review → Client review → Revisions → Approved → Delivered`) are completely independent of payment status (`Rate Pending`, `Unpaid`, `Partially paid`, `Paid`).
- **Lump-Sum Payments:** Record one client receipt and choose **Oldest first** or **Pick orders**. Any extra stays as **Unallocated Client Advance** ready to apply to future orders.
- **Editor Payouts:** Editor cost becomes payable only after **Editor work submitted** is checked. Payouts allocate oldest-first or across selected submitted jobs, and unallocated editor advances can be applied once work is submitted.
- **Separate Deadlines:** Production deadlines and invoice payment due dates are separate fields on Overview's `Needs attention` queue.
- **Owner-Confirmed Command Bar (`Ctrl+K`):** Built-in offline parser plus optional Gemini or OpenAI API key. Always renders an editable draft card requiring your confirmation before saving.

## Commands

- `npm run build` — Type-check and build the frontend (`dist/`)
- `npm run desktop` — Launch the Electron Desktop App
- `npm start` — Build and launch Desktop App
- `npm test` — Run ledger, API, CSV import, and Netlify Cloud Sync tests
