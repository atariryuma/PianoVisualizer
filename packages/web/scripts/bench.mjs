#!/usr/bin/env node
// Headless bench runner for the dev-mode benchmark suite.
//
// Spawns vite preview (or reuses a running dev server on the same port),
// launches Chrome via puppeteer-core, navigates to /?dev=1&autorun=bench
// + a webhook URL pointing back at the local /__bench/result endpoint,
// waits for the report to land, prints it to stdout.
//
// Why headless: lets a CI script (or an LLM driving via Bash) collect
// real-device-style benchmark output without a human opening the URL.
//
// Usage:
//   pnpm --filter @piano/web bench         # full headless run
//   pnpm --filter @piano/web bench --keep  # keep the browser open after
//
// Requires Chrome / Edge / Chromium installed on the host. Auto-detects
// common install paths on Windows / macOS / Linux. Override via env:
//   PIANOVIZ_BENCH_BROWSER=/path/to/chrome
//
// The report text is also written to .last-bench-report.md by the vite
// plugin so a subsequent `cat .last-bench-report.md` from another shell
// fetches the same content.

import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
import puppeteer from 'puppeteer-core';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = resolve(__dirname, '../../..');
const PORT = 4173; // vite preview default
const URL_BASE = `http://localhost:${PORT}`;
const WEBHOOK = `${URL_BASE}/__bench/result`;
const PAGE_URL = `${URL_BASE}/?dev=1&autorun=bench&webhook=${encodeURIComponent(WEBHOOK)}`;
const REPORT_FILE = resolve(REPO_ROOT, '.last-bench-report.md');
const TIMEOUT_MS = 60_000;

function findChrome() {
  if (process.env.PIANOVIZ_BENCH_BROWSER) return process.env.PIANOVIZ_BENCH_BROWSER;
  const candidates = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
  ];
  for (const c of candidates) if (existsSync(c)) return c;
  return null;
}

function waitForServer(url, maxWaitMs = 15_000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const tick = async () => {
      try {
        const r = await fetch(url, { method: 'GET' });
        if (r.ok || r.status === 404) return resolve();
      } catch {
        // not up yet
      }
      if (Date.now() - start > maxWaitMs) return reject(new Error('timeout'));
      setTimeout(tick, 250);
    };
    tick();
  });
}

async function pollLastReport(timeoutMs = TIMEOUT_MS) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const r = await fetch(`${URL_BASE}/__bench/last`);
      const text = await r.text();
      if (text.length > 0 && text.includes('## Benchmark')) return text;
    } catch {
      // server not ready yet
    }
    await new Promise((res) => setTimeout(res, 250));
  }
  throw new Error('Bench did not complete within ' + timeoutMs + 'ms');
}

async function main() {
  const keep = process.argv.includes('--keep');

  // Clear any prior result so we don't see stale output if the bench
  // crashes before posting fresh content.
  try {
    await fetch(`${URL_BASE}/__bench/clear`).catch(() => {});
  } catch {
    /* server not up yet — the spawn below will start it */
  }

  // Step 1: ensure vite preview is running (clear → 200 means up).
  let ourServer = null;
  let serverUp = false;
  try {
    const res = await fetch(`${URL_BASE}/__bench/clear`).catch(() => null);
    serverUp = !!res && res.ok;
  } catch {
    /* down */
  }
  if (!serverUp) {
    console.error(`[bench] no vite preview on :${PORT}, spawning…`);
    ourServer = spawn(
      'pnpm',
      ['--filter', '@piano/web', 'preview', '--', '--port', String(PORT), '--strictPort'],
      { cwd: REPO_ROOT, stdio: ['ignore', 'pipe', 'pipe'], shell: true }
    );
    ourServer.stdout.on('data', () => {}); // drain
    ourServer.stderr.on('data', () => {});
    await waitForServer(URL_BASE).catch((e) => {
      throw new Error('vite preview did not come up: ' + e.message);
    });
    console.error('[bench] vite preview ready');
  }

  // Step 2: launch headless Chrome + navigate.
  const browserPath = findChrome();
  if (!browserPath) {
    if (ourServer) ourServer.kill();
    throw new Error('No Chrome/Edge install found. Set PIANOVIZ_BENCH_BROWSER=/path/to/chrome.');
  }
  const browser = await puppeteer.launch({
    executablePath: browserPath,
    headless: !keep,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });
  try {
    const page = await browser.newPage();
    page.on('pageerror', (e) => console.error('[bench page-error]', e.message));
    page.on('console', (msg) => {
      const t = msg.type();
      if (t === 'error' || t === 'warning') {
        console.error(`[bench page-${t}]`, msg.text());
      }
    });
    await page.goto(PAGE_URL, { waitUntil: 'load' });
    // Step 3: wait for the report to land.
    const report = await pollLastReport();
    process.stdout.write(report);
    if (!report.endsWith('\n')) process.stdout.write('\n');
  } finally {
    if (!keep) await browser.close();
    if (ourServer) {
      ourServer.kill();
      // give time for child to exit
      await new Promise((r) => setTimeout(r, 200));
    }
  }

  // Also confirm the file was written by the plugin (sanity check).
  if (existsSync(REPORT_FILE)) {
    const fileSize = readFileSync(REPORT_FILE, 'utf8').length;
    console.error(`[bench] wrote ${REPORT_FILE} (${fileSize} bytes)`);
  }
}

main().catch((e) => {
  console.error('[bench] fatal:', e.message);
  process.exit(1);
});
