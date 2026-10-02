# ZK Kiosk Fingerprint Service

Loopback HTTP bridge between the **ZK9500 USB fingerprint scanner** and the
RCC-HIROS web app. The scanner's raw images and ZKTeco feature templates are
produced here and stored in the app's MariaDB `BiometricTemplate` table —
Windows Hello / TPM is not involved.

- **Host:** `127.0.0.1:8765` (loopback only — not reachable from the network)
- **Prereqs:**
  - ZK9500 plugged in + ZKTeco USB driver installed (`Device Manager → ZK9500`, status OK)
  - ZKFinger SDK 5.x installed → `libzkfp.dll` in `C:\Windows\System32`
  - 64-bit Python 3.10+ (`pip install -r requirements.txt`)

## Start order (kiosk / server PC)

```
1. XAMPP MySQL          (start-server.bat or C:\xampp\mysql_start.bat)
2. python kiosk-service\main.py     ← keep this window open
3. npx next dev -p 3000
```

Verify: `curl http://127.0.0.1:8765/health` → `{"scanner":"connected",...}`

## API

| Method | Path        | Body                                        | Returns |
|--------|-------------|---------------------------------------------|---------|
| GET    | `/health`   | —                                           | `{service, version, scanner: "connected"\|"not_found", deviceCount}` |
| POST   | `/capture`  | `{timeoutS?: 15}`                           | `{imageB64 (PNG), templateB64, templateBytes, width, height, dpi, capturedAt}` — waits for one finger swipe |
| POST   | `/enroll`   | `{swipes?: 3, timeoutS?: 15}`               | `{imagesB64[], regTemplateB64, templateBytes, swipesCaptured, width, height, dpi, enrolledAt}` — N swipes merged into one registration template |
| POST   | `/identify` | `{liveB64, templates: [{fid, templateB64}]}`| `{fid: int\|null, score: int}` — 1:N match; `fid: null` = no match |

Notes:
- `capture` / `enroll` block until a finger is placed on the pad (or timeout → 504).
- `identify` rebuilds a temporary match cache per request from the templates you send
  (fids are opaque integers — use the DB row id).
- All device calls are serialized behind one lock (single scanner, single service).
