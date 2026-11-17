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
    assert.deepEqual(await (await fetch(`${base}/api/config`)).json(), { aiEnabled: false, deepseekAvailable: true, deepseekConfigured: false, deepseekModel: 'deepseek-flash' });
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

test('DeepSeek uses JSON object mode and keeps key on server', async () => {
  let sent;
  const fetcher = async (url, options) => {
    sent = { url, options, body: JSON.parse(options.body) };
    return Response.json({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(generateBasicQuiz(DEMO_TEXT, 3)) } }] });
  };
  await withApp({ env: { OPENAI_API_KEY: 'deepseek-test-secret', OPENAI_BASE_URL: 'https://api.deepseek.com' }, fetcher }, async base => {
    const response = await post(base, { text: DEMO_TEXT, count: 3, difficulty: 'standard' });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).questions.length, 3);
    assert.equal(sent.url, 'https://api.deepseek.com/chat/completions');
    assert.deepEqual(sent.body.response_format, { type: 'json_object' });
    assert.equal(sent.body.model, 'deepseek-flash');
    assert.deepEqual(sent.body.thinking, { type: 'disabled' });
    assert.equal(sent.body.max_tokens, 8000);
    assert.match(sent.body.messages[0].content, /"answerIndex":0/);
    assert.equal(sent.options.headers.Authorization, 'Bearer deepseek-test-secret');
    assert.ok(!(await (await fetch(`${base}/api/config`)).text()).includes('deepseek-test-secret'));
  });
});

test('provider empty output, truncation and low balance fail without automatic charged retries', async () => {
  for (const scenario of [
    { response: () => Response.json({ choices: [{ message: { content: '  ' } }] }), pattern: /空内容/ },
    { response: () => Response.json({ choices: [{ finish_reason: 'length', message: { content: '{}' } }] }), pattern: /长度限制/ },
    { response: () => new Response('private diagnostics', { status: 402 }), pattern: /余额不足/ }
  ]) {
    let calls = 0;
    await withApp({ env: { OPENAI_API_KEY: 'secret', OPENAI_BASE_URL: 'https://api.deepseek.com' }, fetcher: async () => { calls++; return scenario.response(); } }, async base => {
      const response = await post(base, { text: DEMO_TEXT, count: 3, difficulty: 'standard' });
      assert.equal(response.status, 400);
      assert.match((await response.json()).error, scenario.pattern);
      assert.equal(calls, 1);
    });
  }
});

test('page DeepSeek key and selected model override only this request at the fixed official endpoint', async () => {
  const env = { OPENAI_API_KEY: 'different-provider-key', OPENAI_BASE_URL: 'https://other.example/v1', OPENAI_MODEL: 'other-model' };
  const original = { ...env };
  let sent;
  await withApp({ env, fetcher: async (url, options) => {
    sent = { url, headers: options.headers, body: JSON.parse(options.body), redirect: options.redirect };
    return Response.json({ choices: [{ message: { content: JSON.stringify(generateBasicQuiz(DEMO_TEXT, 3)) } }] });
  } }, async base => {
    const response = await post(base, { text: DEMO_TEXT, count: 3, difficulty: 'standard', deepseek: { key: 'page-test-secret', model: 'deepseek-v4-pro', baseURL: 'https://untrusted.example' } });
    assert.equal(response.status, 200);
    const text = await response.text();
    assert.equal(JSON.parse(text).model, 'deepseek-v4-pro');
    assert.ok(!text.includes('page-test-secret'));
    assert.equal(sent.url, 'https://api.deepseek.com/chat/completions');
    assert.equal(sent.headers.Authorization, 'Bearer page-test-secret');
    assert.equal(sent.body.model, 'deepseek-v4-pro');
    assert.equal(sent.body.response_format.type, 'json_object');
    assert.equal(sent.redirect, 'error');
    const config = await (await fetch(`${base}/api/config`)).json();
    assert.equal(config.deepseekConfigured, false);
    assert.ok(!JSON.stringify(config).includes('secret'));
    assert.deepEqual(env, original);
  });
});

test('page can supply a key without server credentials or reuse an existing DeepSeek key', async () => {
  for (const ownKey of [true, false]) {
    let authorization;
    const env = ownKey ? {} : { OPENAI_API_KEY: 'configured-test-secret', OPENAI_BASE_URL: 'https://api.deepseek.com', OPENAI_MODEL: 'deepseek-flash' };
    await withApp({ env, fetcher: async (_url, options) => {
      authorization = options.headers.Authorization;
      return Response.json({ choices: [{ message: { content: JSON.stringify(generateBasicQuiz(DEMO_TEXT, 3)) } }] });
    } }, async base => {
      const response = await post(base, { text: DEMO_TEXT, count: 3, difficulty: 'standard', deepseek: { model: 'deepseek-flash', key: ownKey ? 'page-test-secret' : '' } });
      assert.equal(response.status, 200);
      assert.equal(authorization, `Bearer ${ownKey ? 'page-test-secret' : 'configured-test-secret'}`);
    });
  }
});

test('rejects invalid DeepSeek settings and never sends another provider key to DeepSeek', async () => {
  for (const settings of [null, [], {model:'unknown'}, {model:'deepseek-flash',key:'bad key'}, {model:'deepseek-flash',key:123}, {model:'deepseek-flash',key:''}]) {
    let calls = 0;
    await withApp({ env: { OPENAI_API_KEY: 'other-provider-secret', OPENAI_BASE_URL: 'https://other.example' }, fetcher: async () => { calls++; throw new Error('must not call'); } }, async base => {
      const response = await post(base, { text: DEMO_TEXT, count: 3, difficulty: 'standard', deepseek: settings });
      assert.equal(response.status, settings?.key === '' ? 503 : 400);
      assert.equal(calls, 0);
      assert.ok(!(await response.text()).includes('other-provider-secret'));
    });
  }
});
