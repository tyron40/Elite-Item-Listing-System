# Recovery Studio

Open `/#recovery` after signing into Elite. The page is also available from the main navigation and home dashboard.

## Supported workflow

1. Download the paired-companion USB release or `public/recovery/companion.py` on a running device with Python 3.8+.
2. Create a one-time pairing code in Recovery Studio. Codes are 192-bit random secrets, expire after ten minutes and are consumed atomically once.
3. Run the companion, review the hardware report, enter the code and type PAIR. Reports contain manufacturer/model, architecture, CPU, OS/environment, firmware, RAM and disk inventory. Serial numbers, filenames and personal files are excluded.
4. The dashboard lists only that account's device sessions. Keep the companion open. Reports refresh approximately every minute; poll/heartbeat and dashboard refresh run about every five seconds. Sessions expire after 24 hours; disconnected companions show offline after 45 seconds.
5. Select the original OS. A live USB reports its own Linux environment, not a verified installed OS. The assistant answers deterministically from the selected report and plan; it does not execute chat text or call an LLM.
6. Request a rescan, a verified PC-toolkit download or a supported UEFI restart. Downloads require local DOWNLOAD approval, enforce source/size/time restrictions, stream SHA-256 verification and discard mismatches. Firmware restart requires local RESTART approval and sufficient privileges. No arbitrary remote commands are accepted.

The page includes a local JSON report import for offline planning. It does not upload the imported report or make that computer remotely controllable. Native browser USB APIs are not used to claim access to other PCs.

## Deployment

The existing Vite/React app remains the web frontend. Supabase project `giunepklvuwgboaektzd` runs `recovery-control`. Apply the generated migration `20261019134849_add_recovery_control.sql`, then deploy `supabase/functions/recovery-control/index.ts` with its `_shared/recovery.ts` dependency. No new provider keys are needed; the Edge runtime supplies its project credentials.

`verify_jwt=false` is intentional: browser calls verify a real user through Auth `getUser`; companion calls authenticate a separate 256-bit random session token stored only as a SHA-256 digest. Tokens are held in companion memory, never placed in URLs, and never returned to the browser. Anonymous Auth accounts are rejected. Every owner operation filters by the authenticated owner ID. Companion operations resolve the session by its own token digest and active expiry. Pairing and session tables have RLS plus no grants to anon/authenticated roles; only the authenticated Edge handler accesses them with the service role. Informational “RLS enabled, no policies” notices are intentional deny-by-default behavior, not an invitation to add broad policies.

The helper uses a fixed API endpoint and only three request types. Cloud downloads are restricted to the Ty-Recovery-USB GitHub release asset path; the expected digest comes from the reviewed server catalog, not user chat. TLS validates the API and asset hosts. No token is written to disk. Closing the helper ends polling; use Disconnect in the dashboard to revoke the session immediately.

## Limits

The selected file is a bootable PC recovery toolkit, not a Windows/macOS/ChromeOS factory image. The page does not install operating systems, erase disks, change boot order, bypass passwords/encryption/activation locks, or certify compatibility with every model. An ISO download alone does not boot it. Use an image writer or a separately configured supported boot method. USB image writing erases the selected USB. Physical firmware restart behavior and Windows/macOS hardware detection require testing on actual target hardware.

## Verification

- `npm run typecheck`
- `npm run build`
- `node --experimental-strip-types --test tests/recovery.test.ts` (Node 24+)
- `python -m unittest discover -s tests -p test_companion.py -v`
- `npx deno check --no-lock supabase/functions/recovery-control/index.ts`

Live integration checks exercise anonymous rejection, invalid device-token rejection, pairing-code replay denial, token-bound command delivery, report sanitization, result acknowledgement and revocation. Hardware actions are not executed during integration tests. USB releases run BIOS and UEFI virtual boot checks separately.

## Published companion image

USB release [bootable-5](https://github.com/tyron40/Ty-Recovery-USB/releases/tag/bootable-5) includes the companion and menu option 6. BIOS and UEFI virtual boot checks passed. The server catalog pins its SHA-256 to `053db68a071f4574234952d0163ea62e9df3ac50dee7959024718b946ec542c4`.
