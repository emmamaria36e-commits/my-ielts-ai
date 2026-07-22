'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

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
