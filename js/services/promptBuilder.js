/* ========================================
   Prompt Builder
   Single responsibility: build prompt from
   params. No strategy, no validation, no
   deduction — just construct the prompt.

   Usage:
     var prompt = PromptBuilder.build({
       words:   ['environment'],
       scene:   'academic-lecture',
       voices:  ['british-female'],
       difficulty: 'medium',
     });
     // prompt = { system: '...', user: '...' }
   ======================================== */

(function () {
  'use strict';

  var SCENE = {
    'academic-lecture':   'a university lecture. Formal academic language, clear structure.',
    'campus-conversation': 'a conversation between students and/or professors on campus. Natural dialogue with turn-taking.',
    'daily-life':         'an everyday conversation or podcast about daily life. Casual, natural spoken English.',
    'environment-nature': 'a talk or documentary about environment and nature. Descriptive, engaging narrative.',
  };

  var DIFFICULTY = {
    'easy':   'Intermediate vocabulary. Short sentences. 180-250 words. IELTS Band 5.0-6.0.',
    'medium': 'Upper-intermediate vocabulary. Varied sentences. 250-350 words. IELTS Band 6.0-7.0.',
    'hard':   'Advanced vocabulary. Mixed sentence length. 350-450 words. IELTS Band 7.0+.',
  };

  var VOICE = {
    'british-female':     'British female (RP, clear, formal)',
    'british-male':       'British male (RP, steady, natural)',
    'australian-female':  'Australian female (General Australian, warm)',
    'american-female':    'American female (General American, fluent)',
  };

  var VOICE_FLAG = {
    'british-female':     '🇬🇧',
    'british-male':       '🇬🇧',
    'australian-female':  '🇦🇺',
    'american-female':    '🇺🇸',
  };

  var VOICE_LABEL = {
    'british-female':     'British Female',
    'british-male':       'British Male',
    'australian-female':  'Australian Female',
    'american-female':    'American Female',
  };

  var SCENE_LABEL = {
    'academic-lecture':    'Academic Lecture',
    'campus-conversation': 'Campus Conversation',
    'daily-life':          'Daily Life',
    'environment-nature':  'Environment & Nature',
  };

  /**
   * Build system + user prompts from params.
   *
   * @param {Object}   p
   * @param {string[]} p.words      - target vocabulary
   * @param {string}   p.scene      - scene key
   * @param {string[]} p.voices     - voice keys (array)
   * @param {string}   p.difficulty - 'easy' | 'medium' | 'hard'
   * @returns {{ system: string, user: string }}
   */
  function build(p) {
    var words     = p.words || [];
    var scene     = p.scene || 'academic-lecture';
    var voices    = p.voices && p.voices.length ? p.voices : ['british-female'];
    var difficulty = p.difficulty || 'medium';

    var sceneDesc = SCENE[scene] || SCENE['academic-lecture'];
    var diffDesc  = DIFFICULTY[difficulty] || DIFFICULTY['medium'];

    var voiceList = voices.map(function (v) { return VOICE[v] || v; }).join(' and ');
    var voiceNames = voices.map(function (v) { return VOICE_LABEL[v] || v; }).join(', ');

    var multiVoice = voices.length > 1;
    var formatHint = multiVoice
      ? 'Generate a DIALOGUE with ' + voices.length + ' speakers (' + voiceNames + '). Label each line with speaker names (e.g. "Emma:", "Professor:").'
      : 'Generate a MONOLOGUE. Write as a continuous passage without speaker labels.';

    var system = [
      'You are an IELTS listening test creator.',
      '',
      'SCENE: ' + sceneDesc,
      'VOICE: ' + voiceList,
      'DIFFICULTY: ' + diffDesc,
      'FORMAT: ' + formatHint,
      'TARGET WORDS: ' + words.join(', '),
      '',
      'REQUIREMENTS:',
      '1. Naturally include ALL target words in the passage.',
      '2. Sound like a real IELTS listening test.',
      '3. Wrap each target word in <b>...</b> on first occurrence.',
      '',
      'Return ONLY valid JSON:',
      '{ "title": "...", "passage": "..." }',
    ].join('\n');

    var user = 'Generate an IELTS listening passage. Return ONLY valid JSON.';

    return { system: system, user: user };
  }

  /** Get { flag, label } for a voice key. */
  function getVoiceMeta(voiceKey) {
    return {
      flag:  VOICE_FLAG[voiceKey] || '🎤',
      label: VOICE_LABEL[voiceKey] || voiceKey,
    };
  }

  /** Get display label for a scene key. */
  function getSceneLabel(sceneKey) {
    return SCENE_LABEL[sceneKey] || sceneKey;
  }

  /* ── Expose ── */
  window.PromptBuilder = {
    build:         build,
    getVoiceMeta:  getVoiceMeta,
    getSceneLabel: getSceneLabel,
  };
})();
