/* ========================================
   Mock AI Provider (development only)
   Returns a stable base passage plus a
   section-specific vocabulary-focus sentence.
   This is a deterministic development fixture,
   not a replacement for real AI generation.
   ======================================== */

(function () {
  'use strict';

  /* ── One lightweight fixture per IELTS Listening section ── */
  var PASSAGES = {
    'section-1': {
      title: 'Booking a Community Hall',
      passage: [
        'Speaker A: Good morning. I\'d like to book the community hall for a family event next Saturday.',
        'Speaker B: Certainly. The main hall is available from two o\'clock, and the booking includes tables and chairs.',
        'Speaker A: Great. I thought the deposit was thirty pounds.',
        'Speaker B: It used to be, but it is now forty pounds. You can pay when you collect the key on Friday.',
      ].join('\n\n'),
    },

    'section-2': {
      title: 'Welcome to the Riverside Centre',
      passage: [
        'Welcome to the Riverside Community Centre. Before today\'s activities begin, I\'ll explain the layout. The reception desk is directly opposite the main entrance. To reach the art room, walk past reception and take the first corridor on your left.',
        'The café opens at nine thirty, while the sports hall is available from ten. Please check the noticeboard beside the café for changes to the weekly timetable. Finally, bicycles must be left in the covered area behind the building.',
      ].join('\n\n'),
    },

    'section-3': {
      title: 'Planning a Research Project',
      passage: [
        'Speaker A: We need to narrow the topic for our research project. I think we should study how students use the library.',
        'Speaker B: That could work, but observing everyone would take too long. What about interviewing a smaller group?',
        'Speaker C: I agree with the interviews, although we should also collect usage figures from the library.',
        'Speaker A: Good point. So we\'ll combine the statistics with student feedback and explain the limits of each method.',
      ].join('\n\n'),
    },

    'section-4': {
      title: 'Understanding Ecosystem Resilience',
      passage: [
        'Today we will examine ecosystem resilience, which describes how a natural system responds to disruption. First, researchers measure the immediate loss of species. Next, they observe the speed and extent of recovery.',
        'Evidence from coastal wetlands suggests that biodiversity can improve when pollution is reduced and native plants are restored. However, recovery is slower when habitats remain fragmented. This finding matters because it shows that conservation depends not only on protecting individual species, but also on maintaining connections across the wider landscape.',
      ].join('\n\n'),
    },
  };

  var DIFFICULTY_LABEL = {
    'easy': 'Easy', 'medium': 'Medium', 'hard': 'Hard',
  };

  var WORD_PATTERN = /^[A-Za-z][A-Za-z' -]*$/;

  var VOCABULARY_FOCUS = {
    'section-1': function (wordList) {
      return 'Speaker B: Before you go, please confirm these details: ' + wordList + '.';
    },
    'section-2': function (wordList) {
      return 'Please also note the following information: ' + wordList + '.';
    },
    'section-3': function (wordList) {
      return 'Speaker C: We should include these points in our notes: ' + wordList + '.';
    },
    'section-4': function (wordList) {
      return 'The key terms for this part of the lecture are ' + wordList + '.';
    },
  };

  function normalizeWords(input) {
    if (!Array.isArray(input) || input.length < 1 || input.length > 20) {
      throw new Error('Provide between 1 and 20 target words.');
    }

    var normalized = [];
    input.forEach(function (rawWord) {
      if (typeof rawWord !== 'string') {
        throw new Error('Every target word must be text.');
      }

      var word = rawWord.trim().toLowerCase().replace(/\s+/g, ' ');
      if (!word || word.length > 40 || !WORD_PATTERN.test(word)) {
        throw new Error('Invalid target word: ' + rawWord);
      }

      if (!normalized.includes(word)) {
        normalized.push(word);
      }
    });

    return normalized;
  }

  function formatWordList(words) {
    if (words.length === 1) return words[0];
    if (words.length === 2) return words[0] + ' and ' + words[1];
    return words.slice(0, -1).join(', ') + ', and ' + words[words.length - 1];
  }

  function buildVocabularyFocus(section, words) {
    var builder = VOCABULARY_FOCUS[section] || VOCABULARY_FOCUS['section-1'];
    return builder(formatWordList(words));
  }

  /**
   * Generate a mock IELTS listening passage.
   *
   * @param {Object} p
   * @param {string[]} p.words      - target vocabulary
   * @param {string}   p.section    - IELTS Listening section key
   * @param {string[]} p.voices     - voice keys (array)
   * @param {string}   p.difficulty - 'easy' | 'medium' | 'hard'
   * @returns {Promise<Object>}
   */
  function generate(p) {
    var words;
    try {
      words = normalizeWords(p.words || []);
    } catch (error) {
      return Promise.reject(error);
    }

    var section   = p.section || 'section-1';
    var voices    = p.voices && p.voices.length ? p.voices : ['british-female'];
    var difficulty = p.difficulty || 'medium';

    // Build the prompt for debugging (same as real API would use)
    var prompt = window.PromptBuilder
      ? window.PromptBuilder.build({ words: words, section: section, voices: voices, difficulty: difficulty })
      : null;

    return new Promise(function (resolve) {
      var delay = 400 + Math.random() * 600; // 400–1000ms

      setTimeout(function () {
        var entry = PASSAGES[section] || PASSAGES['section-1'];
        var passage = entry.passage + '\n\n' + buildVocabularyFocus(section, words);

        if (prompt) {
          console.log('[MockProvider] Prompt that would be sent:\n', prompt.system);
        }

        resolve({
          passage: passage,
          title: entry.title,
          targetWords: words.slice(),
          metadata: {
            section: section,
            difficulty: difficulty,
            difficultyLabel: DIFFICULTY_LABEL[difficulty] || 'Medium',
            voices: voices,
            wordCount: passage.split(/\s+/).length,
            generatedBy: 'mock',
            generatedAt: new Date().toISOString(),
          },
        });
      }, delay);
    });
  }

  /* ── Expose ── */
  window.MockAIProvider = {
    generate: generate,
  };
})();
