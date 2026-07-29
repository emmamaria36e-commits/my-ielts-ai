'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const { buildPrompt } = require('./server/promptBuilder');

const ROOT = __dirname;
const ENV_FILE = path.join(ROOT, '.env');
if (fs.existsSync(ENV_FILE)) {
  process.loadEnvFile(ENV_FILE);
}

const PORT = parsePort(process.env.PORT || '3000');
const MAX_BODY_BYTES = 16 * 1024;
const REQUEST_TIMEOUT_MS = 30 * 1000;
const SPEECH_REQUEST_TIMEOUT_MS = 45 * 1000;
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_MAX = 20;
const MAX_TITLE_CHARS = 160;
const MIN_PASSAGE_CHARS = 50;
const MAX_PASSAGE_CHARS = 8000;
const HTML_PATTERN = /[<>]/;
const SPEECH_REGION_PATTERN = /^[a-z0-9-]+$/;
const SPEECH_OUTPUT_FORMAT = 'audio-24khz-48kbitrate-mono-mp3';
const AI_MAX_ATTEMPTS = 2;
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
    throw createHttpError(502, 'AI provider returned invalid JSON.');
  }
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function containsTargetWord(passage, targetWord) {
  const escaped = escapeRegExp(targetWord.trim()).replace(/\s+/g, '\\s+');
  const pattern = new RegExp(`(^|[^A-Za-z0-9])${escaped}(?=$|[^A-Za-z0-9])`, 'i');
  return pattern.test(passage);
}

function validateModelResult(parsed, params) {
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw createHttpError(502, 'AI provider returned an invalid result structure.');
  }

  if (typeof parsed.title !== 'string' || typeof parsed.passage !== 'string') {
    throw createHttpError(502, 'AI result must contain a text title and passage.');
  }

  const title = parsed.title.trim();
  const passage = parsed.passage.trim();

  if (!title || title.length > MAX_TITLE_CHARS) {
    throw createHttpError(502, 'AI result title has an invalid length.');
  }

  if (passage.length < MIN_PASSAGE_CHARS || passage.length > MAX_PASSAGE_CHARS) {
    throw createHttpError(502, 'AI result passage has an invalid length.');
  }

  if (HTML_PATTERN.test(title) || HTML_PATTERN.test(passage)) {
    throw createHttpError(502, 'AI result must not contain HTML.');
  }

  const missingWords = params.words.filter((word) => !containsTargetWord(passage, word));
  if (missingWords.length) {
    const error = createHttpError(502, 'AI result did not include every target word.');
    error.missingWords = missingWords;
    error.repairDraft = { title, passage };
    throw error;
  }

  return { title, passage };
}

async function requestPassageAttempt(params, config, endpoint, attempt, repairContext) {
  const prompt = buildPrompt(params);
  const userMessage = repairContext
    ? [
        'Revise the previous draft instead of writing a new script.',
        `Missing target words: ${JSON.stringify(repairContext.missingWords)}.`,
        'Naturally add every missing target word exactly as supplied while preserving the Section format, coherence, and required length.',
        'Return the complete revised title and passage as ONLY valid JSON.',
        `Previous draft: ${JSON.stringify(repairContext.draft)}`,
      ].join('\n')
    : attempt === 1
      ? prompt.user
      : `${prompt.user}\nA previous response failed validation. Check the JSON format and include every target word before responding.`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

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
          { role: 'user', content: userMessage },
        ],
        temperature: attempt === 1 ? 0.6 : 0.3,
        max_tokens: 2048,
        response_format: { type: 'json_object' },
      }),
      signal: controller.signal,
    });

    if (!upstream.ok) {
      console.error(`[AI API] Upstream request failed with status ${upstream.status}.`);
      throw createHttpError(502, 'AI provider request failed.');
    }

    const data = await upstream.json();
    const content = data && data.choices && data.choices[0]
      && data.choices[0].message && data.choices[0].message.content;
    if (typeof content !== 'string' || !content.trim()) {
      throw createHttpError(502, 'AI provider returned an empty response.');
    }

    const parsed = parseModelContent(content);
    const validated = validateModelResult(parsed, params);
    const passage = validated.passage;
    const title = validated.title;

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
        usage: data.usage || null,
      },
    };
  } catch (error) {
    if (error.name === 'AbortError') {
      throw createHttpError(504, 'AI provider request timed out.');
    }
    if (error.status) throw error;
    console.error('[AI API] Upstream response could not be processed.');
    throw createHttpError(502, 'AI provider could not be reached or returned an unreadable response.');
  } finally {
    clearTimeout(timeout);
  }
}

async function requestPassage(params) {
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

  let lastError;
  let repairContext = null;
  for (let attempt = 1; attempt <= AI_MAX_ATTEMPTS; attempt += 1) {
    try {
      const result = await requestPassageAttempt(params, config, endpoint, attempt, repairContext);
      result.metadata.attempts = attempt;
      result.metadata.repaired = Boolean(repairContext);
      return result;
    } catch (error) {
      lastError = error;
      if (error.status !== 502 || attempt === AI_MAX_ATTEMPTS) {
        throw error;
      }
      repairContext = error.repairDraft && Array.isArray(error.missingWords)
        ? { draft: error.repairDraft, missingWords: error.missingWords.slice() }
        : null;
      console.warn(
        repairContext
          ? `[AI API] Target words missing; repairing draft once (attempt ${attempt + 1}).`
          : `[AI API] Validation or provider failure; retrying once (attempt ${attempt + 1}).`
      );
    }
  }

  throw lastError;
}

async function requestSpeechAttempt(params, config, endpoint) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SPEECH_REQUEST_TIMEOUT_MS);

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
      throw createHttpError(502, 'Speech provider request failed.');
    }

    const audio = Buffer.from(await upstream.arrayBuffer());
    if (!audio.length) {
      throw createHttpError(502, 'Speech provider returned empty audio.');
    }

    return audio;
  } catch (error) {
    if (error.name === 'AbortError') {
      throw createHttpError(504, 'Speech provider request timed out.');
    }
    if (error.status) throw error;
    console.error('[Speech API] Upstream response could not be processed.');
    throw createHttpError(502, 'Speech provider could not be reached.');
  } finally {
    clearTimeout(timeout);
  }
}

async function requestSpeech(params) {
  const config = getSpeechConfig();
  if (!config.key || !config.region) {
    throw createHttpError(503, 'Speech service is not configured on the server.');
  }

  if (!SPEECH_REGION_PATTERN.test(config.region)) {
    throw createHttpError(500, 'Speech service region is invalid.');
  }

  const endpoint = `https://${config.region}.tts.speech.microsoft.com/cognitiveservices/v1`;
  let lastError;

  for (let attempt = 1; attempt <= SPEECH_MAX_ATTEMPTS; attempt += 1) {
    try {
      return await requestSpeechAttempt(params, config, endpoint);
    } catch (error) {
      lastError = error;
      const recoverable = error.status === 502 || error.status === 504;
      if (!recoverable || attempt === SPEECH_MAX_ATTEMPTS) {
        throw error;
      }
      console.warn(`[Speech API] Temporary failure; retrying once (attempt ${attempt + 1}).`);
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

async function handleRequest(request, response) {
  const baseUrl = `http://${request.headers.host || 'localhost'}`;
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(request.url, baseUrl).pathname);
  } catch (error) {
    sendJson(response, 400, { error: { message: 'Invalid request URL.' } });
    return;
  }

  if (request.method === 'GET' && pathname === '/api/health') {
    const speechConfig = getSpeechConfig();
    sendJson(response, 200, {
      status: 'ok',
      aiConfigured: Boolean(getAiConfig().apiKey),
      speechConfigured: Boolean(speechConfig.key && speechConfig.region),
    });
    return;
  }

  if (request.method === 'POST' && pathname === '/api/generate') {
    const address = request.socket.remoteAddress || 'unknown';
    if (isRateLimited(aiRateLimitEntries, address)) {
      sendJson(response, 429, { error: { message: 'Too many requests. Please try again shortly.' } });
      return;
    }

    try {
      const input = await readJsonBody(request);
      const params = validateGenerateRequest(input);
      const result = await requestPassage(params);
      sendJson(response, 200, result);
    } catch (error) {
      const status = Number.isInteger(error.status) ? error.status : 500;
      if (status >= 500 && status !== 503 && status !== 504) {
        console.error('[Server] Passage generation failed:', error.message);
      }
      sendJson(response, status, {
        error: {
          message: status >= 500 && !error.status ? 'Unexpected server error.' : error.message,
        },
      });
    }
    return;
  }

  if (request.method === 'POST' && pathname === '/api/speech') {
    const address = request.socket.remoteAddress || 'unknown';
    if (isRateLimited(speechRateLimitEntries, address)) {
      sendJson(response, 429, { error: { message: 'Too many requests. Please try again shortly.' } });
      return;
    }

    try {
      const input = await readJsonBody(request);
      const params = validateSpeechRequest(input);
      const audio = await requestSpeech(params);
      sendAudio(response, audio);
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

function createServer() {
  return http.createServer((request, response) => {
    handleRequest(request, response).catch((error) => {
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
  createServer,
  containsTargetWord,
  escapeXml,
  parseModelContent,
  requestPassage,
  stripSpeakerLabels,
  validateGenerateRequest,
  validateModelResult,
  validateSpeechRequest,
};
