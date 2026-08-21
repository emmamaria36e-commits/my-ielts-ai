'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const vm = require('node:vm');
const wordParser = require('../js/services/wordParser');
const { buildPrompt, buildRepairPrompt, getLengthRequirement } = require('../server/promptBuilder');

const {
  buildSpeechSsml,
  chooseRecoveryAction,
  containsTargetWord,
  createBetaInviteRegistry,
  createCostProtection,
  createServer,
  escapeXml,
  getClientAddress,
  identifyBetaInvite,
  inspectPassage,
  parseModelContent,
  parseTrustProxyHops,
  requestPassage,
  requestSpeech,
  readCostProtectionConfig,
  stripSpeakerLabels,
  validateGenerateRequest,
  validateModelResult,
  validateSpeechRequest,
} = require('../server');

const params = {
  words: ['environment', 'sustainable development'],
  section: 'section-4',
  voices: ['british-female'],
  difficulty: 'medium',
};

const validPassage = [
  'Today we will examine how the environment is changing in modern cities.',
  'We will also consider why sustainable development matters to future communities.',
].join(' ');

const BETA_TEST_INVITE = 'closed-beta-test-invite';
const BETA_TEST_INVITE_TWO = 'closed-beta-test-invite-two';
const BETA_TEST_INVITE_THREE = 'closed-beta-test-invite-three';

function createTestCostConfig(overrides = {}) {
  return {
    ai: {
      enabled: true,
      perInviteDailyLimit: 50,
      globalDailyLimit: 100,
      globalConcurrency: 3,
      ...(overrides.ai || {}),
    },
    speech: {
      enabled: true,
      perInviteDailyLimit: 50,
      globalDailyLimit: 100,
      globalConcurrency: 3,
      ...(overrides.speech || {}),
    },
  };
}

async function withBetaAccessServer(callback, options = {}) {
  const costConfig = options.costConfig || createTestCostConfig();
  const server = createServer({
    betaInviteRegistry: createBetaInviteRegistry(
      options.inviteCodes || [BETA_TEST_INVITE, BETA_TEST_INVITE_TWO, BETA_TEST_INVITE_THREE].join(',')
    ),
    costConfig,
    costProtection: options.costProtection,
    requestPassage: options.requestPassage,
    requestSpeech: options.requestSpeech,
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    await callback(server.address().port);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

function postApi(port, pathname, invite, body = {}) {
  return new Promise((resolve, reject) => {
    const headers = { 'Content-Type': 'application/json' };
    if (invite !== undefined) headers['X-Beta-Invite'] = invite;
    const request = http.request({
      hostname: '127.0.0.1',
      port,
      path: pathname,
      method: 'POST',
      headers,
    }, (response) => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => { body += chunk; });
      response.on('end', () => {
        const isJson = String(response.headers['content-type'] || '').includes('application/json');
        resolve({
          status: response.statusCode,
          payload: body && isJson ? JSON.parse(body) : null,
          body,
        });
      });
    });
    request.on('error', reject);
    request.end(JSON.stringify(body));
  });
}

function getApi(port, pathname, headers = {}) {
  return new Promise((resolve, reject) => {
    const request = http.request({
      hostname: '127.0.0.1',
      port,
      path: pathname,
      method: 'GET',
      headers,
    }, (response) => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => { body += chunk; });
      response.on('end', () => {
        resolve({
          status: response.statusCode,
          payload: JSON.parse(body),
        });
      });
    });
    request.on('error', reject);
    request.end();
  });
}

function validGenerateBody() {
  return {
    words: ['environment'],
    section: 'section-4',
    voices: ['british-female'],
    difficulty: 'medium',
  };
}

function validSpeechBody() {
  return { text: validPassage, voice: 'british-female' };
}

function successfulPassage() {
  return {
    title: 'Test passage',
    passage: validPassage,
    targetWords: ['environment'],
    metadata: { attempts: 1 },
  };
}

function waitFor(predicate) {
  return new Promise((resolve, reject) => {
    let remaining = 100;
    function check() {
      if (predicate()) return resolve();
      remaining -= 1;
      if (!remaining) return reject(new Error('Timed out waiting for test condition.'));
      setImmediate(check);
    }
    check();
  });
}

function getTestInviteId(invite = BETA_TEST_INVITE) {
  return identifyBetaInvite({ headers: { 'x-beta-invite': invite } }, createBetaInviteRegistry(invite)).id;
}

test('health endpoint succeeds without a beta invite and returns only ok', async () => {
  await withBetaAccessServer(async (port) => {
    const result = await getApi(port, '/health');
    assert.equal(result.status, 200);
    assert.deepEqual(result.payload, { ok: true });
  });
});

test('health endpoint does not consume quota or acquire concurrency', async () => {
  const config = createTestCostConfig();
  const protection = createCostProtection(config);
  await withBetaAccessServer(async (port) => {
    assert.equal((await getApi(port, '/health')).status, 200);
    assert.deepEqual(protection.inspect('ai', getTestInviteId()), {
      day: protection.inspect('ai', getTestInviteId()).day,
      inviteDaily: 0,
      globalDaily: 0,
      inviteActive: false,
      globalActive: 0,
    });
    assert.equal(protection.inspect('speech', getTestInviteId()).globalDaily, 0);
  }, { costConfig: config, costProtection: protection });
});

test('health endpoint does not call AI or Speech providers', async () => {
  let aiCalls = 0;
  let speechCalls = 0;
  await withBetaAccessServer(async (port) => {
    assert.equal((await getApi(port, '/health')).status, 200);
    assert.equal(aiCalls, 0);
    assert.equal(speechCalls, 0);
  }, {
    requestPassage: async () => { aiCalls += 1; return successfulPassage(); },
    requestSpeech: async () => { speechCalls += 1; return Buffer.from('audio'); },
  });
});

test('legacy health path also returns no configuration details', async () => {
  await withBetaAccessServer(async (port) => {
    const result = await getApi(port, '/api/health');
    assert.deepEqual(result.payload, { ok: true });
    assert.equal(Object.hasOwn(result.payload, 'aiConfigured'), false);
    assert.equal(Object.hasOwn(result.payload, 'speechConfigured'), false);
  });
});

test('invalid proxy hop configuration falls back to trusting no proxy', () => {
  for (const value of [undefined, '', 'yes', '-1', '1.5', '11', '999999999']) {
    assert.equal(parseTrustProxyHops(value), 0);
  }

  const request = {
    headers: { 'x-forwarded-for': '203.0.113.10' },
    socket: { remoteAddress: '127.0.0.1' },
  };
  assert.equal(getClientAddress(request, parseTrustProxyHops('invalid')), '127.0.0.1');
});

test('trusted proxy hops select only the configured position from the right', () => {
  const request = {
    headers: { 'x-forwarded-for': '192.0.2.50, 198.51.100.25' },
    socket: { remoteAddress: '127.0.0.1' },
  };
  assert.equal(getClientAddress(request, 0), '127.0.0.1');
  assert.equal(getClientAddress(request, 1), '198.51.100.25');
  assert.equal(getClientAddress(request, 2), '192.0.2.50');
});

test('generate endpoint rejects a missing beta invite', async () => {
  await withBetaAccessServer(async (port) => {
    const result = await postApi(port, '/api/generate');
    assert.equal(result.status, 403);
    assert.equal(result.payload.error.message, '测试邀请码无效或已失效，请重新输入。');
  });
});

test('generate endpoint rejects an invalid beta invite', async () => {
  await withBetaAccessServer(async (port) => {
    const result = await postApi(port, '/api/generate', 'incorrect-invite');
    assert.equal(result.status, 403);
    assert.equal(result.payload.error.code, 'BETA_ACCESS_DENIED');
  });
});

test('generate endpoint with a valid invite reaches existing request validation', async () => {
  await withBetaAccessServer(async (port) => {
    const result = await postApi(port, '/api/generate', BETA_TEST_INVITE);
    assert.equal(result.status, 400);
    assert.match(result.payload.error.message, /target words/);
  });
});

test('speech endpoint rejects a missing beta invite', async () => {
  await withBetaAccessServer(async (port) => {
    const result = await postApi(port, '/api/speech');
    assert.equal(result.status, 403);
    assert.equal(result.payload.error.message, '测试邀请码无效或已失效，请重新输入。');
  });
});

test('speech endpoint rejects an invalid beta invite', async () => {
  await withBetaAccessServer(async (port) => {
    const result = await postApi(port, '/api/speech', 'incorrect-invite');
    assert.equal(result.status, 403);
    assert.equal(result.payload.error.code, 'BETA_ACCESS_DENIED');
  });
});

test('speech endpoint with a valid invite reaches existing request validation', async () => {
  await withBetaAccessServer(async (port) => {
    const result = await postApi(port, '/api/speech', BETA_TEST_INVITE);
    assert.equal(result.status, 400);
    assert.match(result.payload.error.message, /Speech text/);
  });
});

test('validated invite identity is anonymous and the registry does not retain plaintext', () => {
  const registry = createBetaInviteRegistry(` ${BETA_TEST_INVITE}, second-test-invite `);
  const identity = identifyBetaInvite({
    headers: { 'x-beta-invite': BETA_TEST_INVITE },
  }, registry);

  assert.equal(typeof identity.id, 'string');
  assert.equal(identity.id.length, 16);
  assert.notEqual(identity.id, BETA_TEST_INVITE);
  assert.equal(JSON.stringify(Array.from(registry.entries())).includes(BETA_TEST_INVITE), false);
});

test('frontend sources contain no configured beta invite value', () => {
  const frontendFiles = [
    'index.html',
    'js/generator.js',
    'js/services/betaAccess.js',
    'js/services/apiProvider.js',
    'js/services/speechService.js',
  ];
  const frontendSource = frontendFiles
    .map((file) => fs.readFileSync(path.join(__dirname, '..', file), 'utf8'))
    .join('\n');
  const configuredInvites = String(process.env.BETA_INVITE_CODES || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);

  assert.equal(frontendSource.includes(BETA_TEST_INVITE), false);
  assert.equal(
    configuredInvites.some((invite) => frontendSource.includes(invite)),
    false,
    'Frontend source must not contain a configured beta invite.'
  );
});

test('beta invite rejection does not print invite plaintext to logs', async () => {
  const attemptedInvite = 'invite-that-must-not-be-logged';
  const captured = [];
  const original = {
    error: console.error,
    info: console.info,
    log: console.log,
    warn: console.warn,
  };
  Object.keys(original).forEach((method) => {
    console[method] = function () {
      captured.push(Array.from(arguments).map(String).join(' '));
    };
  });

  try {
    await withBetaAccessServer(async (port) => {
      const result = await postApi(port, '/api/generate', attemptedInvite);
      assert.equal(result.status, 403);
    });
  } finally {
    Object.keys(original).forEach((method) => {
      console[method] = original[method];
    });
  }

  assert.equal(captured.some((line) => line.includes(attemptedInvite)), false);
});

function loadMockProvider() {
  const sourcePath = path.join(__dirname, '..', 'js', 'services', 'mockProvider.js');
  const source = fs.readFileSync(sourcePath, 'utf8');
  const browserWindow = { PromptBuilder: null };
  const sandbox = {
    window: browserWindow,
    console: { log: function () {} },
    Math,
    Promise,
    setTimeout: function (callback) { callback(); },
  };
  vm.runInNewContext(source, sandbox, { filename: sourcePath });
  return browserWindow.MockAIProvider;
}

function loadBetaAccess(options = {}) {
  const sourcePath = path.join(__dirname, '..', 'js', 'services', 'betaAccess.js');
  const source = fs.readFileSync(sourcePath, 'utf8');
  const storage = new Map(Object.entries(options.storage || {}));
  const requests = [];
  const prompts = (options.prompts || []).slice();
  const responses = (options.responses || [{ status: 200 }]).slice();
  const alerts = [];
  const browserWindow = {
    alert: (message) => alerts.push(message),
    fetch: (url, requestOptions) => {
      requests.push({ url, options: requestOptions });
      return Promise.resolve(responses.shift() || { status: 200 });
    },
    prompt: () => prompts.shift() ?? null,
    sessionStorage: {
      getItem: (key) => storage.get(key) || null,
      removeItem: (key) => storage.delete(key),
      setItem: (key, value) => storage.set(key, value),
    },
  };
  const sandbox = { window: browserWindow, Promise, Error, Object };
  vm.runInNewContext(source, sandbox, { filename: sourcePath });
  return { alerts, requests, storage, BetaAccess: browserWindow.BetaAccess };
}

test('frontend stores the first invite in sessionStorage and sends the beta header', async () => {
  const browser = loadBetaAccess({ prompts: [' first-session-invite '] });
  const response = await browser.BetaAccess.fetch('/api/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });

  assert.equal(response.status, 200);
  assert.equal(browser.requests[0].options.headers['X-Beta-Invite'], 'first-session-invite');
  assert.equal(browser.storage.get('my-ielts-ai-beta-invite'), 'first-session-invite');
});

test('frontend clears a rejected invite and retries once with a replacement', async () => {
  const browser = loadBetaAccess({
    storage: { 'my-ielts-ai-beta-invite': 'expired-session-invite' },
    prompts: ['replacement-session-invite'],
    responses: [{ status: 403 }, { status: 200 }],
  });
  const response = await browser.BetaAccess.fetch('/api/speech', { method: 'POST' });

  assert.equal(response.status, 200);
  assert.equal(browser.requests.length, 2);
  assert.equal(browser.requests[0].options.headers['X-Beta-Invite'], 'expired-session-invite');
  assert.equal(browser.requests[1].options.headers['X-Beta-Invite'], 'replacement-session-invite');
  assert.deepEqual(browser.alerts, ['测试邀请码无效或已失效，请重新输入。']);
  assert.equal(browser.storage.get('my-ielts-ai-beta-invite'), 'replacement-session-invite');
});

test('per-invite AI daily quota rejects before another provider call', async () => {
  const config = createTestCostConfig({ ai: { perInviteDailyLimit: 1 } });
  const protection = createCostProtection(config);
  let providerCalls = 0;
  await withBetaAccessServer(async (port) => {
    const first = await postApi(port, '/api/generate', BETA_TEST_INVITE, validGenerateBody());
    const second = await postApi(port, '/api/generate', BETA_TEST_INVITE, validGenerateBody());
    assert.equal(first.status, 200);
    assert.equal(second.status, 429);
    assert.equal(providerCalls, 1);
  }, {
    costConfig: config,
    costProtection: protection,
    requestPassage: async () => { providerCalls += 1; return successfulPassage(); },
  });
});

test('per-invite Speech daily quota rejects before another provider call', async () => {
  const config = createTestCostConfig({ speech: { perInviteDailyLimit: 1 } });
  const protection = createCostProtection(config);
  let providerCalls = 0;
  await withBetaAccessServer(async (port) => {
    const first = await postApi(port, '/api/speech', BETA_TEST_INVITE, validSpeechBody());
    const second = await postApi(port, '/api/speech', BETA_TEST_INVITE, validSpeechBody());
    assert.equal(first.status, 200);
    assert.equal(second.status, 429);
    assert.equal(providerCalls, 1);
  }, {
    costConfig: config,
    costProtection: protection,
    requestSpeech: async () => { providerCalls += 1; return Buffer.from('audio'); },
  });
});

test('global AI daily quota rejects a different invite before provider call', async () => {
  const config = createTestCostConfig({ ai: { globalDailyLimit: 1 } });
  const protection = createCostProtection(config);
  let providerCalls = 0;
  await withBetaAccessServer(async (port) => {
    assert.equal((await postApi(port, '/api/generate', BETA_TEST_INVITE, validGenerateBody())).status, 200);
    assert.equal((await postApi(port, '/api/generate', BETA_TEST_INVITE_TWO, validGenerateBody())).status, 429);
    assert.equal(providerCalls, 1);
  }, {
    costConfig: config,
    costProtection: protection,
    requestPassage: async () => { providerCalls += 1; return successfulPassage(); },
  });
});

test('global Speech daily quota rejects a different invite before provider call', async () => {
  const config = createTestCostConfig({ speech: { globalDailyLimit: 1 } });
  const protection = createCostProtection(config);
  let providerCalls = 0;
  await withBetaAccessServer(async (port) => {
    assert.equal((await postApi(port, '/api/speech', BETA_TEST_INVITE, validSpeechBody())).status, 200);
    assert.equal((await postApi(port, '/api/speech', BETA_TEST_INVITE_TWO, validSpeechBody())).status, 429);
    assert.equal(providerCalls, 1);
  }, {
    costConfig: config,
    costProtection: protection,
    requestSpeech: async () => { providerCalls += 1; return Buffer.from('audio'); },
  });
});

test('same invite second AI request is rejected while the first is active', async () => {
  const config = createTestCostConfig();
  const protection = createCostProtection(config);
  let providerCalls = 0;
  let finish;
  await withBetaAccessServer(async (port) => {
    const firstRequest = postApi(port, '/api/generate', BETA_TEST_INVITE, validGenerateBody());
    await waitFor(() => providerCalls === 1);
    const second = await postApi(port, '/api/generate', BETA_TEST_INVITE, validGenerateBody());
    assert.equal(second.status, 429);
    finish(successfulPassage());
    assert.equal((await firstRequest).status, 200);
  }, {
    costConfig: config,
    costProtection: protection,
    requestPassage: () => { providerCalls += 1; return new Promise((resolve) => { finish = resolve; }); },
  });
});

test('same invite second Speech request is rejected while the first is active', async () => {
  const config = createTestCostConfig();
  const protection = createCostProtection(config);
  let providerCalls = 0;
  let finish;
  await withBetaAccessServer(async (port) => {
    const firstRequest = postApi(port, '/api/speech', BETA_TEST_INVITE, validSpeechBody());
    await waitFor(() => providerCalls === 1);
    const second = await postApi(port, '/api/speech', BETA_TEST_INVITE, validSpeechBody());
    assert.equal(second.status, 429);
    finish(Buffer.from('audio'));
    assert.equal((await firstRequest).status, 200);
  }, {
    costConfig: config,
    costProtection: protection,
    requestSpeech: () => { providerCalls += 1; return new Promise((resolve) => { finish = resolve; }); },
  });
});

test('global AI concurrency rejects another invite immediately', async () => {
  const config = createTestCostConfig({ ai: { globalConcurrency: 1 } });
  const protection = createCostProtection(config);
  let providerCalls = 0;
  let finish;
  await withBetaAccessServer(async (port) => {
    const firstRequest = postApi(port, '/api/generate', BETA_TEST_INVITE, validGenerateBody());
    await waitFor(() => providerCalls === 1);
    const second = await postApi(port, '/api/generate', BETA_TEST_INVITE_TWO, validGenerateBody());
    assert.equal(second.status, 429);
    assert.equal(providerCalls, 1);
    assert.equal(protection.inspect('ai', getTestInviteId(BETA_TEST_INVITE_TWO)).inviteDaily, 0);
    finish(successfulPassage());
    await firstRequest;
  }, {
    costConfig: config,
    costProtection: protection,
    requestPassage: () => { providerCalls += 1; return new Promise((resolve) => { finish = resolve; }); },
  });
});

test('global Speech concurrency rejects another invite immediately', async () => {
  const config = createTestCostConfig({ speech: { globalConcurrency: 1 } });
  const protection = createCostProtection(config);
  let providerCalls = 0;
  let finish;
  await withBetaAccessServer(async (port) => {
    const firstRequest = postApi(port, '/api/speech', BETA_TEST_INVITE, validSpeechBody());
    await waitFor(() => providerCalls === 1);
    const second = await postApi(port, '/api/speech', BETA_TEST_INVITE_TWO, validSpeechBody());
    assert.equal(second.status, 429);
    assert.equal(providerCalls, 1);
    assert.equal(protection.inspect('speech', getTestInviteId(BETA_TEST_INVITE_TWO)).inviteDaily, 0);
    finish(Buffer.from('audio'));
    await firstRequest;
  }, {
    costConfig: config,
    costProtection: protection,
    requestSpeech: () => { providerCalls += 1; return new Promise((resolve) => { finish = resolve; }); },
  });
});

test('AI kill switch returns 503 with zero DeepSeek calls', async () => {
  const config = createTestCostConfig({ ai: { enabled: false } });
  let providerCalls = 0;
  await withBetaAccessServer(async (port) => {
    const result = await postApi(port, '/api/generate', BETA_TEST_INVITE, validGenerateBody());
    assert.equal(result.status, 503);
    assert.equal(providerCalls, 0);
  }, {
    costConfig: config,
    requestPassage: async () => { providerCalls += 1; return successfulPassage(); },
  });
});

test('Speech kill switch returns 503 with zero Azure calls', async () => {
  const config = createTestCostConfig({ speech: { enabled: false } });
  let providerCalls = 0;
  await withBetaAccessServer(async (port) => {
    const result = await postApi(port, '/api/speech', BETA_TEST_INVITE, validSpeechBody());
    assert.equal(result.status, 503);
    assert.equal(providerCalls, 0);
  }, {
    costConfig: config,
    requestSpeech: async () => { providerCalls += 1; return Buffer.from('audio'); },
  });
});

async function assertTwoAttemptGenerateChargesOnce(recoveryAction) {
  const config = createTestCostConfig();
  const protection = createCostProtection(config);
  let providerAttempts = 0;
  await withBetaAccessServer(async (port) => {
    const result = await postApi(port, '/api/generate', BETA_TEST_INVITE, validGenerateBody());
    assert.equal(result.status, 200);
    assert.equal(providerAttempts, 2);
    assert.equal(protection.inspect('ai', getTestInviteId()).inviteDaily, 1);
  }, {
    costConfig: config,
    costProtection: protection,
    requestPassage: async () => {
      providerAttempts += 2;
      return { ...successfulPassage(), metadata: { attempts: 2, recoveryAction } };
    },
  });
}

test('Generate Initial plus Repair consumes one user quota', async () => {
  await assertTwoAttemptGenerateChargesOnce('repair');
});

test('Generate Initial plus Regenerate consumes one user quota', async () => {
  await assertTwoAttemptGenerateChargesOnce('regenerate');
});

test('Speech provider retry consumes one user quota', async () => {
  const config = createTestCostConfig();
  const protection = createCostProtection(config);
  let providerAttempts = 0;
  await withBetaAccessServer(async (port) => {
    assert.equal((await postApi(port, '/api/speech', BETA_TEST_INVITE, validSpeechBody())).status, 200);
    assert.equal(providerAttempts, 2);
    assert.equal(protection.inspect('speech', getTestInviteId()).inviteDaily, 1);
  }, {
    costConfig: config,
    costProtection: protection,
    requestSpeech: async () => { providerAttempts += 2; return Buffer.from('audio'); },
  });
});

test('concurrency rejection does not consume another quota', async () => {
  const config = createTestCostConfig();
  const protection = createCostProtection(config);
  let started = false;
  let finish;
  await withBetaAccessServer(async (port) => {
    const firstRequest = postApi(port, '/api/generate', BETA_TEST_INVITE, validGenerateBody());
    await waitFor(() => started);
    assert.equal((await postApi(port, '/api/generate', BETA_TEST_INVITE, validGenerateBody())).status, 429);
    assert.equal(protection.inspect('ai', getTestInviteId()).inviteDaily, 1);
    finish(successfulPassage());
    await firstRequest;
  }, {
    costConfig: config,
    costProtection: protection,
    requestPassage: () => { started = true; return new Promise((resolve) => { finish = resolve; }); },
  });
});

test('kill switch rejection does not consume quota', async () => {
  const config = createTestCostConfig({ ai: { enabled: false } });
  const protection = createCostProtection(config);
  await withBetaAccessServer(async (port) => {
    assert.equal((await postApi(port, '/api/generate', BETA_TEST_INVITE, validGenerateBody())).status, 503);
    assert.equal(protection.inspect('ai', getTestInviteId()).inviteDaily, 0);
  }, { costConfig: config, costProtection: protection });
});

test('invalid invite rejection does not consume quota', async () => {
  const config = createTestCostConfig();
  const protection = createCostProtection(config);
  await withBetaAccessServer(async (port) => {
    assert.equal((await postApi(port, '/api/generate', 'invalid-invite', validGenerateBody())).status, 403);
    assert.equal(protection.inspect('ai', getTestInviteId()).globalDaily, 0);
  }, { costConfig: config, costProtection: protection });
});

test('provider throw releases the AI concurrency slot', async () => {
  const config = createTestCostConfig();
  const protection = createCostProtection(config);
  let calls = 0;
  await withBetaAccessServer(async (port) => {
    assert.equal((await postApi(port, '/api/generate', BETA_TEST_INVITE, validGenerateBody())).status, 500);
    assert.equal(protection.inspect('ai', getTestInviteId()).inviteActive, false);
    assert.equal((await postApi(port, '/api/generate', BETA_TEST_INVITE, validGenerateBody())).status, 200);
  }, {
    costConfig: config,
    costProtection: protection,
    requestPassage: async () => {
      calls += 1;
      if (calls === 1) throw new Error('test provider failure');
      return successfulPassage();
    },
  });
});

test('provider error releases the Speech concurrency slot', async () => {
  const config = createTestCostConfig();
  const protection = createCostProtection(config);
  let calls = 0;
  await withBetaAccessServer(async (port) => {
    assert.equal((await postApi(port, '/api/speech', BETA_TEST_INVITE, validSpeechBody())).status, 500);
    assert.equal(protection.inspect('speech', getTestInviteId()).inviteActive, false);
    assert.equal((await postApi(port, '/api/speech', BETA_TEST_INVITE, validSpeechBody())).status, 200);
  }, {
    costConfig: config,
    costProtection: protection,
    requestSpeech: async () => {
      calls += 1;
      if (calls === 1) throw new Error('test provider failure');
      return Buffer.from('audio');
    },
  });
});

test('Repair or Regenerate completion releases the AI slot', async () => {
  const config = createTestCostConfig();
  const protection = createCostProtection(config);
  await withBetaAccessServer(async (port) => {
    assert.equal((await postApi(port, '/api/generate', BETA_TEST_INVITE, validGenerateBody())).status, 200);
    assert.equal(protection.inspect('ai', getTestInviteId()).inviteActive, false);
    assert.equal((await postApi(port, '/api/generate', BETA_TEST_INVITE, validGenerateBody())).status, 200);
  }, {
    costConfig: config,
    costProtection: protection,
    requestPassage: async () => ({ ...successfulPassage(), metadata: { attempts: 2, recoveryAction: 'repair' } }),
  });
});

test('Azure retry completion releases the Speech slot', async () => {
  const config = createTestCostConfig();
  const protection = createCostProtection(config);
  await withBetaAccessServer(async (port) => {
    assert.equal((await postApi(port, '/api/speech', BETA_TEST_INVITE, validSpeechBody())).status, 200);
    assert.equal(protection.inspect('speech', getTestInviteId()).inviteActive, false);
    assert.equal((await postApi(port, '/api/speech', BETA_TEST_INVITE, validSpeechBody())).status, 200);
  }, {
    costConfig: config,
    costProtection: protection,
    requestSpeech: async () => Buffer.from('audio'),
  });
});

test('frontend does not automatically retry a 429 response', async () => {
  const browser = loadBetaAccess({
    storage: { 'my-ielts-ai-beta-invite': 'session-invite' },
    responses: [{ status: 429 }],
  });
  assert.equal((await browser.BetaAccess.fetch('/api/generate')).status, 429);
  assert.equal(browser.requests.length, 1);
  assert.equal(browser.alerts.length, 0);
});

test('frontend does not automatically retry a 503 response', async () => {
  const browser = loadBetaAccess({
    storage: { 'my-ielts-ai-beta-invite': 'session-invite' },
    responses: [{ status: 503 }],
  });
  assert.equal((await browser.BetaAccess.fetch('/api/speech')).status, 503);
  assert.equal(browser.requests.length, 1);
  assert.equal(browser.alerts.length, 0);
});

test('frontend retries 403 at most once', async () => {
  const browser = loadBetaAccess({
    storage: { 'my-ielts-ai-beta-invite': 'expired-invite' },
    prompts: ['replacement-invite', 'must-not-be-requested'],
    responses: [{ status: 403 }, { status: 403 }],
  });
  assert.equal((await browser.BetaAccess.fetch('/api/generate')).status, 403);
  assert.equal(browser.requests.length, 2);
  assert.equal(browser.alerts.length, 2);
  assert.equal(browser.storage.has('my-ielts-ai-beta-invite'), false);
});

test('daily quota resets on the next server-local calendar day', () => {
  let current = new Date(2026, 7, 11, 23, 59, 0);
  const config = createTestCostConfig({ ai: { perInviteDailyLimit: 1 } });
  const protection = createCostProtection(config, { now: () => current });
  const first = protection.acquire('ai', 'anonymous-id');
  assert.equal(first.ok, true);
  first.release();
  assert.equal(protection.acquire('ai', 'anonymous-id').status, 429);
  current = new Date(2026, 7, 12, 0, 1, 0);
  const nextDay = protection.acquire('ai', 'anonymous-id');
  assert.equal(nextDay.ok, true);
  nextDay.release();
});

test('kill switches fail safe unless explicitly true', () => {
  const absent = readCostProtectionConfig({});
  const invalid = readCostProtectionConfig({ AI_ENABLED: 'yes', SPEECH_ENABLED: '1' });
  const enabled = readCostProtectionConfig({ AI_ENABLED: 'true', SPEECH_ENABLED: 'TRUE' });
  assert.equal(absent.ai.enabled, false);
  assert.equal(absent.speech.enabled, false);
  assert.equal(invalid.ai.enabled, false);
  assert.equal(invalid.speech.enabled, false);
  assert.equal(enabled.ai.enabled, true);
  assert.equal(enabled.speech.enabled, true);
});

test('invalid numeric protection config falls back to finite safe defaults', () => {
  const config = readCostProtectionConfig({
    AI_ENABLED: 'true',
    SPEECH_ENABLED: 'true',
    AI_GENERATE_DAILY_LIMIT: 'NaN',
    SPEECH_DAILY_LIMIT: '0',
    GLOBAL_AI_DAILY_LIMIT: '-1',
    GLOBAL_SPEECH_DAILY_LIMIT: '1.5',
    GLOBAL_AI_CONCURRENCY: 'not-a-number',
    GLOBAL_SPEECH_CONCURRENCY: '999999999',
  });

  assert.equal(config.ai.perInviteDailyLimit, 15);
  assert.equal(config.speech.perInviteDailyLimit, 20);
  assert.equal(config.ai.globalDailyLimit, 100);
  assert.equal(config.speech.globalDailyLimit, 150);
  assert.equal(config.ai.globalConcurrency, 3);
  assert.equal(config.speech.globalConcurrency, 3);
  for (const policy of [config.ai, config.speech]) {
    assert.equal(Number.isSafeInteger(policy.perInviteDailyLimit), true);
    assert.equal(Number.isSafeInteger(policy.globalDailyLimit), true);
    assert.equal(Number.isSafeInteger(policy.globalConcurrency), true);
    assert.equal(policy.perInviteDailyLimit > 0, true);
    assert.equal(policy.globalDailyLimit > 0, true);
    assert.equal(policy.globalConcurrency > 0, true);
  }
});

test('request validation normalizes target-word whitespace', () => {
  const result = validateGenerateRequest({
    words: ['  Sustainable   Development  '],
    section: 'section-4',
    voices: ['british-female'],
    difficulty: 'medium',
  });
  assert.deepEqual(result.words, ['sustainable development']);
  assert.equal(result.section, 'section-4');
});

test('request validation accepts only IELTS Listening Section 1–4', () => {
  assert.equal(validateGenerateRequest({
    words: ['environment'],
    section: 'section-1',
    voices: ['british-female'],
    difficulty: 'medium',
  }).section, 'section-1');

  assert.throws(() => validateGenerateRequest({
    words: ['environment'],
    section: 'academic-lecture',
    voices: ['british-female'],
    difficulty: 'medium',
  }), /Unsupported IELTS Listening section/);
});

test('prompt uses Section for content structure and Voice only for playback', () => {
  const sectionOne = buildPrompt({ ...params, section: 'section-1' });
  const sectionFour = buildPrompt({ ...params, section: 'section-4' });

  assert.match(sectionOne.system, /two-person conversation/i);
  assert.match(sectionOne.system, /Speaker A or Speaker B/);
  assert.match(sectionFour.system, /academic monologue/i);
  assert.match(sectionFour.system, /one speaker/i);
  assert.match(sectionOne.system, /Voice is playback metadata only/i);
  assert.match(sectionOne.system, /LENGTH: 160-210 words/);
  assert.match(sectionOne.user, /Required exact target words:\s+1\. environment\s+2\. sustainable development/);
  assert.match(sectionOne.user, /Do not pluralize, conjugate, or derive/);
  assert.match(sectionOne.system, /"coverage"/);
});

test('initial prompt length changes with target-word count', () => {
  assert.equal(getLengthRequirement(1), '160-210 words');
  assert.equal(getLengthRequirement(8), '160-210 words');
  assert.equal(getLengthRequirement(9), '190-250 words');
  assert.equal(getLengthRequirement(14), '190-250 words');
  assert.equal(getLengthRequirement(15), '220-290 words');
  assert.equal(getLengthRequirement(20), '220-290 words');
});

test('repair prompt requires a minimal protected revision', () => {
  const prompt = buildRepairPrompt(
    params,
    { title: 'Draft', passage: validPassage },
    ['sustainable development']
  );

  assert.match(prompt.system, /Do not remove or alter target words that already appear/);
  assert.match(prompt.system, /Do not modify unrelated content/);
  assert.match(prompt.system, /Preserve the original topic, IELTS Section format, structure, and difficulty/);
  assert.match(prompt.system, /smallest natural changes/);
  assert.match(prompt.user, /MISSING TARGET WORDS/);
  assert.match(prompt.user, /EXISTING DRAFT/);
});

test('strict JSON parser accepts JSON and rejects surrounding text', () => {
  assert.deepEqual(
    parseModelContent(JSON.stringify({ title: 'A title', passage: validPassage })),
    { title: 'A title', passage: validPassage }
  );
  assert.throws(
    () => parseModelContent(`Result: ${JSON.stringify({ title: 'A title', passage: validPassage })}`),
    /invalid JSON/
  );
});

test('valid result is trimmed and accepted', () => {
  const result = validateModelResult(
    { title: '  Urban Futures  ', passage: `  ${validPassage}  ` },
    params
  );
  assert.equal(result.title, 'Urban Futures');
  assert.equal(result.passage, validPassage);
});

test('result requires text title and passage', () => {
  assert.throws(() => validateModelResult({ title: 'Title' }, params), /text title and passage/);
  assert.throws(() => validateModelResult({ title: 42, passage: validPassage }, params), /text title and passage/);
});

test('HTML in model fields is rejected', () => {
  assert.throws(
    () => validateModelResult({ title: '<b>Title</b>', passage: validPassage }, params),
    /must not contain HTML/
  );
  assert.throws(
    () => validateModelResult({ title: 'Title', passage: `${validPassage}<script>alert(1)</script>` }, params),
    /must not contain HTML/
  );
});

test('every target word or phrase must be present', () => {
  assert.throws(
    () => validateModelResult(
      { title: 'Title', passage: 'This passage discusses the environment in enough detail for a listening exercise.' },
      params
    ),
    function (error) {
      assert.match(error.message, /every target word/);
      assert.deepEqual(error.missingWords, ['sustainable development']);
      return true;
    }
  );
});

async function withMockAiServer(responder, callback) {
  const requests = [];
  const upstream = http.createServer((request, response) => {
    let body = '';
    request.setEncoding('utf8');
    request.on('data', (chunk) => { body += chunk; });
    request.on('end', () => {
      requests.push(JSON.parse(body));
      responder(requests.length, requests[requests.length - 1], response);
    });
  });

  await new Promise((resolve) => upstream.listen(0, '127.0.0.1', resolve));
  const address = upstream.address();
  const previous = {
    key: process.env.AI_API_KEY,
    endpoint: process.env.AI_API_ENDPOINT,
    model: process.env.AI_MODEL,
    provider: process.env.AI_PROVIDER,
  };

  process.env.AI_API_KEY = 'test-key';
  process.env.AI_API_ENDPOINT = `http://127.0.0.1:${address.port}/chat/completions`;
  process.env.AI_MODEL = 'test-model';
  process.env.AI_PROVIDER = 'test-provider';

  try {
    return await callback(requests);
  } finally {
    await new Promise((resolve) => upstream.close(resolve));
    Object.entries(previous).forEach(([name, value]) => {
      const envName = {
        key: 'AI_API_KEY',
        endpoint: 'AI_API_ENDPOINT',
        model: 'AI_MODEL',
        provider: 'AI_PROVIDER',
      }[name];
      if (value === undefined) delete process.env[envName];
      else process.env[envName] = value;
    });
  }
}

function sendModelResult(response, modelResult) {
  response.writeHead(200, { 'Content-Type': 'application/json' });
  response.end(JSON.stringify({
    choices: [{ message: { content: JSON.stringify(modelResult) } }],
  }));
}

const pipelineParams = {
  ...params,
  words: [
    'environment', 'research', 'community', 'policy',
    'conservation', 'resilience', 'biodiversity', 'ecosystem',
  ],
};
const sixWordDraft = [
  'This research examines how the environment shapes each community and its public policy.',
  'It also considers conservation and resilience in practical planning.',
].join(' ');
const completePipelinePassage = `${sixWordDraft} Biodiversity supports every healthy ecosystem.`;

test('small missing set uses one focused repair within a two-call budget', async () => {
  const logs = [];
  const stats = [];
  await withMockAiServer((attempt, request, response) => {
    sendModelResult(response, attempt === 1
      ? { title: 'Draft', passage: sixWordDraft }
      : {
          title: 'Repaired',
          passage: completePipelinePassage,
          coverage: pipelineParams.words,
        });
  }, async (requests) => {
    const result = await requestPassage(pipelineParams, {
      logger: (event) => logs.push(event),
      statsWriter: (event) => stats.push(event),
    });
    assert.equal(requests.length, 2);
    assert.equal(requests[0].temperature, 0.3);
    assert.match(requests[1].messages[0].content, /smallest natural changes/);
    assert.equal(result.metadata.attempts, 2);
    assert.equal(result.metadata.repaired, true);
    assert.equal(result.metadata.recoveryAction, 'repair');
    assert.equal(result.metadata.initialMissingCount, 2);
    assert.equal(typeof result.passage, 'string');
    assert.equal(typeof result.title, 'string');
    assert.deepEqual(result.targetWords, pipelineParams.words);
    assert.equal(result.coverage, undefined);
    assert.equal(logs.length, 4);
    assert.equal(logs.at(-1).success, true);
    assert.equal(logs.at(-1).totalAttempts, 2);
    assert.equal(JSON.stringify(logs).includes('biodiversity'), false);
    assert.deepEqual(Object.keys(stats[0]).sort(), [
      'durationMs',
      'firstAttemptMissingCount',
      'recoveryAction',
      'section',
      'success',
      'targetWordCount',
      'totalAttempts',
    ]);
    assert.equal(stats[0].firstAttemptMissingCount, 2);
    assert.equal(stats[0].success, true);
    assert.equal(JSON.stringify(stats).includes('biodiversity'), false);
  });
});

test('large missing set regenerates instead of repairing', async () => {
  await withMockAiServer((attempt, request, response) => {
    sendModelResult(response, attempt === 1
      ? { title: 'Weak draft', passage: 'This environment report provides enough introductory material for a listening passage.' }
      : { title: 'Regenerated', passage: completePipelinePassage });
  }, async (requests) => {
    const result = await requestPassage(pipelineParams, { logger: function () {} });
    assert.equal(requests.length, 2);
    assert.match(requests[1].messages[0].content, /expert IELTS Listening script writer/);
    assert.equal(result.metadata.recoveryAction, 'regenerate');
  });
});

test('pipeline stops after two failed model calls', async () => {
  await withMockAiServer((attempt, request, response) => {
    sendModelResult(response, {
      title: 'Incomplete',
      passage: 'This environment report provides enough introductory material for a listening passage.',
    });
  }, async (requests) => {
    await assert.rejects(
      requestPassage(pipelineParams, { logger: function () {} }),
      /every target word/
    );
    assert.equal(requests.length, 2);
  });
});

test('invalid JSON uses the second call for a fresh generation', async () => {
  await withMockAiServer((attempt, request, response) => {
    response.writeHead(200, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify({
      choices: [{
        message: {
          content: attempt === 1
            ? 'not-json'
            : JSON.stringify({ title: 'Regenerated', passage: completePipelinePassage }),
        },
      }],
    }));
  }, async (requests) => {
    const result = await requestPassage(pipelineParams, { logger: function () {} });
    assert.equal(requests.length, 2);
    assert.equal(result.metadata.recoveryAction, 'regenerate');
    assert.equal(result.metadata.attempts, 2);
  });
});

test('target matching normalizes case and punctuation but requires exact lexical tokens', () => {
  assert.equal(containsTargetWord('The ENVIRONMENT matters.', 'environment'), true);
  assert.equal(containsTargetWord('Sustainable development matters.', 'sustainable development'), true);
  assert.equal(containsTargetWord('Sustainable\ndevelopment matters.', 'sustainable development'), true);
  assert.equal(containsTargetWord('Sustainable, development matters.', 'sustainable development'), true);
  assert.equal(containsTargetWord('A long-term policy.', 'long term'), true);
  assert.equal(containsTargetWord('The learner’s feedback.', "learner's"), true);
  assert.equal(containsTargetWord('This is partial evidence.', 'art'), false);
  assert.equal(containsTargetWord('She is studying today.', 'study'), false);
  assert.equal(containsTargetWord('Several planets are visible.', 'planet'), false);
});

test('recovery decision repairs only a small missing set', () => {
  assert.equal(chooseRecoveryAction({
    valid: false,
    failureType: 'missing-target-words',
    missingWords: ['biodiversity', 'ecosystem'],
  }, 1, 8), 'repair');
  assert.equal(chooseRecoveryAction({
    valid: false,
    failureType: 'missing-target-words',
    missingWords: ['research', 'policy'],
  }, 1, 4), 'regenerate');
  assert.equal(chooseRecoveryAction({
    valid: false,
    failureType: 'invalid-structure',
  }, 1, 8), 'regenerate');
  assert.equal(chooseRecoveryAction({
    valid: false,
    failureType: 'missing-target-words',
    missingWords: ['ecosystem'],
  }, 2, 8), 'fail');
});

test('inspectPassage reports a structured missing-word result', () => {
  const inspection = inspectPassage(
    { title: 'Draft', passage: sixWordDraft },
    pipelineParams
  );
  assert.equal(inspection.valid, false);
  assert.equal(inspection.failureType, 'missing-target-words');
  assert.deepEqual(inspection.missingWords, ['biodiversity', 'ecosystem']);
  assert.equal(inspection.candidate.title, 'Draft');
});

test('frontend transcript rendering does not assign model content to innerHTML', () => {
  const generatorPath = path.join(__dirname, '..', 'js', 'generator.js');
  const source = fs.readFileSync(generatorPath, 'utf8');
  assert.doesNotMatch(source, /transcriptText\.innerHTML/);
  assert.doesNotMatch(source, /targetWords\.innerHTML/);
  assert.match(source, /highlight\.textContent = match\[0\]/);
});

test('Mock Provider satisfies the real passage contract for every section and word count', async () => {
  const mockProvider = loadMockProvider();
  const sections = [
    'section-1',
    'section-2',
    'section-3',
    'section-4',
  ];
  const vocabulary = [
    'environment', 'economy', 'sustainable development', 'research', 'community',
    'education', 'technology', 'conservation', 'flexibility', 'priorities',
    'academic', 'resources', 'engagement', 'ecosystem', 'resilience',
    'management', 'intervention', 'policy', 'commitment', 'circumstances',
  ];
  const wordCounts = [1, 3, 10, 20];

  for (const section of sections) {
    for (const count of wordCounts) {
      const words = vocabulary.slice(0, count);
      const result = await mockProvider.generate({
        words,
        section,
        voices: ['british-female'],
        difficulty: 'medium',
      });

      assert.deepEqual(Array.from(result.targetWords), words);
      assert.equal(result.metadata.wordCount, result.passage.split(/\s+/).length);
      assert.doesNotThrow(() => validateModelResult(
        { title: result.title, passage: result.passage },
        { words }
      ));
    }
  }
});

test('Mock Provider normalizes duplicate words and preserves supported punctuation', async () => {
  const mockProvider = loadMockProvider();
  const result = await mockProvider.generate({
    words: [' Environment ', 'environment', 'sustainable   development', 'long-term', "learner's"],
    section: 'section-4',
    voices: ['british-female'],
    difficulty: 'medium',
  });

  const expected = ['environment', 'sustainable development', 'long-term', "learner's"];
  assert.deepEqual(Array.from(result.targetWords), expected);
  assert.doesNotThrow(() => validateModelResult(
    { title: result.title, passage: result.passage },
    { words: expected }
  ));
});

test('Mock Provider rejects invalid target-word input', async () => {
  const mockProvider = loadMockProvider();
  const base = {
    section: 'section-4',
    voices: ['british-female'],
    difficulty: 'medium',
  };

  await assert.rejects(mockProvider.generate({ ...base, words: [] }), /between 1 and 20/);
  await assert.rejects(mockProvider.generate({ ...base, words: new Array(21).fill('environment') }), /between 1 and 20/);
  await assert.rejects(mockProvider.generate({ ...base, words: ['<script>'] }), /Invalid target word/);
});

test('speech request accepts validated text and a supported voice', () => {
  const result = validateSpeechRequest({
    text: validPassage,
    voice: 'british-female',
  });

  assert.deepEqual(result, {
    text: validPassage,
    voice: 'british-female',
  });
});

test('speech request rejects unsupported voices and HTML', () => {
  assert.throws(
    () => validateSpeechRequest({ text: validPassage, voice: 'custom-voice' }),
    /Unsupported speech voice/
  );
  assert.throws(
    () => validateSpeechRequest({ text: `${validPassage}<break/>`, voice: 'british-female' }),
    /must not contain HTML/
  );
});

test('speech SSML escapes untrusted text and uses the trusted voice mapping', () => {
  const text = `Research & development use "evidence" and learners' feedback.`;
  const ssml = buildSpeechSsml({
    text,
    voice: 'british-female',
  });

  assert.match(ssml, /name="en-GB-SoniaNeural"/);
  assert.match(ssml, /Research &amp; development/);
  assert.match(ssml, /&quot;evidence&quot;/);
  assert.match(ssml, /learners&apos; feedback/);
  assert.doesNotMatch(ssml, /Research & development/);
  assert.equal(
    escapeXml('<script>"unsafe" & text</script>'),
    '&lt;script&gt;&quot;unsafe&quot; &amp; text&lt;/script&gt;'
  );
});

test('speech removes trusted dialogue labels without changing transcript text', () => {
  const passage = [
    'Speaker A: Could I make a booking?',
    'Speaker B: Yes, the room is available.',
    'The phrase Speaker A remains when it is not a line label.',
  ].join('\n');
  const cleaned = stripSpeakerLabels(passage);
  const ssml = buildSpeechSsml({ text: passage, voice: 'british-female' });

  assert.equal(cleaned, [
    'Could I make a booking?',
    'Yes, the room is available.',
    'The phrase Speaker A remains when it is not a line label.',
  ].join('\n'));
  assert.doesNotMatch(ssml, /Speaker A:/);
  assert.doesNotMatch(ssml, /Speaker B:/);
  assert.match(ssml, /The phrase Speaker A remains/);
});

test('speech retries one explicit Azure 502 and records anonymous success stats', async () => {
  let upstreamAttempts = 0;
  const stats = [];
  const upstream = http.createServer((request, response) => {
    upstreamAttempts += 1;
    request.resume();
    request.on('end', () => {
      if (upstreamAttempts === 1) {
        response.writeHead(502);
        response.end('temporary failure');
        return;
      }
      response.writeHead(200, { 'Content-Type': 'audio/mpeg' });
      response.end(Buffer.from('test-audio'));
    });
  });

  await new Promise((resolve) => upstream.listen(0, '127.0.0.1', resolve));
  try {
    const address = upstream.address();
    const audio = await requestSpeech(
      { text: validPassage, voice: 'british-female' },
      {
        config: { key: 'test-key', region: 'eastasia' },
        endpoint: `http://127.0.0.1:${address.port}`,
        timeoutMs: 1000,
        statsWriter: (entry) => stats.push(entry),
      }
    );

    assert.equal(upstreamAttempts, 2);
    assert.equal(audio.toString(), 'test-audio');
    assert.deepEqual(Object.keys(stats[0]).sort(), [
      'durationMs', 'status', 'success', 'textLength', 'totalAttempts',
    ]);
    assert.equal(stats[0].success, true);
    assert.equal(stats[0].totalAttempts, 2);
  } finally {
    await new Promise((resolve) => upstream.close(resolve));
  }
});

test('speech timeout does not start another long synthesis request', async () => {
  let upstreamAttempts = 0;
  const stats = [];
  const upstream = http.createServer((request, response) => {
    upstreamAttempts += 1;
    request.resume();
    request.on('end', () => {
      setTimeout(() => {
        if (!response.destroyed) {
          response.writeHead(200, { 'Content-Type': 'audio/mpeg' });
          response.end(Buffer.from('late-audio'));
        }
      }, 100);
    });
  });

  await new Promise((resolve) => upstream.listen(0, '127.0.0.1', resolve));
  try {
    await assert.rejects(
      requestSpeech(
        { text: validPassage, voice: 'british-female' },
        {
          config: { key: 'test-key', region: 'eastasia' },
          endpoint: `http://127.0.0.1:${upstream.address().port}`,
          timeoutMs: 10,
          statsWriter: (entry) => stats.push(entry),
        }
      ),
      /timed out/
    );

    assert.equal(upstreamAttempts, 1);
    assert.equal(stats[0].success, false);
    assert.equal(stats[0].status, 'provider-timeout');
    assert.equal(stats[0].totalAttempts, 1);
  } finally {
    await new Promise((resolve) => upstream.close(resolve));
  }
});

test('generate button is disabled while an AI request is in progress', () => {
  const generatorPath = path.join(__dirname, '..', 'js', 'generator.js');
  const source = fs.readFileSync(generatorPath, 'utf8');
  assert.match(source, /setGeneratingState\(true\)/);
  assert.match(source, /正在生成学习材料…/);
  assert.match(source, /aria-busy/);
  assert.match(source, /classList\.contains\('loading'\)/);
});

test('long speech generation shows a patient waiting message', () => {
  const generatorPath = path.join(__dirname, '..', 'js', 'generator.js');
  const source = fs.readFileSync(generatorPath, 'utf8');
  assert.match(source, /长文本音频通常需要约 30–60 秒/);
  assert.match(source, /clearTimeout\(longSpeechTimer\)/);
});

test('terminal AI errors stay out of the transcript result area', () => {
  const generatorPath = path.join(__dirname, '..', 'js', 'generator.js');
  const source = fs.readFileSync(generatorPath, 'utf8');
  const catchBlock = source.slice(
    source.indexOf('.catch(function (error)', source.indexOf('AIService.generatePassage')),
    source.indexOf('/* ========================================', source.indexOf('AIService.generatePassage'))
  );

  assert.match(catchBlock, /本次暂未生成成功/);
  assert.doesNotMatch(catchBlock, /renderGenerationError/);
});

test('word parser splits common list delimiters and preserves phrases', () => {
  const result = wordParser.parse(
    'Environment, sustainable development；climate change\nrenewable energy\tbiodiversity',
    []
  );

  assert.deepEqual(result.added, [
    'environment',
    'sustainable development',
    'climate change',
    'renewable energy',
    'biodiversity',
  ]);
  assert.deepEqual(result.invalid, []);
  assert.deepEqual(result.overflow, []);
});

test('word parser normalizes whitespace and removes duplicates', () => {
  const result = wordParser.parse(
    '  Sustainable   Development  , ecosystem, ECOSYSTEM, long-term, learner\'s ',
    ['sustainable development']
  );

  assert.deepEqual(result.added, ['ecosystem', 'long-term', "learner's"]);
  assert.deepEqual(result.duplicates, ['sustainable development', 'ecosystem']);
});

test('word parser rejects invalid entries and enforces the 20-word limit', () => {
  const existing = Array.from({ length: 19 }, function (_, index) {
    return 'word ' + String.fromCharCode(97 + index);
  });
  const result = wordParser.parse('valid word, another word, <script>', existing);

  assert.deepEqual(result.added, ['valid word']);
  assert.deepEqual(result.overflow, ['another word']);
  assert.deepEqual(result.invalid, ['<script>']);
});

test('word parser does not split ordinary spaces inside an entry', () => {
  const result = wordParser.parse('renewable energy transition', []);
  assert.deepEqual(result.added, ['renewable energy transition']);
});
