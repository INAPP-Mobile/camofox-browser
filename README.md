# Deploy and Host

[![Deploy on Railway](https://railway.app/button.svg)](https://railway.com/deploy/camofox-browser)

![Camofox Browser](https://raw.githubusercontent.com/INAPP-Mobile/camofox-browser/main/template-icon.svg)

Camofox Browser is a privacy-focused, anti-detection browser automation service powered by Camoufox. Deploy a headless browser with built-in fingerprint randomization, VNC support, and session persistence — ready for scraping, automation, and testing workloads.

## Source Repository

This project is based on [Camoufox](https://github.com/daijro/camoufox) — the anti-detection Firefox automation framework. This fork adds a REST API server, session management, Railway deployment support, and the template pipeline.

[https://github.com/INAPP-Mobile/camofox-browser](https://github.com/INAPP-Mobile/camofox-browser)

The source code is available under the MIT license. Contributions welcome.

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
| `MAX_SESSIONS` | `50` | Max concurrent sessions (~500MB each) |
| `BROWSER_IDLE_TIMEOUT_MS` | `300000` | Idle timeout (5 min) |
| `CAMOFOX_INTERACTIVE` | `off` | Interactive mode: off / desktop / novnc / auto |

## Usage

After deploy, access your browser at `https://YOUR_DOMAIN`. Interact via the REST API using tabs:

```bash
# Create a new tab (opens about:blank)
curl -X POST https://YOUR_DOMAIN/tabs \
  -H "Content-Type: application/json" \
  -d '{"userId": "user-1", "sessionKey": "session-1"}'

# Create a tab with an initial URL
curl -X POST https://YOUR_DOMAIN/tabs \
  -H "Content-Type: application/json" \
  -d '{"userId": "user-1", "sessionKey": "session-1", "url": "https://example.com"}'

# Navigate a tab to a URL
curl -X POST https://YOUR_DOMAIN/tabs/{tabId}/navigate \
  -H "Content-Type: application/json" \
  -d '{"userId": "user-1", "url": "https://example.com"}'

# Get accessibility snapshot (with element refs for click/type)
curl -s "https://YOUR_DOMAIN/tabs/{tabId}/snapshot?userId=user-1"

# Click an element by ref
curl -X POST https://YOUR_DOMAIN/tabs/{tabId}/click \
  -H "Content-Type: application/json" \
  -d '{"userId": "user-1", "ref": "e1"}'

# Type into an element
curl -X POST https://YOUR_DOMAIN/tabs/{tabId}/type \
  -H "Content-Type: application/json" \
  -d '{"userId": "user-1", "ref": "e1", "text": "hello"}'

# Close a tab
curl -X DELETE https://YOUR_DOMAIN/tabs/{tabId} \
  -H "Content-Type: application/json" \
  -d '{"userId": "user-1"}'
```

Full API docs at `/openapi.json` once deployed.

## Dependencies for Camofox

### Deployment Dependencies

- **Railway volume** (optional) — Mount at `/data/profiles` to persist browser sessions across deploys
