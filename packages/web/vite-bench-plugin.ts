// Vite plugin — exposes `/__bench/result` (POST) + `/__bench/last`
// (GET) endpoints in the dev / preview server. Pairs with dev-mode's
// webhook URL param so a headless or human-in-the-loop bench run can
// ship the markdown report back to disk + memory for later retrieval.
//
// Usage from the dev-mode toolbar (or autorun param):
//   open `?dev=1&autorun=bench&webhook=http://localhost:8443/__bench/result`
// → page autoruns the bench → POSTs report to /__bench/result → file +
// in-memory cache hold the latest report. From a CLI:
//   `curl http://localhost:8443/__bench/last` returns the report.
//
// CORS: dev-mode's webhook fetch sets mode:cors. The plugin replies
// with a permissive Access-Control-Allow-Origin so the same-origin
// case (`localhost:8443` → `localhost:8443`) Just Works AND a cross-
// origin call (e.g. opening the deployed Pages URL with a localhost
// webhook) doesn't get blocked.

import type { Plugin, ViteDevServer, PreviewServer } from 'vite';
import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import type { IncomingMessage } from 'node:http';

const REPORT_FILE = '.last-bench-report.md';

export function benchPlugin(): Plugin {
  let lastReport = '';

  // Best-effort: pre-load any existing report from disk so a fresh
  // dev-server startup picks up the previous run's results without a
  // re-run (useful for CI inspection).
  function tryLoadFromDisk(root: string): void {
    const path = resolve(root, REPORT_FILE);
    if (existsSync(path)) {
      try {
        lastReport = readFileSync(path, 'utf8');
      } catch {
        /* ignore — fresh run will overwrite */
      }
    }
  }

  function attach(server: ViteDevServer | PreviewServer, root: string): void {
    tryLoadFromDisk(root);
    server.middlewares.use('/__bench/result', (req, res) => {
      // CORS preflight + permissive response so the dev-mode webhook
      // POST works regardless of which origin the page is loaded from.
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
      if (req.method === 'OPTIONS') {
        res.statusCode = 204;
        res.end();
        return;
      }
      if (req.method !== 'POST') {
        res.statusCode = 405;
        res.end('POST only');
        return;
      }
      collectBody(req, (body) => {
        lastReport = body;
        const path = resolve(root, REPORT_FILE);
        try {
          writeFileSync(path, body, 'utf8');
        } catch (e) {
           
          console.warn('[bench-plugin] failed to write', path, e);
        }
        res.statusCode = 200;
        res.setHeader('Content-Type', 'text/plain');
        res.end(`stored ${body.length} bytes`);
      });
    });
    server.middlewares.use('/__bench/last', (_req, res) => {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
      res.end(lastReport);
    });
    server.middlewares.use('/__bench/clear', (_req, res) => {
      lastReport = '';
      res.statusCode = 200;
      res.end('cleared');
    });
  }

  return {
    name: 'piano-viz-bench',
    apply: (_config, env) => env.command === 'serve',
    configureServer(server) {
      attach(server, server.config.root);
    },
    configurePreviewServer(server) {
      attach(server, server.config.root);
    },
  };
}

function collectBody(req: IncomingMessage, cb: (body: string) => void): void {
  const chunks: Buffer[] = [];
  req.on('data', (c) => chunks.push(c as Buffer));
  req.on('end', () => cb(Buffer.concat(chunks).toString('utf8')));
}
