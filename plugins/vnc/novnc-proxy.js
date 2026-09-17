/**
 * Reverse-proxy noVNC (websockify on 127.0.0.1:NOVNC_PORT) under /novnc on the
 * main Camofox HTTP server so Railway HTTPS service domains can front the viewer.
 *
 * Railway TCP proxies are raw TCP without TLS — browsers show "Not secure".
 * Mounting noVNC on the API port unlocks https://<service>.up.railway.app/novnc/...
 */
import http from 'node:http';

export const NOVNC_PROXY_PREFIX = '/novnc';

function stripPrefix(urlPath) {
  if (!urlPath) return '/';
  if (urlPath === NOVNC_PROXY_PREFIX) return '/';
  if (urlPath.startsWith(`${NOVNC_PROXY_PREFIX}/`)) {
    return urlPath.slice(NOVNC_PROXY_PREFIX.length) || '/';
  }
  return urlPath;
}

/**
 * Express middleware: proxy HTTP GETs for noVNC static assets + websockify HTTP.
 * Mount with: app.use('/novnc', createNovncHttpProxy(...))
 */
export function createNovncHttpProxy({ novncPort, log }) {
  const port = Number(novncPort) || 6080;

  return function novncHttpProxy(req, res) {
    const mountUrl = req.originalUrl || `${NOVNC_PROXY_PREFIX}${req.url || '/'}`;
    const qIndex = mountUrl.indexOf('?');
    const pathOnly = qIndex >= 0 ? mountUrl.slice(0, qIndex) : mountUrl;
    const query = qIndex >= 0 ? mountUrl.slice(qIndex) : '';
    const targetPath = `${stripPrefix(pathOnly)}${query}`;
    const headers = { ...req.headers, host: `127.0.0.1:${port}` };
    delete headers['content-length'];

    const proxyReq = http.request(
      {
        hostname: '127.0.0.1',
        port,
        path: targetPath || '/',
        method: req.method,
        headers,
      },
      (proxyRes) => {
        res.writeHead(proxyRes.statusCode || 502, proxyRes.headers);
        proxyRes.pipe(res);
      },
    );

    proxyReq.on('error', (err) => {
      log?.('warn', 'novnc http proxy error', { error: err.message, path: targetPath });
      if (!res.headersSent) {
        res.status(502).json({
          error: 'novnc_proxy_unavailable',
          message: 'noVNC websockify is not reachable on loopback yet. Retry in a few seconds.',
        });
      } else {
        res.end();
      }
    });

    req.pipe(proxyReq);
  };
}

/**
 * Attach WebSocket upgrade proxy for /novnc/* → websockify.
 * Call once with the Node HTTP server from `server:started`.
 */
export function attachNovncUpgradeProxy(server, { novncPort, log }) {
  if (!server || typeof server.on !== 'function') return;
  if (server.__camofoxNovncUpgradeAttached) return;
  server.__camofoxNovncUpgradeAttached = true;

  const port = Number(novncPort) || 6080;

  server.on('upgrade', (req, socket, head) => {
    const url = req.url || '';
    if (!url.startsWith(NOVNC_PROXY_PREFIX)) return;

    const targetPath = stripPrefix(url);
    const headers = { ...req.headers, host: `127.0.0.1:${port}` };

    const proxyReq = http.request({
      hostname: '127.0.0.1',
      port,
      path: targetPath,
      method: req.method,
      headers,
    });

    proxyReq.on('upgrade', (proxyRes, proxySocket, proxyHead) => {
      const lines = [`HTTP/1.1 ${proxyRes.statusCode} Switching Protocols`];
      for (const [key, value] of Object.entries(proxyRes.headers || {})) {
        if (value === undefined) continue;
        if (Array.isArray(value)) {
          for (const item of value) lines.push(`${key}: ${item}`);
        } else {
          lines.push(`${key}: ${value}`);
        }
      }
      socket.write(`${lines.join('\r\n')}\r\n\r\n`);
      if (proxyHead?.length) socket.write(proxyHead);
      proxySocket.pipe(socket);
      socket.pipe(proxySocket);
    });

    proxyReq.on('error', (err) => {
      log?.('warn', 'novnc ws proxy error', { error: err.message, path: targetPath });
      try {
        socket.write('HTTP/1.1 502 Bad Gateway\r\nConnection: close\r\n\r\n');
      } catch {
        // ignore
      }
      socket.destroy();
    });

    proxyReq.end();
    if (head?.length) proxyReq.write(head);
  });

  log?.('info', 'novnc upgrade proxy attached', { prefix: NOVNC_PROXY_PREFIX, novncPort: port });
}
