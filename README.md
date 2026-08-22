# Deploy and Host

[![Deploy on Railway](https://railway.app/button.svg)](https://railway.com/deploy/IrXpSx)

![Camofox Browser](https://raw.githubusercontent.com/INAPP-Mobile/camofox-browser/main/template-icon.svg)

Camofox Browser is a privacy-focused, anti-detection browser automation service powered by Camoufox. Deploy a headless browser with built-in fingerprint randomization, VNC support, and session persistence — ready for scraping, automation, and testing workloads.

## Why Deploy

Most headless browsers leak automation signals that bot-detection systems catch within seconds. Camoufox patches Firefox to randomize canvas, WebGL, AudioContext, fonts, and navigator properties — making your automation traffic look like a real user. One click gets you a production-ready browser endpoint with no infrastructure to manage.

## Common Use Cases

- **Web scraping** at scale without getting blocked by Cloudflare, DataDome, or PerimeterX
- **Automated testing** that exercises real user flows including WebGL and media playback
- **Account management** with persistent sessions (cookies, localStorage) that survive restarts
- **Price monitoring / intelligence** across sites that aggressively fingerprint visitors
- **Content extraction** — transcripts, metadata, and structured data via the built-in YouTube plugin

## About Hosting

This template deploys on Railway with a single service running Camoufox (a patched Firefox). The container uses Xvfb for a virtual display, so the browser renders as if on a real desktop — critical for passing WebGL and canvas fingerprint checks. Each instance uses ~200MB RAM baseline plus ~500MB per active session; size your plan accordingly.

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `9377` | Server port (Railway injects) |
| `CAMOFOX_API_KEY` | *(empty)* | API key for auth (empty = open) |
| `CAMOFOX_ADMIN_KEY` | *(empty)* | Admin key for privileged endpoints |
| `CAMOFOX_PROFILE_DIR` | `/data/profiles` | Browser profile storage (use volume for persistence) |
| `MAX_SESSIONS` | `10` | Max concurrent sessions (~500MB each) |
| `BROWSER_IDLE_TIMEOUT_MS` | `300000` | Idle timeout (5 min) |
| `CAMOFOX_INTERACTIVE` | `off` | Interactive mode: off / desktop / novnc / auto |

## Usage

After deploy, access your browser at `https://<your-domain>:9377`. Create sessions via the REST API:

```bash
# Create a new session
curl -X POST https://<your-domain>:9377/sessions \
  -H "Authorization: Bearer ***"

# Navigate to a page
curl -X POST https://<your-domain>:9377/sessions/{id}/navigate \
  -H "Content-Type: application/json" \
  -d '{"url": "https://example.com"}'
```

Full API docs at `/openapi.json` once deployed.

## Dependencies for Camofox

### Deployment Dependencies

- **Railway volume** (optional) — Mount at `/data/profiles` to persist browser sessions across deploys
