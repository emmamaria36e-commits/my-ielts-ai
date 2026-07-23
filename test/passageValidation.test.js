'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const {
  containsTargetWord,
  parseModelContent,
  validateGenerateRequest,
  validateModelResult,
} = require('../server');

const params = {
  words: ['environment', 'sustainable development'],
  scene: 'academic-lecture',
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
    scene: 'academic-lecture',
    voices: ['british-female'],
    difficulty: 'medium',
  });
  assert.deepEqual(result.words, ['sustainable development']);
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
    /every target word/
  );
});

test('target matching is case-insensitive and respects word boundaries', () => {
  assert.equal(containsTargetWord('The ENVIRONMENT matters.', 'environment'), true);
  assert.equal(containsTargetWord('Sustainable development matters.', 'sustainable development'), true);
  assert.equal(containsTargetWord('Sustainable\ndevelopment matters.', 'sustainable development'), true);
  assert.equal(containsTargetWord('This is partial evidence.', 'art'), false);
});

test('frontend transcript rendering does not assign model content to innerHTML', () => {
  const generatorPath = path.join(__dirname, '..', 'js', 'generator.js');
  const source = fs.readFileSync(generatorPath, 'utf8');
  assert.doesNotMatch(source, /transcriptText\.innerHTML/);
  assert.doesNotMatch(source, /targetWords\.innerHTML/);
  assert.match(source, /highlight\.textContent = match\[0\]/);
});

test('Mock Provider satisfies the real passage contract for every scene and word count', async () => {
  const mockProvider = loadMockProvider();
  const scenes = [
    'academic-lecture',
    'campus-conversation',
    'daily-life',
    'environment-nature',
  ];
  const vocabulary = [
    'environment', 'economy', 'sustainable development', 'research', 'community',
    'education', 'technology', 'conservation', 'flexibility', 'priorities',
    'academic', 'resources', 'engagement', 'ecosystem', 'resilience',
    'management', 'intervention', 'policy', 'commitment', 'circumstances',
  ];
  const wordCounts = [1, 3, 10, 20];

  for (const scene of scenes) {
    for (const count of wordCounts) {
      const words = vocabulary.slice(0, count);
      const result = await mockProvider.generate({
        words,
        scene,
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
    scene: 'academic-lecture',
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
    scene: 'academic-lecture',
    voices: ['british-female'],
    difficulty: 'medium',
  };

  await assert.rejects(mockProvider.generate({ ...base, words: [] }), /between 1 and 20/);
  await assert.rejects(mockProvider.generate({ ...base, words: new Array(21).fill('environment') }), /between 1 and 20/);
  await assert.rejects(mockProvider.generate({ ...base, words: ['<script>'] }), /Invalid target word/);
});
