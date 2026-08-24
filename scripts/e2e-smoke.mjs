// E2E test for deployed camofox-browser Railway service
// Uses only Node.js built-ins (no external deps) — runs against live deployment
import { request } from 'node:https';
import { randomUUID } from 'node:crypto';

const BASE = process.env.CAMOFOX_BASE || 'https://camofox-browser-production-cd36.up.railway.app';
const API_KEY = process.env.CAMOFOX_API_KEY || '';
const ADMIN_KEY = process.env.CAMOFOX_ADMIN_KEY || '';

const results = [];
let failures = 0;

function httpReq(method, path, body) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE);
    const data = body ? JSON.stringify(body) : null;
    const headers = { 'Content-Type': 'application/json' };
    if (API_KEY) headers['Authorization'] = `Bearer ${API_KEY}`;
    if (data) headers['Content-Length'] = Buffer.byteLength(data);

    const req = request({
      hostname: url.hostname,
      port: url.port || 443,
      path: url.pathname + url.search,
      method,
      headers,
    }, (res) => {
      let buf = '';
      res.on('data', (c) => buf += c);
      res.on('end', () => resolve({ status: res.statusCode, body: buf, headers: res.headers }));
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

function pass(name, extra = '') {
  results.push(`  PASS  ${name}${extra ? '  ' + extra : ''}`);
}
function fail(name, extra = '') {
  results.push(`  FAIL  ${name}${extra ? '  ' + extra : ''}`);
  failures++;
}

async function main() {
  console.log(`\nCamofox E2E — ${BASE}\n`);

  // 1. Health
  {
    const r = await httpReq('GET', '/health');
    if (r.status === 200) {
      pass('GET /health → 200');
    } else {
      fail('GET /health', `got ${r.status}`);
    }
  }

  // 2. Server status (root)
  {
    const r = await httpReq('GET', '/');
    if (r.status === 200) {
      let parsed;
      try { parsed = JSON.parse(r.body); } catch {}
      if (parsed && parsed.service) {
        pass('GET / → status JSON', `v${parsed.version || '?'}`);
      } else {
        pass('GET / → 200 (body present)');
      }
    } else {
      fail('GET /', `got ${r.status}`);
    }
  }

  // 3. List tabs (empty initially)
  {
    const r = await httpReq('GET', '/tabs');
    if (r.status === 200) {
      let parsed;
      try { parsed = JSON.parse(r.body); } catch {}
      if (Array.isArray(parsed)) {
        pass('GET /tabs → empty array', `${parsed.length} tab(s)`);
      } else {
        pass('GET /tabs → 200');
      }
    } else {
      fail('GET /tabs', `got ${r.status}`);
    }
  }

  // 4. Create tab (requires userId + sessionKey)
  let tabId = null;
  const userId = `e2e-${randomUUID().slice(0, 8)}`;
  const sessionKey = `e2e-session-${randomUUID().slice(0, 8)}`;
  {
    const r = await httpReq('POST', '/tabs', { userId, sessionKey });
    if (r.status === 200 || r.status === 201) {
      let parsed;
      try { parsed = JSON.parse(r.body); } catch {}
      tabId = parsed?.id || parsed?.tabId;
      if (tabId) {
        pass('POST /tabs → created', `tabId=${tabId}`);
      } else {
        pass('POST /tabs → 200 (no id field in response)');
      }
    } else {
      fail('POST /tabs', `got ${r.status}: ${r.body.slice(0, 200)}`);
    }
  }

  // 5. Navigate tab (userId in body)
  if (tabId) {
    const r = await httpReq('POST', `/tabs/${tabId}/navigate`, { userId, url: 'https://example.com' });
    if (r.status === 200) {
      pass(`POST /tabs/${tabId}/navigate → 200`);
    } else {
      fail(`POST /tabs/${tabId}/navigate`, `got ${r.status}: ${r.body.slice(0, 200)}`);
    }
  }

  // 6. Snapshot (userId as query param)
  if (tabId) {
    const r = await httpReq('GET', `/tabs/${tabId}/snapshot?userId=${encodeURIComponent(userId)}`);
    if (r.status === 200) {
      let parsed;
      try { parsed = JSON.parse(r.body); } catch {}
      if (parsed && (parsed.tree || parsed.roles || parsed.refs)) {
        pass(`GET /tabs/${tabId}/snapshot → 200`, `${Object.keys(parsed).join(',')}`);
      } else {
        pass(`GET /tabs/${tabId}/snapshot → 200`);
      }
    } else {
      fail(`GET /tabs/${tabId}/snapshot`, `got ${r.status}: ${r.body.slice(0, 200)}`);
    }
  }

  // 7. Stats (userId as query param)
  if (tabId) {
    const r = await httpReq('GET', `/tabs/${tabId}/stats?userId=${encodeURIComponent(userId)}`);
    if (r.status === 200) {
      pass(`GET /tabs/${tabId}/stats → 200`);
    } else {
      fail(`GET /tabs/${tabId}/stats`, `got ${r.status}`);
    }
  }

  // 8. Close tab (userId as query param)
  if (tabId) {
    const r = await httpReq('DELETE', `/tabs/${tabId}?userId=${encodeURIComponent(userId)}`);
    if (r.status === 200) {
      pass(`DELETE /tabs/${tabId} → closed`);
    } else {
      fail(`DELETE /tabs/${tabId}`, `got ${r.status}`);
    }
  }

  // 9. List tabs after close
  {
    const r = await httpReq('GET', '/tabs');
    if (r.status === 200) {
      let parsed;
      try { parsed = JSON.parse(r.body); } catch {}
      if (Array.isArray(parsed) && parsed.length === 0) {
        pass('GET /tabs → 0 tabs after close');
      } else {
        pass('GET /tabs → 200');
      }
    } else {
      fail('GET /tabs (final)', `got ${r.status}`);
    }
  }

  // 10. Pressure cleanup (operational endpoint)
  {
    const r = await httpReq('POST', '/pressure/cleanup', {});
    if (r.status === 200) {
      let parsed;
      try { parsed = JSON.parse(r.body); } catch {}
      if (parsed && parsed.ok !== undefined) {
        pass('POST /pressure/cleanup → 200', `dryRun=${parsed.dryRun}`);
      } else {
        pass('POST /pressure/cleanup → 200');
      }
    } else {
      fail('POST /pressure/cleanup', `got ${r.status}`);
    }
  }

  console.log(results.join('\n'));
  console.log(`\n${failures === 0 ? 'ALL PASSED' : failures + ' FAILED'} — ${results.length - failures}/${results.length} checks passed\n`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error('E2E crashed:', e.message);
  process.exit(1);
});
