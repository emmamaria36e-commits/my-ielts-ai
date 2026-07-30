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
  escapeXml,
  inspectPassage,
  parseModelContent,
  requestPassage,
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

test('generate button is disabled while an AI request is in progress', () => {
  const generatorPath = path.join(__dirname, '..', 'js', 'generator.js');
  const source = fs.readFileSync(generatorPath, 'utf8');
  assert.match(source, /setGeneratingState\(true\)/);
  assert.match(source, /正在生成学习材料…/);
  assert.match(source, /aria-busy/);
  assert.match(source, /classList\.contains\('loading'\)/);
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
