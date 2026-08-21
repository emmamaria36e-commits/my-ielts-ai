/* ========================================
   Server API Provider
   Sends structured generation parameters to
   the same-origin Node backend. Provider keys,
   endpoints, and prompts never enter the browser.
   ======================================== */

(function () {
  'use strict';

  function validatePayload(payload) {
    if (!payload || typeof payload !== 'object' ||
        typeof payload.title !== 'string' ||
        typeof payload.passage !== 'string' ||
        !Array.isArray(payload.targetWords)) {
      throw new Error('Server returned an invalid passage result.');
    }

    return payload;
  }

  /**
   * Generate a passage through the trusted backend.
   *
   * @param {Object} p
   * @param {string[]} p.words      - target vocabulary
   * @param {string}   p.section    - IELTS section key
   * @param {string[]} p.voices     - voice keys
   * @param {string}   p.difficulty - 'easy' | 'medium' | 'hard'
   * @returns {Promise<Object>}
   */
  function generate(p) {
    return window.BetaAccess.fetch('/api/generate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        words:      p.words || [],
        section:    p.section || 'section-1',
        voices:     p.voices && p.voices.length ? p.voices : ['british-female'],
        difficulty: p.difficulty || 'medium',
      }),
    })
      .then(function (response) {
        return response.json()
          .catch(function () {
            return { error: { message: 'Server returned an unreadable response.' } };
          })
          .then(function (payload) {
            if (!response.ok) {
              var message = payload && payload.error && payload.error.message
                ? payload.error.message
                : 'Passage generation failed.';
              var requestError = new Error(message);
              requestError.status = response.status;
              throw requestError;
            }
            return validatePayload(payload);
          });
      });
  }

  window.APIProvider = {
    generate: generate,
  };
})();
