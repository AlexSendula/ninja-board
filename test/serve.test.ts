import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { createServer, request } from 'node:http';
import type { AddressInfo } from 'node:net';
import { fileURLToPath } from 'node:url';

const SERVE = fileURLToPath(new URL('../scripts/serve.mjs', import.meta.url));

let child: ChildProcess | undefined;
let port = 0;

/** A port nothing is listening on right now. The server is started on it, so the tests never touch 8766. */
async function freePort(): Promise<number> {
  const probe = createServer();
  await new Promise<void>((done) => probe.listen(0, '127.0.0.1', done));
  const { port: free } = probe.address() as AddressInfo;
  await new Promise<void>((done) => probe.close(() => done()));
  return free;
}

/** A request with an explicit Host header, so a test can pose as a rebinding page. */
function get(path: string, host: string): Promise<{ status: number; type?: string; body: string }> {
  return new Promise((resolve, reject) => {
    const req = request({ host: '127.0.0.1', port, path, headers: { host } }, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (chunk: Buffer) => chunks.push(chunk));
      res.on('end', () =>
        resolve({ status: res.statusCode ?? 0, type: res.headers['content-type'], body: Buffer.concat(chunks).toString('utf8') }),
      );
    });
    req.on('error', reject);
    req.end();
  });
}

before(async () => {
  port = await freePort();
  child = spawn(process.execPath, [SERVE, String(port)], { stdio: ['ignore', 'pipe', 'inherit'] });
  await new Promise<void>((resolve, reject) => {
    child?.stdout?.on('data', (chunk: Buffer) => {
      if (chunk.toString().includes('Serving')) resolve();
    });
    child?.once('exit', (code) => reject(new Error(`serve.mjs exited with ${code}`)));
  });
});

after(() => {
  child?.kill();
});

test('answers a 127.0.0.1 or localhost Host with the preview page', async () => {
  for (const host of [`127.0.0.1:${port}`, `localhost:${port}`]) {
    const res = await get('/preview/', host);
    assert.equal(res.status, 200, host);
    assert.match(res.type ?? '', /^text\/html/);
    assert.match(res.body, /<title>Ninja Board preview<\/title>/);
  }
  const css = await get('/styles.css', `127.0.0.1:${port}`);
  assert.equal(css.status, 200);
  assert.match(css.type ?? '', /^text\/css/);
});

test('refuses any other Host with 403, the DNS rebinding case', async () => {
  for (const host of [`evil.example:${port}`, `127.0.0.1:${port + 1}`]) {
    const res = await get('/preview/', host);
    assert.equal(res.status, 403, host);
    assert.doesNotMatch(res.body, /Ninja Board preview/);
  }
});

test('refuses a path that leaves plugin/, plain or encoded, with 403', async () => {
  const host = `127.0.0.1:${port}`;
  for (const path of ['/../package.json', '/preview/../../package.json', '/%2e%2e/package.json', '/..%2fpackage.json']) {
    const res = await get(path, host);
    assert.equal(res.status, 403, path);
  }
});

test('a missing file is 404, and a folder without index.html is not listed', async () => {
  const host = `127.0.0.1:${port}`;
  assert.equal((await get('/preview/no-such-file.js', host)).status, 404);
  assert.equal((await get('/sample-vault/', host)).status, 404);
  assert.equal((await get('/', host)).status, 404);
});
