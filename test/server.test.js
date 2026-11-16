import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/server.js';
import { DEMO_TEXT, generateBasicQuiz } from '../src/questions.js';

async function withApp(options, run) {
  const server = createApp(options);
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const base = `http://127.0.0.1:${server.address().port}`;
  try { await run(base); }
  finally { await new Promise(resolve => server.close(resolve)); }
}

function post(base, body, headers = {}) {
  return fetch(`${base}/api/quiz`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });
}

test('serves app assets while keeping server files and credentials inaccessible', async () => {
  await withApp({ env: {} }, async base => {
    const home = await fetch(base);
    assert.match(await home.text(), /Reading Lab/);
    assert.equal((await fetch(`${base}/src/questions.js`)).status, 200);
    assert.equal((await fetch(`${base}/.env`)).status, 404);
    assert.equal((await fetch(`${base}/src/server.js`)).status, 404);
    assert.equal((await fetch(`${base}/vendor/pdfjs/build/pdf.mjs`)).status, 200);
    assert.deepEqual(await (await fetch(`${base}/api/config`)).json(), { aiEnabled: false });
  });
});

test('API rejects invalid requests and reports missing AI configuration', async () => {
  await withApp({ env: {} }, async base => {
    assert.equal((await post(base, { text: 'short', count: 5, difficulty: 'standard' })).status, 400);
    assert.equal((await post(base, { text: DEMO_TEXT, count: 3, difficulty: 'standard' })).status, 503);
    assert.equal((await post(base, { text: DEMO_TEXT, count: 3, difficulty: 'standard' }, { Origin: 'https://other.example' })).status, 403);
  });
});

test('AI route sends server-only credentials and validates returned questions', async () => {
  let sent;
  const upstreamQuiz = generateBasicQuiz(DEMO_TEXT, 3);
  const fetcher = async (url, options) => {
    sent = { url, options };
    return Response.json({ choices: [{ message: { content: JSON.stringify(upstreamQuiz) } }] });
  };
  await withApp({ env: { OPENAI_API_KEY: 'test-secret', OPENAI_MODEL: 'test-model' }, fetcher }, async base => {
    const response = await post(base, { text: DEMO_TEXT, count: 3, difficulty: 'standard' });
    assert.equal(response.status, 200);
    const quiz = await response.json();
    assert.equal(quiz.mode, 'ai');
    assert.equal(quiz.questions.length, 3);
    assert.equal(sent.options.headers.Authorization, 'Bearer test-secret');
    assert.equal(JSON.parse(sent.options.body).model, 'test-model');
    const config = await (await fetch(`${base}/api/config`)).text();
    assert.ok(!config.includes('test-secret'));
  });
});

test('AI errors produce a recoverable message without leaking the provider response', async () => {
  const fetcher = async () => new Response('sensitive provider diagnostics', { status: 401 });
  await withApp({ env: { OPENAI_API_KEY: 'secret' }, fetcher }, async base => {
    const response = await post(base, { text: DEMO_TEXT, count: 3, difficulty: 'standard' });
    const data = await response.json();
    assert.equal(response.status, 400);
    assert.match(data.error, /鉴权/);
    assert.ok(!data.error.includes('sensitive'));
  });
});

test('configured site password protects both the interface and API', async () => {
  await withApp({ env: { APP_PASSWORD: 'study-pass' } }, async base => {
    assert.equal((await fetch(base)).status, 401);
    const response = await fetch(`${base}/api/config`, { headers: { Authorization: `Basic ${Buffer.from('student:study-pass').toString('base64')}` } });
    assert.equal(response.status, 200);
  });
});
