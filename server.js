'use strict';

const http = require('http');
const fs = require('fs');
const net = require('net');
const path = require('path');
const { createHash, randomUUID, timingSafeEqual } = require('crypto');
const { buildPrompt, buildRepairPrompt } = require('./server/promptBuilder');
const { createCostProtection, readCostProtectionConfig } = require('./server/costProtection');
const { parseTrustProxyHops } = require('./server/runtimeConfig');

const ROOT = __dirname;
const ENV_FILE = path.join(ROOT, '.env');
const GENERATION_LOG_FILE = path.join(ROOT, 'logs', 'generation.jsonl');
const SPEECH_LOG_FILE = path.join(ROOT, 'logs', 'speech.jsonl');
if (fs.existsSync(ENV_FILE)) {
  process.loadEnvFile(ENV_FILE);
}

const PORT = parsePort(process.env.PORT || '3000');
const MAX_BODY_BYTES = 16 * 1024;
const REQUEST_TIMEOUT_MS = 30 * 1000;
const SPEECH_REQUEST_TIMEOUT_MS = 90 * 1000;
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_MAX = 20;
const MAX_TITLE_CHARS = 160;
const MIN_PASSAGE_CHARS = 50;
const MAX_PASSAGE_CHARS = 8000;
const HTML_PATTERN = /[<>]/;
const SPEECH_REGION_PATTERN = /^[a-z0-9-]+$/;
const SPEECH_OUTPUT_FORMAT = 'audio-24khz-48kbitrate-mono-mp3';
const AI_MAX_ATTEMPTS = 2;
const MAX_REPAIR_MISSING_WORDS = 3;
const MAX_REPAIR_MISSING_RATIO = 0.25;
const SPEECH_MAX_ATTEMPTS = 2;

const ALLOWED_SECTIONS = new Set([
  'section-1',
  'section-2',
  'section-3',
  'section-4',
]);

const ALLOWED_VOICES = new Set([
  'british-female',
  'british-male',
  'australian-female',
  'american-female',
]);

const ALLOWED_DIFFICULTIES = new Set(['easy', 'medium', 'hard']);
const SPEECH_VOICES = {
  'british-female': {
    locale: 'en-GB',
    name: 'en-GB-SoniaNeural',
  },
  'british-male': {
    locale: 'en-GB',
    name: 'en-GB-RyanNeural',
  },
  'australian-female': {
    locale: 'en-AU',
    name: 'en-AU-NatashaNeural',
  },
  'american-female': {
    locale: 'en-US',
    name: 'en-US-JennyNeural',
  },
};
const WORD_PATTERN = /^[A-Za-z][A-Za-z' -]*$/;
const aiRateLimitEntries = new Map();
const speechRateLimitEntries = new Map();
const BETA_INVITE_HEADER = 'x-beta-invite';
const BETA_INVITE_MAX_LENGTH = 256;

const STATIC_DIRECTORIES = {
  '/css/': path.join(ROOT, 'css'),
  '/js/': path.join(ROOT, 'js'),
  '/assets/': path.join(ROOT, 'assets'),
};

const MIME_TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.mp3': 'audio/mpeg',
  '.svg': 'image/svg+xml',
  '.wav': 'audio/wav',
  '.webp': 'image/webp',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
};

function parsePort(raw) {
  const port = Number.parseInt(raw, 10);
  return Number.isInteger(port) && port > 0 && port <= 65535 ? port : 3000;
}

function setSecurityHeaders(response) {
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('X-Frame-Options', 'DENY');
  response.setHeader('Referrer-Policy', 'no-referrer');
  response.setHeader('Cache-Control', 'no-store');
}

function sendJson(response, status, payload) {
  const body = JSON.stringify(payload);
  setSecurityHeaders(response);
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
  });
  response.end(body);
}

function sendAudio(response, audio) {
  setSecurityHeaders(response);
  response.writeHead(200, {
    'Content-Type': 'audio/mpeg',
    'Content-Length': audio.length,
  });
  response.end(audio);
}

function createHttpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function hashBetaInvite(value) {
  return createHash('sha256').update(value, 'utf8').digest();
}

function createBetaInviteRegistry(rawValue) {
  const hashes = new Map();
  String(rawValue || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
    .forEach((value) => {
      const digest = hashBetaInvite(value);
      const digestHex = digest.toString('hex');
      hashes.set(digestHex, {
        digest,
        id: digestHex.slice(0, 16),
      });
    });
  return hashes;
}

function identifyBetaInvite(request, registry) {
  const supplied = request.headers[BETA_INVITE_HEADER];
  if (typeof supplied !== 'string') return null;

  const invite = supplied.trim();
  if (!invite || invite.length > BETA_INVITE_MAX_LENGTH) return null;

  const candidate = hashBetaInvite(invite);
  for (const entry of registry.values()) {
    if (timingSafeEqual(candidate, entry.digest)) {
      return { id: entry.id };
    }
  }
  return null;
}

function sendBetaInviteDenied(response) {
  sendJson(response, 403, {
    error: {
      code: 'BETA_ACCESS_DENIED',
      message: '测试邀请码无效或已失效，请重新输入。',
    },
  });
}

function sendCostProtectionDenied(response, decision) {
  const isDisabled = decision.status === 503;
  sendJson(response, decision.status, {
    error: {
      code: isDisabled ? 'FEATURE_TEMPORARILY_DISABLED' : 'COST_LIMIT_REACHED',
      message: isDisabled
        ? '该功能暂时不可用，请稍后再试。'
        : '请求过于频繁或今日测试额度已用完，请稍后再试。',
    },
  });
}

function readJsonBody(request) {
  return new Promise((resolve, reject) => {
    let size = 0;
    let body = '';
    let settled = false;

    request.setEncoding('utf8');
    request.on('data', (chunk) => {
      if (settled) return;
      size += Buffer.byteLength(chunk);
      if (size > MAX_BODY_BYTES) {
        settled = true;
        request.resume();
        reject(createHttpError(413, 'Request body is too large.'));
        return;
      }
      body += chunk;
    });

    request.on('end', () => {
      if (settled) return;
      settled = true;
      if (!body) {
        reject(createHttpError(400, 'A JSON request body is required.'));
        return;
      }
      try {
        resolve(JSON.parse(body));
      } catch (error) {
        reject(createHttpError(400, 'Request body must be valid JSON.'));
      }
    });

    request.on('error', (error) => {
      if (!settled) {
        settled = true;
        reject(error);
      }
    });
  });
}

function validateGenerateRequest(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw createHttpError(400, 'Request body must be a JSON object.');
  }

  if (!Array.isArray(input.words) || input.words.length < 1 || input.words.length > 20) {
    throw createHttpError(400, 'Provide between 1 and 20 target words.');
  }

  const words = [];
  for (const rawWord of input.words) {
    if (typeof rawWord !== 'string') {
      throw createHttpError(400, 'Every target word must be text.');
    }
    const word = rawWord.trim().toLowerCase().replace(/\s+/g, ' ');
    if (!word || word.length > 40 || !WORD_PATTERN.test(word)) {
      throw createHttpError(400, `Invalid target word: ${rawWord}`);
    }
    if (!words.includes(word)) words.push(word);
  }

  const section = input.section || 'section-1';
  if (!ALLOWED_SECTIONS.has(section)) {
    throw createHttpError(400, 'Unsupported IELTS Listening section.');
  }

  const voices = Array.isArray(input.voices) && input.voices.length
    ? input.voices.slice()
    : ['british-female'];
  if (voices.length > 4 || voices.some((voice) => !ALLOWED_VOICES.has(voice))) {
    throw createHttpError(400, 'Unsupported voice selection.');
  }

  const difficulty = input.difficulty || 'medium';
  if (!ALLOWED_DIFFICULTIES.has(difficulty)) {
    throw createHttpError(400, 'Unsupported difficulty.');
  }

  return { words, section, voices, difficulty };
}

function validateSpeechRequest(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw createHttpError(400, 'Request body must be a JSON object.');
  }

  if (typeof input.text !== 'string') {
    throw createHttpError(400, 'Speech text must be provided.');
  }

  const text = input.text.trim();
  if (text.length < MIN_PASSAGE_CHARS || text.length > MAX_PASSAGE_CHARS) {
    throw createHttpError(400, 'Speech text has an invalid length.');
  }

  if (HTML_PATTERN.test(text)) {
    throw createHttpError(400, 'Speech text must not contain HTML.');
  }

  if (typeof input.voice !== 'string' || !SPEECH_VOICES[input.voice]) {
    throw createHttpError(400, 'Unsupported speech voice.');
  }

  return {
    text,
    voice: input.voice,
  };
}

function isRateLimited(entries, address) {
  const now = Date.now();
  const current = entries.get(address);

  if (!current || now - current.startedAt >= RATE_LIMIT_WINDOW_MS) {
    entries.set(address, { startedAt: now, count: 1 });
    return false;
  }

  current.count += 1;
  return current.count > RATE_LIMIT_MAX;
}

function getClientAddress(request, trustProxyHops = 0) {
  const remoteAddress = request.socket.remoteAddress || 'unknown';
  if (trustProxyHops === 0) return remoteAddress;

  const forwardedHeader = request.headers['x-forwarded-for'];
  if (typeof forwardedHeader !== 'string') return remoteAddress;

  const forwardedAddresses = forwardedHeader
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  const addressIndex = forwardedAddresses.length - trustProxyHops;
  if (addressIndex < 0) return remoteAddress;

  const candidate = forwardedAddresses[addressIndex];
  return net.isIP(candidate) ? candidate : remoteAddress;
}

function removeExpiredRateLimits(entries) {
  const now = Date.now();
  for (const [address, entry] of entries.entries()) {
    if (now - entry.startedAt >= RATE_LIMIT_WINDOW_MS) {
      entries.delete(address);
    }
  }
}

const rateLimitCleanup = setInterval(() => {
  removeExpiredRateLimits(aiRateLimitEntries);
  removeExpiredRateLimits(speechRateLimitEntries);
}, RATE_LIMIT_WINDOW_MS);
rateLimitCleanup.unref();

function getAiConfig() {
  return {
    apiKey: process.env.AI_API_KEY || '',
    endpoint: process.env.AI_API_ENDPOINT || 'https://api.deepseek.com/v1/chat/completions',
    model: process.env.AI_MODEL || 'deepseek-chat',
    provider: process.env.AI_PROVIDER || 'deepseek',
  };
}

function getSpeechConfig() {
  return {
    key: process.env.SPEECH_KEY || '',
    region: (process.env.SPEECH_REGION || '').trim().toLowerCase(),
  };
}

function escapeXml(value) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function stripSpeakerLabels(value) {
  return value.replace(/(^|\n)\s*Speaker\s+[A-C]\s*:\s*/gi, '$1');
}

function buildSpeechSsml(params) {
  const voice = SPEECH_VOICES[params.voice];
  const text = escapeXml(stripSpeakerLabels(params.text));
  return [
    `<speak version="1.0" xml:lang="${voice.locale}">`,
    `<voice xml:lang="${voice.locale}" name="${voice.name}">`,
    text,
    '</voice>',
    '</speak>',
  ].join('');
}

function parseModelContent(content) {
  try {
    return JSON.parse(content);
  } catch (error) {
    const httpError = createHttpError(502, 'AI provider returned invalid JSON.');
    httpError.failureType = 'invalid-json';
    throw httpError;
  }
}

function tokenizeForTargetMatch(value) {
  const normalized = String(value || '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u2010-\u2015-]/g, ' ');
  return normalized.match(/[a-z]+(?:'[a-z]+)*/g) || [];
}

function containsTargetWord(passage, targetWord) {
  const passageTokens = tokenizeForTargetMatch(passage);
  const targetTokens = tokenizeForTargetMatch(targetWord);
  if (!targetTokens.length || targetTokens.length > passageTokens.length) return false;

  for (let start = 0; start <= passageTokens.length - targetTokens.length; start += 1) {
    const matches = targetTokens.every((token, offset) => passageTokens[start + offset] === token);
    if (matches) return true;
  }
  return false;
}

function inspectPassage(parsed, params) {
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { valid: false, failureType: 'invalid-structure' };
  }

  if (typeof parsed.title !== 'string' || typeof parsed.passage !== 'string') {
    return { valid: false, failureType: 'invalid-fields' };
  }

  const title = parsed.title.trim();
  const passage = parsed.passage.trim();
  const candidate = { title, passage };

  if (!title || title.length > MAX_TITLE_CHARS) {
    return { valid: false, failureType: 'invalid-title', candidate };
  }

  if (passage.length < MIN_PASSAGE_CHARS || passage.length > MAX_PASSAGE_CHARS) {
    return { valid: false, failureType: 'invalid-passage-length', candidate };
  }

  if (HTML_PATTERN.test(title) || HTML_PATTERN.test(passage)) {
    return { valid: false, failureType: 'html-content', candidate };
  }

  const missingWords = params.words.filter((word) => !containsTargetWord(passage, word));
  if (missingWords.length) {
    return {
      valid: false,
      failureType: 'missing-target-words',
      missingWords,
      candidate,
    };
  }

  return { valid: true, candidate, missingWords: [] };
}

function inspectionToError(inspection) {
  const messages = {
    'invalid-structure': 'AI provider returned an invalid result structure.',
    'invalid-fields': 'AI result must contain a text title and passage.',
    'invalid-title': 'AI result title has an invalid length.',
    'invalid-passage-length': 'AI result passage has an invalid length.',
    'html-content': 'AI result must not contain HTML.',
    'missing-target-words': 'AI result did not include every target word.',
  };
  const error = createHttpError(502, messages[inspection.failureType] || 'AI result failed validation.');
  error.failureType = inspection.failureType;
  if (inspection.missingWords) error.missingWords = inspection.missingWords.slice();
  return error;
}

function validateModelResult(parsed, params) {
  const inspection = inspectPassage(parsed, params);
  if (!inspection.valid) throw inspectionToError(inspection);
  return inspection.candidate;
}

function chooseRecoveryAction(inspection, attemptsUsed, targetWordCount) {
  if (inspection.valid) return 'accept';
  if (attemptsUsed >= AI_MAX_ATTEMPTS) return 'fail';

  if (inspection.failureType === 'missing-target-words') {
    const missingCount = inspection.missingWords.length;
    const missingRatio = missingCount / Math.max(1, targetWordCount);
    return missingCount <= MAX_REPAIR_MISSING_WORDS && missingRatio <= MAX_REPAIR_MISSING_RATIO
      ? 'repair'
      : 'regenerate';
  }

  return 'regenerate';
}

function emitGenerationLog(logger, event) {
  const entry = {
    scope: 'generation',
    timestamp: new Date().toISOString(),
    ...event,
  };
  if (logger) logger(entry);
  else console.info(JSON.stringify(entry));
}

async function appendGenerationStats(stats) {
  await fs.promises.mkdir(path.dirname(GENERATION_LOG_FILE), { recursive: true });
  await fs.promises.appendFile(GENERATION_LOG_FILE, `${JSON.stringify(stats)}\n`, 'utf8');
}

async function saveGenerationStats(writer, stats) {
  if (!writer) return;
  try {
    await writer(stats);
  } catch (error) {
    console.error('[Generation Stats] Could not append anonymous statistics.');
  }
}

async function appendSpeechStats(stats) {
  await fs.promises.mkdir(path.dirname(SPEECH_LOG_FILE), { recursive: true });
  await fs.promises.appendFile(SPEECH_LOG_FILE, `${JSON.stringify(stats)}\n`, 'utf8');
}

async function saveSpeechStats(writer, stats) {
  if (!writer) return;
  try {
    await writer(stats);
  } catch (error) {
    console.error('[Speech Stats] Could not append anonymous statistics.');
  }
}

async function requestPassageAttempt(params, config, endpoint, mode, repairContext) {
  const prompt = mode === 'repair'
    ? buildRepairPrompt(params, repairContext.draft, repairContext.missingWords)
    : buildPrompt(params);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const startedAt = Date.now();

  try {
    const upstream = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.model,
        messages: [
          { role: 'system', content: prompt.system },
          { role: 'user', content: prompt.user },
        ],
        temperature: 0.3,
        max_tokens: 2048,
        response_format: { type: 'json_object' },
      }),
      signal: controller.signal,
    });

    if (!upstream.ok) {
      console.error(`[AI API] Upstream request failed with status ${upstream.status}.`);
      const status = upstream.status === 429 ? 429 : 502;
      const error = createHttpError(status, 'AI provider request failed.');
      error.failureType = upstream.status === 429 ? 'provider-rate-limit' : 'provider-error';
      throw error;
    }

    const data = await upstream.json();
    const content = data && data.choices && data.choices[0]
      && data.choices[0].message && data.choices[0].message.content;
    if (typeof content !== 'string' || !content.trim()) {
      const emptyError = createHttpError(502, 'AI provider returned an empty response.');
      emptyError.failureType = 'empty-response';
      throw emptyError;
    }

    return {
      candidate: parseModelContent(content),
      usage: data.usage || null,
      durationMs: Date.now() - startedAt,
    };
  } catch (error) {
    if (error.name === 'AbortError') {
      const timeoutError = createHttpError(504, 'AI provider request timed out.');
      timeoutError.failureType = 'provider-timeout';
      throw timeoutError;
    }
    if (error.status) throw error;
    console.error('[AI API] Upstream response could not be processed.');
    const responseError = createHttpError(502, 'AI provider could not be reached or returned an unreadable response.');
    responseError.failureType = 'provider-unreadable';
    throw responseError;
  } finally {
    clearTimeout(timeout);
  }
}

async function requestPassage(params, options = {}) {
  const config = getAiConfig();
  if (!config.apiKey) {
    throw createHttpError(503, 'AI service is not configured on the server.');
  }

  let endpoint;
  try {
    endpoint = new URL(config.endpoint);
  } catch (error) {
    throw createHttpError(500, 'AI service endpoint is invalid.');
  }

  const localEndpoint = ['localhost', '127.0.0.1', '::1'].includes(endpoint.hostname);
  if (endpoint.protocol !== 'https:' && !(endpoint.protocol === 'http:' && localEndpoint)) {
    throw createHttpError(500, 'AI service endpoint must use HTTPS.');
  }

  const requestId = randomUUID();
  const pipelineStartedAt = Date.now();
  const statsWriter = options.statsWriter !== undefined
    ? options.statsWriter
    : options.logger
      ? null
      : appendGenerationStats;
  let mode = 'initial';
  let repairContext = null;
  let recoveryAction = 'none';
  let initialMissingCount = 0;

  emitGenerationLog(options.logger, {
    event: 'generation_started',
    requestId,
    section: params.section,
    difficulty: params.difficulty,
    targetWordCount: params.words.length,
  });

  for (let attempt = 1; attempt <= AI_MAX_ATTEMPTS; attempt += 1) {
    const attemptStartedAt = Date.now();
    try {
      const upstreamResult = await requestPassageAttempt(
        params,
        config,
        endpoint,
        mode,
        repairContext
      );
      const inspection = inspectPassage(upstreamResult.candidate, params);
      const action = chooseRecoveryAction(inspection, attempt, params.words.length);

      emitGenerationLog(options.logger, {
        event: 'generation_attempt_finished',
        requestId,
        attempt,
        mode,
        result: inspection.valid ? 'valid' : inspection.failureType,
        missingWordCount: inspection.missingWords ? inspection.missingWords.length : 0,
        durationMs: upstreamResult.durationMs,
      });

      if (action === 'accept') {
        const { title, passage } = inspection.candidate;
        emitGenerationLog(options.logger, {
          event: 'generation_finished',
          requestId,
          success: true,
          totalAttempts: attempt,
          recoveryAction,
          totalDurationMs: Date.now() - pipelineStartedAt,
        });
        await saveGenerationStats(statsWriter, {
          section: params.section,
          targetWordCount: params.words.length,
          firstAttemptMissingCount: initialMissingCount,
          recoveryAction,
          success: true,
          totalAttempts: attempt,
          durationMs: Date.now() - pipelineStartedAt,
        });
        return {
          passage,
          title,
          targetWords: params.words.slice(),
          metadata: {
            section: params.section,
            difficulty: params.difficulty,
            voices: params.voices.slice(),
            wordCount: passage.split(/\s+/).filter(Boolean).length,
            generatedBy: config.provider,
            model: config.model,
            generatedAt: new Date().toISOString(),
            usage: upstreamResult.usage,
            attempts: attempt,
            repaired: recoveryAction === 'repair',
            recoveryAction,
            initialMissingCount,
            requestId,
          },
        };
      }

      if (action === 'fail') {
        const error = inspectionToError(inspection);
        error.attemptAlreadyLogged = true;
        throw error;
      }

      recoveryAction = action;
      if (attempt === 1 && inspection.missingWords) {
        initialMissingCount = inspection.missingWords.length;
      }
      mode = action;
      repairContext = action === 'repair'
        ? {
            draft: inspection.candidate,
            missingWords: inspection.missingWords.slice(),
          }
        : null;
    } catch (error) {
      const canRetry = attempt < AI_MAX_ATTEMPTS
        && error.status !== 429
        && error.status !== 400
        && error.status !== 500
        && error.status !== 503;

      if (!error.attemptAlreadyLogged) {
        emitGenerationLog(options.logger, {
          event: 'generation_attempt_finished',
          requestId,
          attempt,
          mode,
          result: error.failureType || 'provider-failure',
          missingWordCount: Array.isArray(error.missingWords) ? error.missingWords.length : 0,
          durationMs: Date.now() - attemptStartedAt,
        });
      }

      if (canRetry) {
        recoveryAction = 'regenerate';
        mode = 'regenerate';
        repairContext = null;
        continue;
      }

      emitGenerationLog(options.logger, {
        event: 'generation_finished',
        requestId,
        success: false,
        totalAttempts: attempt,
        recoveryAction,
        failureType: error.failureType || 'provider-failure',
        totalDurationMs: Date.now() - pipelineStartedAt,
      });
      await saveGenerationStats(statsWriter, {
        section: params.section,
        targetWordCount: params.words.length,
        firstAttemptMissingCount: initialMissingCount,
        recoveryAction,
        success: false,
        totalAttempts: attempt,
        durationMs: Date.now() - pipelineStartedAt,
      });
      error.requestId = requestId;
      throw error;
    }
  }

  throw createHttpError(502, 'AI generation pipeline exhausted its request budget.');
}

async function requestSpeechAttempt(params, config, endpoint, timeoutMs = SPEECH_REQUEST_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const upstream = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/ssml+xml',
        'Ocp-Apim-Subscription-Key': config.key,
        'X-Microsoft-OutputFormat': SPEECH_OUTPUT_FORMAT,
        'User-Agent': 'My-IELTS-AI',
      },
      body: buildSpeechSsml(params),
      signal: controller.signal,
    });

    if (!upstream.ok) {
      console.error(`[Speech API] Upstream request failed with status ${upstream.status}.`);
      const upstreamError = createHttpError(502, 'Speech provider request failed.');
      upstreamError.failureType = 'provider-http-error';
      upstreamError.upstreamStatus = upstream.status;
      throw upstreamError;
    }

    const audio = Buffer.from(await upstream.arrayBuffer());
    if (!audio.length) {
      throw createHttpError(502, 'Speech provider returned empty audio.');
    }

    return audio;
  } catch (error) {
    if (error.name === 'AbortError') {
      const timeoutError = createHttpError(504, 'Speech provider request timed out.');
      timeoutError.failureType = 'provider-timeout';
      throw timeoutError;
    }
    if (error.status) throw error;
    console.error('[Speech API] Upstream response could not be processed.');
    const networkError = createHttpError(502, 'Speech provider could not be reached.');
    networkError.failureType = 'provider-network-error';
    throw networkError;
  } finally {
    clearTimeout(timeout);
  }
}

async function requestSpeech(params, options = {}) {
  const config = options.config || getSpeechConfig();
  if (!config.key || !config.region) {
    throw createHttpError(503, 'Speech service is not configured on the server.');
  }

  if (!SPEECH_REGION_PATTERN.test(config.region)) {
    throw createHttpError(500, 'Speech service region is invalid.');
  }

  const endpoint = options.endpoint
    || `https://${config.region}.tts.speech.microsoft.com/cognitiveservices/v1`;
  const timeoutMs = options.timeoutMs || SPEECH_REQUEST_TIMEOUT_MS;
  const statsWriter = options.statsWriter === undefined
    ? appendSpeechStats
    : options.statsWriter;
  const startedAt = Date.now();
  let lastError;

  for (let attempt = 1; attempt <= SPEECH_MAX_ATTEMPTS; attempt += 1) {
    try {
      const audio = await requestSpeechAttempt(params, config, endpoint, timeoutMs);
      await saveSpeechStats(statsWriter, {
        textLength: params.text.length,
        success: true,
        status: 'success',
        totalAttempts: attempt,
        durationMs: Date.now() - startedAt,
      });
      return audio;
    } catch (error) {
      lastError = error;
      const recoverable = error.upstreamStatus === 502;
      if (!recoverable || attempt === SPEECH_MAX_ATTEMPTS) {
        await saveSpeechStats(statsWriter, {
          textLength: params.text.length,
          success: false,
          status: error.failureType || 'speech-failure',
          totalAttempts: attempt,
          durationMs: Date.now() - startedAt,
        });
        throw error;
      }
      console.warn(`[Speech API] Azure returned 502; retrying once (attempt ${attempt + 1}).`);
    }
  }

  throw lastError;
}

async function serveFile(request, response, filePath) {
  try {
    const stat = await fs.promises.stat(filePath);
    if (!stat.isFile()) throw createHttpError(404, 'Not found.');
    const body = await fs.promises.readFile(filePath);
    const contentType = MIME_TYPES[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
    setSecurityHeaders(response);
    response.writeHead(200, {
      'Content-Type': contentType,
      'Content-Length': body.length,
    });
    response.end(request.method === 'HEAD' ? undefined : body);
  } catch (error) {
    sendJson(response, error.status || 404, { error: { message: 'Not found.' } });
  }
}

function resolveStaticFile(pathname) {
  for (const [prefix, directory] of Object.entries(STATIC_DIRECTORIES)) {
    if (!pathname.startsWith(prefix)) continue;
    const relativePath = pathname.slice(prefix.length);
    const resolved = path.resolve(directory, relativePath);
    const directoryPrefix = `${path.resolve(directory)}${path.sep}`;
    return resolved.startsWith(directoryPrefix) ? resolved : null;
  }
  return null;
}

async function handleRequest(request, response, context) {
  const baseUrl = `http://${request.headers.host || 'localhost'}`;
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(request.url, baseUrl).pathname);
  } catch (error) {
    sendJson(response, 400, { error: { message: 'Invalid request URL.' } });
    return;
  }

  if (request.method === 'GET' && (pathname === '/health' || pathname === '/api/health')) {
    sendJson(response, 200, { ok: true });
    return;
  }

  if (request.method === 'POST' && pathname === '/api/generate') {
    const inviteIdentity = identifyBetaInvite(request, context.betaInviteRegistry);
    if (!inviteIdentity) {
      sendBetaInviteDenied(response);
      return;
    }

    if (!context.costConfig.ai.enabled) {
      sendCostProtectionDenied(response, { status: 503 });
      return;
    }

    const address = getClientAddress(request, context.trustProxyHops);
    if (isRateLimited(aiRateLimitEntries, address)) {
      sendJson(response, 429, { error: { message: 'Too many requests. Please try again shortly.' } });
      return;
    }

    try {
      const input = await readJsonBody(request);
      const params = validateGenerateRequest(input);
      const lease = context.costProtection.acquire('ai', inviteIdentity.id);
      if (!lease.ok) {
        sendCostProtectionDenied(response, lease);
        return;
      }
      try {
        const result = await context.requestPassage(params);
        sendJson(response, 200, result);
      } finally {
        lease.release();
      }
    } catch (error) {
      const status = Number.isInteger(error.status) ? error.status : 500;
      if (status >= 500 && status !== 503 && status !== 504) {
        console.error('[Server] Passage generation failed:', error.message);
      }
      sendJson(response, status, {
        error: {
          code: error.failureType === 'provider-rate-limit'
            ? 'AI_PROVIDER_RATE_LIMITED'
            : status === 400
              ? 'INVALID_GENERATION_REQUEST'
              : status === 503
                ? 'AI_SERVICE_NOT_CONFIGURED'
                : status === 504
                  ? 'AI_PROVIDER_TIMEOUT'
                  : 'GENERATION_VALIDATION_FAILED',
          message: status >= 500 && !error.status ? 'Unexpected server error.' : error.message,
          requestId: error.requestId,
        },
      });
    }
    return;
  }

  if (request.method === 'POST' && pathname === '/api/speech') {
    const inviteIdentity = identifyBetaInvite(request, context.betaInviteRegistry);
    if (!inviteIdentity) {
      sendBetaInviteDenied(response);
      return;
    }

    if (!context.costConfig.speech.enabled) {
      sendCostProtectionDenied(response, { status: 503 });
      return;
    }

    const address = getClientAddress(request, context.trustProxyHops);
    if (isRateLimited(speechRateLimitEntries, address)) {
      sendJson(response, 429, { error: { message: 'Too many requests. Please try again shortly.' } });
      return;
    }

    try {
      const input = await readJsonBody(request);
      const params = validateSpeechRequest(input);
      const lease = context.costProtection.acquire('speech', inviteIdentity.id);
      if (!lease.ok) {
        sendCostProtectionDenied(response, lease);
        return;
      }
      try {
        const audio = await context.requestSpeech(params);
        sendAudio(response, audio);
      } finally {
        lease.release();
      }
    } catch (error) {
      const status = Number.isInteger(error.status) ? error.status : 500;
      if (status >= 500 && status !== 503 && status !== 504) {
        console.error('[Server] Speech generation failed:', error.message);
      }
      sendJson(response, status, {
        error: {
          message: status >= 500 && !error.status ? 'Unexpected server error.' : error.message,
        },
      });
    }
    return;
  }

  if ((request.method === 'GET' || request.method === 'HEAD') && pathname === '/') {
    await serveFile(request, response, path.join(ROOT, 'index.html'));
    return;
  }

  if (request.method === 'GET' || request.method === 'HEAD') {
    const staticFile = resolveStaticFile(pathname);
    if (staticFile) {
      await serveFile(request, response, staticFile);
      return;
    }
  }

  sendJson(response, 404, { error: { message: 'Not found.' } });
}

function createServer(options = {}) {
  const betaInviteRegistry = options.betaInviteRegistry
    || createBetaInviteRegistry(process.env.BETA_INVITE_CODES || '');
  const costConfig = options.costConfig || readCostProtectionConfig(process.env);
  const costProtection = options.costProtection || createCostProtection(costConfig);
  const trustProxyHops = options.trustProxyHops === undefined
    ? parseTrustProxyHops(process.env.TRUST_PROXY_HOPS)
    : options.trustProxyHops;
  const context = {
    betaInviteRegistry,
    costConfig,
    costProtection,
    trustProxyHops,
    requestPassage: options.requestPassage || requestPassage,
    requestSpeech: options.requestSpeech || requestSpeech,
  };
  return http.createServer((request, response) => {
    handleRequest(request, response, context).catch((error) => {
      console.error('[Server] Unhandled request error:', error.message);
      if (!response.headersSent) {
        sendJson(response, 500, { error: { message: 'Unexpected server error.' } });
      } else {
        response.end();
      }
    });
  });
}

if (require.main === module) {
  const server = createServer();
  server.listen(PORT, () => {
    console.log(`My IELTS AI is running at http://localhost:${PORT}`);
  });
}

module.exports = {
  buildSpeechSsml,
  createBetaInviteRegistry,
  createCostProtection,
  createServer,
  chooseRecoveryAction,
  containsTargetWord,
  escapeXml,
  getClientAddress,
  inspectPassage,
  identifyBetaInvite,
  parseModelContent,
  parseTrustProxyHops,
  requestPassage,
  requestSpeech,
  readCostProtectionConfig,
  stripSpeakerLabels,
  validateGenerateRequest,
  validateModelResult,
  validateSpeechRequest,
};
