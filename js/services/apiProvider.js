/* ========================================
   Real AI API Provider (Placeholder)
   Ready to connect to DeepSeek / OpenAI /
   Anthropic / any OpenAI-compatible API.

   To enable, set window.__IELTS_AI_CONFIG:
     window.__IELTS_AI_CONFIG = {
       provider: 'deepseek',   // 'deepseek' | 'openai' | 'anthropic' | 'custom'
       apiKey: 'sk-...',
       model: 'deepseek-chat', // or 'gpt-4o', 'claude-sonnet-5', etc.
       endpoint: 'https://api.deepseek.com/v1/chat/completions',  // optional
     };
   ======================================== */

(function () {
  'use strict';

  /**
   * Build the system prompt for IELTS passage generation.
   */
  function buildSystemPrompt(params) {
    var sceneDescriptions = {
      'academic-lecture': 'a university lecture in an academic setting',
      'campus-conversation': 'a conversation between students and/or professors on campus',
      'daily-life': 'an everyday conversation or podcast about daily life topics',
      'environment-nature': 'a talk, documentary, or discussion about environment and nature',
    };

    var difficultyGuides = {
      'easy': 'Use intermediate vocabulary. Keep sentences relatively short and clear. Target 180-250 words. Suitable for IELTS Band 5.0-6.0 learners.',
      'medium': 'Use upper-intermediate vocabulary. Vary sentence length. Target 250-350 words. Suitable for IELTS Band 6.0-7.0 learners.',
      'hard': 'Use advanced vocabulary including some academic terms. Mix short and long sentences. Target 350-450 words. Suitable for IELTS Band 7.0+ learners.',
    };

    var sceneDesc = sceneDescriptions[params.scene] || sceneDescriptions['academic-lecture'];
    var diffGuide = difficultyGuides[params.difficulty] || difficultyGuides['medium'];

    return [
      'You are an expert IELTS listening test creator. Your task is to generate an authentic IELTS listening passage.',
      '',
      'SCENE: ' + sceneDesc,
      'DIFFICULTY: ' + diffGuide,
      'TARGET WORDS (must be naturally incorporated): ' + (params.words || []).join(', '),
      '',
      'REQUIREMENTS:',
      '1. The passage MUST naturally include ALL the target words listed above.',
      '2. The passage should read like a real IELTS listening test — authentic, coherent, and engaging.',
      '3. Use natural speech patterns appropriate for the scene (e.g., lectures use formal academic language; conversations use natural dialogue).',
      '4. Include some hesitation markers, repetitions, or self-corrections in conversations to sound authentic.',
      '5. Bold or mark the target words the FIRST time they appear.',
      '',
      'OUTPUT FORMAT — Return ONLY valid JSON (no markdown, no explanation):',
      '{',
      '  "title": "A descriptive title for the passage",',
      '  "passage": "The full passage text, with target words wrapped in <b>...</b> tags on first occurrence",',
      '}',
    ].join('\n');
  }

  /**
   * Call the AI API to generate a passage.
   *
   * Supports:
   *   - DeepSeek API (https://api.deepseek.com/v1/chat/completions)
   *   - OpenAI API (https://api.openai.com/v1/chat/completions)
   *   - Any OpenAI-compatible endpoint
   *
   * @param {Object} params - Same as mockProvider.generate()
   * @returns {Promise<Object>}
   */
  function generate(params) {
    var config = window.__IELTS_AI_CONFIG || {};
    var apiKey = config.apiKey || '';
    var model = config.model || 'deepseek-chat';
    var endpoint = config.endpoint || 'https://api.deepseek.com/v1/chat/completions';

    if (!apiKey) {
      return Promise.reject(new Error(
        'AI API key not configured. Set window.__IELTS_AI_CONFIG.apiKey before calling generate().\n' +
        'Example: window.__IELTS_AI_CONFIG = { provider: "deepseek", apiKey: "sk-...", model: "deepseek-chat" };'
      ));
    }

    var systemPrompt = buildSystemPrompt(params);

    return fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + apiKey,
      },
      body: JSON.stringify({
        model: model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: 'Generate an IELTS listening passage with the target words naturally incorporated. Return ONLY valid JSON.' },
        ],
        temperature: 0.8,
        max_tokens: 2048,
        response_format: { type: 'json_object' },  // For OpenAI/DeepSeek JSON mode
      }),
    })
      .then(function (response) {
        if (!response.ok) {
          return response.json().then(function (err) {
            throw new Error('API Error (' + response.status + '): ' + (err.error?.message || JSON.stringify(err)));
          });
        }
        return response.json();
      })
      .then(function (data) {
        var content = data.choices?.[0]?.message?.content;
        if (!content) {
          throw new Error('API returned empty response.');
        }

        var parsed;
        try {
          parsed = JSON.parse(content);
        } catch (e) {
          // If JSON parsing fails, try to extract JSON from the text
          var jsonMatch = content.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            parsed = JSON.parse(jsonMatch[0]);
          } else {
            // Treat the raw content as the passage
            parsed = { title: 'Generated Passage', passage: content };
          }
        }

        return {
          passage: parsed.passage || content,
          title: parsed.title || 'Generated Passage',
          targetWords: params.words || [],
          metadata: {
            scene: params.scene || 'academic-lecture',
            difficulty: params.difficulty || 'medium',
            voice: params.voice || 'british-female',
            wordCount: (parsed.passage || content).split(/\s+/).length,
            generatedBy: config.provider || 'api',
            model: model,
            generatedAt: new Date().toISOString(),
            usage: data.usage || null,
          },
        };
      });
  }

  /* ── Expose ── */
  window.APIProvider = {
    generate: generate,
    buildSystemPrompt: buildSystemPrompt,
  };
})();
