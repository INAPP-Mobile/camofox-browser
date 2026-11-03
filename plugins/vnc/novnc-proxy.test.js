import { describe, expect, test } from '@jest/globals';
import http from 'node:http';
import { attachNovncUpgradeProxy, createNovncHttpProxy, NOVNC_PROXY_PREFIX } from './novnc-proxy.js';

describe('novnc-proxy', () => {
  test('exports /novnc prefix', () => {
    expect(NOVNC_PROXY_PREFIX).toBe('/novnc');
  });

  test('HTTP proxy returns 502 when websockify is down', async () => {
    const middleware = createNovncHttpProxy({
      novncPort: 1,
      log: () => {},
    });

    const result = await new Promise((resolve) => {
      const fakeReq = {
        method: 'GET',
        url: '/vnc.html',
        originalUrl: '/novnc/vnc.html',
        headers: {},
        pipe(dest) {
          dest.end();
          return dest;
        },
      };
      let statusCode = 0;
      let payload = '';
      const fakeRes = {
        headersSent: false,
        status(code) {
          statusCode = code;
          return this;
        },
        json(obj) {
          payload = JSON.stringify(obj);
          resolve({ status: statusCode, body: payload });
        },
        writeHead() {
          this.headersSent = true;
        },
        end() {
          resolve({ status: statusCode || 502, body: payload });
        },
      };
      middleware(fakeReq, fakeRes);
    });

    expect(result.status).toBe(502);
    expect(result.body).toContain('novnc_proxy_unavailable');
  });

  test('attachNovncUpgradeProxy is idempotent', () => {
    const server = new http.Server();
    attachNovncUpgradeProxy(server, { novncPort: 6080, log: () => {} });
    attachNovncUpgradeProxy(server, { novncPort: 6080, log: () => {} });
    expect(server.__camofoxNovncUpgradeAttached).toBe(true);
    server.close();
  });
});
