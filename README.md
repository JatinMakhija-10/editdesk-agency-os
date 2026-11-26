# EditDesk — Agency OS (Desktop + iPhone App)

An owner-only operations & finance workspace for a video-editing / creative agency. Runs natively as a **Windows Desktop App** with a local SQLite database and serves an **installable iPhone app (PWA)** over your local Wi-Fi or private Tailscale VPN — **no public website required**.

## Quick Launch (Windows Desktop)

1. Install dependencies once:
   ```bash
   npm install
   ```
2. Double-click **`EditDesk.bat`** (or run `npm start` / `npm run desktop` in this folder).
3. On a fresh clone, EditDesk initializes `data/editdesk.db` with a clean sample workspace (`2025` baseline + `SYN0001`–`SYN0012`). Your local database stays strictly in `data/editdesk.db` (gitignored so private agency financials are never pushed to GitHub).
4. Closing the desktop window minimizes EditDesk to the **Windows System Tray** (toggleable in Settings) so your iPhone stays synced even when the window is tucked away.

## Use on Your iPhone (No Public Website Needed)

1. Click **Connect iPhone** in the left sidebar of the Desktop App.
2. Connect your iPhone to the **same Wi-Fi** as your PC and scan the **QR Code**.
3. Enter the Owner Mobile PIN shown on the desktop screen (default `2026`, editable in Settings).
4. In Safari, tap **Share → Add to Home Screen**. It launches full-screen like a native iOS app and syncs in real time with your desktop database.
5. **Outside home Wi-Fi (4G/5G):** Install free **Tailscale** on your Windows PC and iPhone — EditDesk detects your private `100.x.x.x` Tailscale IP automatically so you can connect securely from anywhere without exposing a public website.

## Core Financial & Workflow Rules

- **Orders vs. Money:** Production stages (`New → Unassigned / Assigned → Editing → Internal review → Client review → Revisions → Approved → Delivered`) are completely independent of payment status (`Rate Pending`, `Unpaid`, `Partially paid`, `Paid`).
- **Lump-Sum Payments:** Record one client receipt and choose **Oldest First (FIFO)** or **Pick Orders**. Any extra stays as **Unallocated Client Advance** ready to apply to future orders.
- **Editor Payouts:** Editor cost becomes payable only after you check **Editor work submitted**. Payouts allocate oldest-first or across selected submitted jobs.
- **Separate Deadlines:** Production deadlines and invoice payment due dates are separate fields.
- **Owner-Confirmed AI (`Ctrl+K`):** Works out of the box with the built-in offline smart parser (single orders, pasted multi-order WhatsApp briefs, lump-sum payments, payouts, expenses, and finance Q&A). Optionally add a **Gemini** or **OpenAI** API key in **Settings**. AI always shows an editable preview card before saving.

## Commands

- `npm run build` — Type-check and build the frontend (`dist/`)
- `npm run desktop` — Launch the Electron Desktop App
- `npm start` — Build and launch Desktop App (with Edge/Chrome app-window fallback if Electron binary is absent)
- `npm test` — Run backend ledger, allocation, and API tests

## Optional Private Cloud Mode (`supabase/`)

If you ever want access while your Windows PC is completely powered off, `supabase/schema.sql` and `supabase/functions/ai-command/index.ts` contain the owner-only Supabase Postgres + RLS + Edge Function templates.
