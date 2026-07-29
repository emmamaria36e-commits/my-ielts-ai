/* ========================================
   AI Service — Unified interface for passage
   generation. Selects a local mock or the
   trusted same-origin backend.

   Optional browser configuration:
     window.__IELTS_AI_CONFIG = {
       provider: 'api', // 'mock' | 'api'
     };

  No secrets or upstream endpoints belong in
  browser configuration.

   Direct file access uses Mock. Pages served by
   Node use the same-origin API by default.
   ======================================== */

(function () {
  'use strict';

  var DEFAULT_CONFIG = {
    provider: window.location.protocol === 'file:' ? 'mock' : 'api',
  };

  function getConfig() {
    var userConfig = window.__IELTS_AI_CONFIG || {};
    return {
      provider: userConfig.provider || DEFAULT_CONFIG.provider,
    };
  }

  /**
   * Generate an IELTS listening passage.
   *
   * @param {Object} params
   * @param {string[]} params.words      - target vocabulary (required)
   * @param {string}   params.section    - IELTS section key
   * @param {string[]} params.voices     - voice keys
   * @param {string}   params.difficulty - 'easy' | 'medium' | 'hard'
   * @returns {Promise<Object>}
   */
  function generatePassage(params) {
    var config = getConfig();

    if (!params.words || params.words.length === 0) {
      return Promise.reject(new Error('At least one target word is required.'));
    }

    var request = {
      words: params.words,
      section: params.section || 'section-1',
      voices: params.voices && params.voices.length ? params.voices : ['british-female'],
      difficulty: params.difficulty || 'medium',
    };

    if (config.provider === 'mock') {
      console.log('[AI Service] Using Mock Provider.');
      return window.MockAIProvider.generate(request);
    }

    console.log('[AI Service] Using same-origin server API.');
    return window.APIProvider.generate(request);
  }

  function getProviderName() {
    return getConfig().provider;
  }

  /**
   * Indicates whether the browser is configured to use the server API.
   * The server independently decides whether an upstream provider is ready.
   */
  function isRealAPIConfigured() {
    return getConfig().provider !== 'mock';
  }

  window.AIService = {
    generatePassage: generatePassage,
    getProviderName: getProviderName,
    isRealAPIConfigured: isRealAPIConfigured,
    getConfig: getConfig,
  };
})();
