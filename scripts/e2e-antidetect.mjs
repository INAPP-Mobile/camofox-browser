// Anti-detection E2E: navigate camofox-browser to challenging websites
// Tests bypass of Cloudflare, DataDome, PerimeterX, and JS-heavy SPAs
import { request } from 'node:https';
import { randomUUID } from 'node:crypto';

const BASE = process.env.CAMOFOX_BASE || 'https://camofox-browser-production-cd36.up.railway.app';
const API_KEY = process.env.CAMOFOX_API_KEY || '';

const CHALLENGING_SITES = [
  {
    name: 'Cloudflare (direct)',
    url: 'https://www.cloudflare.com/',
    expect: (body) => body.includes('Cloudflare') && !body.includes('Verify you are human'),
  },
  {
    name: 'Cloudflare challenge target',
    url: 'https://nahom.eu.org/',
    expect: (body) => body.length > 500 && !body.includes('Just a moment'),
  },
  {
    name: 'DataDome (Footlocker)',
    url: 'https://www.footlocker.com/',
    expect: (body) => !body.includes('DataDome') && !botIndicator(body),
  },
  {
    name: 'PerimeterX (Walmart)',
    url: 'https://www.walmart.com/',
    expect: (body) => !body.includes('px-captcha') && !botIndicator(body),
  },
  {
    name: 'JS-heavy SPA (Airbnb)',
    url: 'https://www.airbnb.com/',
    expect: (body) => body.includes('Airbnb') || body.includes('search'),
  },
  {
    name: 'Bot detection test',
    url: 'https://bot.sannysoft.com/',
    expect: (body) => body.length > 2000,  // Should load full page with test results
  },
  {
    name: 'FingerprintJS demo',
    url: 'https://fingerprintjs.github.io/fingerprintjs/',
    expect: (body) => body.includes('visitorId') || body.includes('browserId'),
  },
  {
    name: 'Now in Cloudflare (Aniverse)',
    url: 'https://aniverse.io/',
    expect: (body) => !body.includes('Just a moment'),
  },
];

function botIndicator(body) {
  const lower = body.toLowerCase();
  return (
    lower.includes('access denied') ||
    lower.includes('blocked') ||
    lower.includes('captcha') ||
    lower.includes('challenge') ||
    lower.includes('verify you are human') ||
    lower.includes('bot detection') ||
    lower.includes('automated access')
  );
}

function httpReq(method, path, body) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE);
    const data = body ? JSON.stringify(body) : null;
    const headers = { 'Content-Type': 'application/json', 'Accept': 'application/json' };
    if (API_KEY) headers['Authorization'] = `Bearer ${API_KEY}`;
    if (data) headers['Length'] = Buffer.byteLength(data);
    const req = request({
      hostname: url.hostname,
      port: url.port || 443,
      path: url.pathname + url.search,
      method,
      headers,
      rejectUnauthorized: true,
    }, (res) => {
      let buf = '';
      res.on('data', (c) => buf += c);
      res.on('end', () => resolve({ status: res.statusCode, body: buf, headers: res.headers }));
    });
    req.on('error', reject);
    req.setTimeout(45000, () => req.destroy(new Error('timeout')));
    if (data) req.write(data);
    req.end();
  });
}

async function testSite(site) {
  const userId = `e2e-${randomUUID().slice(0, 8)}`;
  const sessionKey = `session-${randomUUID().slice(0, 8)}`;

  // Create tab
  const createRes = await httpReq('POST', '/tabs', { userId, sessionKey });
  if (createRes.status !== 200 && createRes.status !== 201) {
    return { name: site.name, result: 'FAIL', reason: `create tab ${createRes.status}: ${createRes.body.slice(0, 100)}` };
  }
  const tabId = JSON.parse(createRes.body)?.tabId || JSON.parse(createRes.body)?.id;
  if (!tabId) {
    return { name: site.name, result: 'FAIL', reason: 'no tabId' };
  }

  try {
    // Navigate
    const navRes = await httpReq('POST', `/tabs/${tabId}/navigate`, {
      userId,
      url: site.url,
    });

    if (navRes.status !== 200) {
      return { name: site.name, result: 'FAIL', reason: `navigate ${navRes.status}: ${navRes.body.slice(0, 200)}` };
    }

    // Wait 2s for JS to settle
    await httpReq('POST', `/tabs/${tabId}/wait`, { userId, selector: 'body', timeout: 5000 }).catch(() => {});

    // Get snapshot
    const snapRes = await httpReq('GET', `/tabs/${tabId}/snapshot?userId=${encodeURIComponent(userId)}`);
    if (snapRes.status !== 200) {
      return { name: site.name, result: 'FAIL', reason: `snapshot ${snapRes.status}: ${snapRes.body.slice(0, 200)}` };
    }

    const snap = JSON.parse(snapRes.body);
    const body = snap.tree || snap.body || snapRes.body;
    const passed = site.expect(body);

    // Check for bot indicators
    const indicators = [];
    const lower = body.toLowerCase();
    if (lower.includes('just a moment')) indicators.push('cloudflare-challenge');
    if (lower.includes('captcha')) indicators.push('captcha');
    if (lower.includes('access denied')) indicators.push('access-denied');
    if (lower.includes('datadome')) indicators.push('datadome');
    if (lower.includes('px-captcha')) indicators.push('perimeterx');

    return {
      name: site.name,
      result: passed ? 'PASS' : 'WARN',
      indicators: indicators.length ? indicators : undefined,
      bodyLen: body.length,
      preview: body.slice(0, 200).replace(/\s+/g, ' ').trim(),
    };
  } finally {
    await httpReq('DELETE', `/tabs/${tabId}?userId=${encodeURIComponent(userId)}`);
  }
}

async function main() {
  console.log(`\nCamofox Anti-Detection E2E — ${BASE}`);
  console.log(`Testing ${CHALLENGING_SITES.length} challenging sites\n`);

  const results = [];
  for (const site of CHALLENGING_SITES) {
    process.stdout.write(`  Testing ${site.name}...`);
    const r = await testSite(site);
    results.push(r);
    const icon = r.result === 'PASS' ? 'PASS' : r.result === 'WARN' ? 'WARN' : 'FAIL';
    console.log(`\r  ${icon}  ${site.name}` + (r.indicators ? `  [${r.indicators.join(', ')}]` : '') + (r.reason ? `  ${r.reason}` : ''));
  }

  const passed = results.filter(r => r.result === 'PASS').length;
  const warned = results.filter(r => r.result === 'WARN').length;
  const failed = results.filter(r => r.result === 'FAIL').length;

  console.log(`\n${passed} PASS, ${warned} WARN, ${failed} FAILED\n`);

  // Detail for WARN/FAIL
  for (const r of results.filter(r => r.result !== 'PASS')) {
    console.log(`  --- ${r.name} (${r.result}) ---`);
    if (r.reason) console.log(`  ${r.reason}`);
    if (r.indicators) console.log(`  Bot indicators: ${r.indicators.join(', ')}`);
    if (r.preview) console.log(`  Preview: ${r.preview.slice(0, 150)}`);
    console.log();
  }

  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error('E2E crashed:', e.message);
  process.exit(1);
});
