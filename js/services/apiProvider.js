/* ========================================
   Real AI API Provider
   Connects to DeepSeek / OpenAI / any
   OpenAI-compatible API.

   Uses PromptBuilder for prompt construction.
   PromptBuilder must be loaded before this file.

   Config (set before calling):
     window.__IELTS_AI_CONFIG = {
       provider: 'deepseek',
       apiKey: 'sk-...',
       model: 'deepseek-chat',
       endpoint: 'https://api.deepseek.com/v1/chat/completions',
     };
   ======================================== */

(function () {
  'use strict';

  /**
   * Call the AI API to generate a passage.
   *
   * @param {Object} p
   * @param {string[]} p.words      - target vocabulary
   * @param {string}   p.scene      - scene key
   * @param {string[]} p.voices     - voice keys (array)
   * @param {string}   p.difficulty - 'easy' | 'medium' | 'hard'
   * @returns {Promise<Object>}
   */
  function generate(p) {
    var config   = window.__IELTS_AI_CONFIG || {};
    var apiKey   = config.apiKey || '';
    var model    = config.model || 'deepseek-chat';
    var endpoint = config.endpoint || 'https://api.deepseek.com/v1/chat/completions';

    if (!apiKey) {
      return Promise.reject(new Error(
        'AI API key not configured. Set window.__IELTS_AI_CONFIG.apiKey.\n' +
        'Example: window.__IELTS_AI_CONFIG = { provider: "deepseek", apiKey: "sk-...", model: "deepseek-chat" };'
      ));
    }

    // Build prompt using the independent PromptBuilder
    var prompt = window.PromptBuilder
      ? window.PromptBuilder.build({
          words:      p.words || [],
          scene:      p.scene || 'academic-lecture',
          voices:     p.voices && p.voices.length ? p.voices : ['british-female'],
          difficulty: p.difficulty || 'medium',
        })
      : { system: '', user: 'Generate an IELTS listening passage. Return ONLY valid JSON.' };

    return fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + apiKey,
      },
      body: JSON.stringify({
        model: model,
        messages: [
          { role: 'system', content: prompt.system },
          { role: 'user',   content: prompt.user },
        ],
        temperature: 0.8,
        max_tokens: 2048,
        response_format: { type: 'json_object' },
      }),
    })
      .then(function (response) {
        if (!response.ok) {
          return response.json().then(function (err) {
            throw new Error('API Error (' + response.status + '): ' +
              (err.error?.message || JSON.stringify(err)));
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
          var m = content.match(/\{[\s\S]*\}/);
          parsed = m ? JSON.parse(m[0])
                     : { title: 'Generated Passage', passage: content };
        }

        return {
          passage:     parsed.passage || content,
          title:       parsed.title || 'Generated Passage',
          targetWords: (p.words || []).slice(),
          metadata: {
            scene:      p.scene || 'academic-lecture',
            difficulty: p.difficulty || 'medium',
            voices:     p.voices || ['british-female'],
            wordCount:  (parsed.passage || content).split(/\s+/).length,
            generatedBy: config.provider || 'api',
            model:      model,
            generatedAt: new Date().toISOString(),
            usage:      data.usage || null,
          },
        };
      });
  }

  /* ── Expose ── */
  window.APIProvider = {
    generate: generate,
  };
})();
