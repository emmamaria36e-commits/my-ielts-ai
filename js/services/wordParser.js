/* ========================================
   Target Word Parser
   Converts pasted or typed text into normalized
   target-word entries.
   ======================================== */

(function (root, factory) {
  var parser = factory();

  if (typeof module === 'object' && module.exports) {
    module.exports = parser;
  }

  if (root) {
    root.IELTSWordParser = parser;
  }
})(typeof window !== 'undefined' ? window : null, function () {
  'use strict';

  var MAX_WORDS = 20;
  var MAX_WORD_LENGTH = 40;
  var ENTRY_SEPARATOR = /[,，;；\r\n\t]+/;
  var VALID_WORD = /^[A-Za-z][A-Za-z' -]*$/;

  function normalize(value) {
    return String(value || '')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, ' ');
  }

  function parse(raw, existingWords) {
    var existing = Array.isArray(existingWords) ? existingWords.map(normalize) : [];
    var seen = new Set(existing);
    var added = [];
    var duplicates = [];
    var invalid = [];
    var overflow = [];

    String(raw || '').split(ENTRY_SEPARATOR).forEach(function (entry) {
      var word = normalize(entry);
      if (!word) return;

      if (word.length > MAX_WORD_LENGTH || !VALID_WORD.test(word)) {
        invalid.push(word);
        return;
      }

      if (seen.has(word)) {
        duplicates.push(word);
        return;
      }

      if (seen.size >= MAX_WORDS) {
        overflow.push(word);
        return;
      }

      seen.add(word);
      added.push(word);
    });

    return {
      added: added,
      duplicates: duplicates,
      invalid: invalid,
      overflow: overflow,
    };
  }

  function hasSeparator(raw) {
    return ENTRY_SEPARATOR.test(String(raw || ''));
  }

  return {
    MAX_WORDS: MAX_WORDS,
    hasSeparator: hasSeparator,
    normalize: normalize,
    parse: parse,
  };
});
