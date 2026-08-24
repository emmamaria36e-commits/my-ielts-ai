/* ========================================
   Browser Prompt Metadata
   Mirrors the server-side section descriptions
   for Mock debugging and result labels. The
   trusted production prompt lives on the server.
   ======================================== */

(function () {
  'use strict';

  var SECTION = {
    'section-1': 'IELTS Listening Section 1 — Everyday Conversation',
    'section-2': 'IELTS Listening Section 2 — Social Monologue',
    'section-3': 'IELTS Listening Section 3 — Academic Discussion',
    'section-4': 'IELTS Listening Section 4 — Academic Lecture',
  };

  var VOICE_FLAG = {
    'british-female': 'GB',
    'british-male': 'GB',
    'australian-female': 'AU',
    'american-female': 'US',
  };

  var VOICE_LABEL = {
    'british-female': 'British Female',
    'british-male': 'British Male',
    'australian-female': 'Australian Female',
    'american-female': 'American Female',
  };

  function build(params) {
    var section = params.section || 'section-1';
    return {
      system: [
        'You are an expert IELTS Listening script writer.',
        'TEST PART: ' + (SECTION[section] || SECTION['section-1']),
        'TARGET WORDS: ' + JSON.stringify(params.words || []),
        'The production prompt is constructed on the trusted server.',
      ].join('\n'),
      user: 'Generate a new IELTS Listening script. Return ONLY valid JSON.',
    };
  }

  function getVoiceMeta(voiceKey) {
    return {
      flag: VOICE_FLAG[voiceKey] || '🎤',
      label: VOICE_LABEL[voiceKey] || voiceKey,
    };
  }

  function getSectionLabel(sectionKey) {
    return SECTION[sectionKey] || sectionKey;
  }

  window.PromptBuilder = {
    build: build,
    getVoiceMeta: getVoiceMeta,
    getSectionLabel: getSectionLabel,
  };
})();
