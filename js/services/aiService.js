/* ========================================
   AI Service — Unified interface for passage
   generation. Automatically selects the
   appropriate provider based on config.

   Usage:
     aiService.generatePassage({
       words: ['environment', 'sustainable', ...],
       scene: 'academic-lecture',
       voices: ['british-female'],
       difficulty: 'medium',
     }).then(function (result) {
       // result = { passage, title, targetWords, metadata }
     });

   Configuration (optional):
     window.__IELTS_AI_CONFIG = {
       provider: 'deepseek',      // 'mock' | 'deepseek' | 'openai' | 'custom'
       apiKey: 'sk-...',          // Required for non-mock providers
       model: 'deepseek-chat',    // Model name
       endpoint: '...',           // Custom API endpoint (optional)
     };
   ======================================== */

(function () {
  'use strict';

  /* ── Default config ── */
  var DEFAULT_CONFIG = {
    provider: 'mock',       // Default: use mock (safe, no API key needed)
    model: 'deepseek-chat',
    endpoint: 'https://api.deepseek.com/v1/chat/completions',
    apiKey: '',
  };

  /**
   * Merge user config with defaults.
   */
  function getConfig() {
    var userConfig = window.__IELTS_AI_CONFIG || {};
    var merged = {};
    var keys = Object.keys(DEFAULT_CONFIG);
    for (var i = 0; i < keys.length; i++) {
      var key = keys[i];
      merged[key] = (userConfig[key] !== undefined) ? userConfig[key] : DEFAULT_CONFIG[key];
    }
    return merged;
  }

  /**
   * Generate an IELTS listening passage.
   *
   * @param {Object} params
   * @param {string[]} params.words        - Target vocabulary words (required)
   * @param {string}   params.scene        - Scene key (default: 'academic-lecture')
   * @param {string[]} params.voices       - Voice keys (default: ['british-female'])
   * @param {string}   params.difficulty   - 'easy' | 'medium' | 'hard' (default: 'medium')
   * @returns {Promise<Object>} { passage, title, targetWords, metadata }
   */
  function generatePassage(params) {
    var config = getConfig();

    // Validate required fields
    if (!params.words || params.words.length === 0) {
      return Promise.reject(new Error('At least one target word is required.'));
    }

    // Ensure defaults
    var request = {
      words: params.words,
      scene: params.scene || 'academic-lecture',
      voices: params.voices && params.voices.length ? params.voices : ['british-female'],
      difficulty: params.difficulty || 'medium',
    };

    // Select provider
    if (config.provider === 'mock' || !config.apiKey) {
      // Use mock provider
      console.log('[AI Service] Using Mock Provider (provider=' + config.provider + ', apiKey=' + (config.apiKey ? 'set' : 'not set') + ')');
      return window.MockAIProvider.generate(request);
    }

    // Use real API provider
    console.log('[AI Service] Using API Provider (' + config.provider + ', model=' + config.model + ')');
    return window.APIProvider.generate(request);
  }

  /**
   * Get the current provider name.
   * @returns {string} 'mock' | 'deepseek' | 'openai' | 'custom'
   */
  function getProviderName() {
    return getConfig().provider;
  }

  /**
   * Check whether a real API is configured.
   * @returns {boolean}
   */
  function isRealAPIConfigured() {
    var config = getConfig();
    return config.provider !== 'mock' && !!config.apiKey;
  }

  /* ── Expose ── */
  window.AIService = {
    generatePassage: generatePassage,
    getProviderName: getProviderName,
    isRealAPIConfigured: isRealAPIConfigured,
    getConfig: getConfig,
  };
})();
