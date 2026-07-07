/* ========================================
   AI Listening Generator — Interaction Logic
   ======================================== */

(function () {
  'use strict';

  /* ── DOM refs ── */
  const tagWrapper = document.getElementById('tagWrapper');
  const tagInput = document.getElementById('tagInput');
  const submitBtn = document.getElementById('generateBtn');
  const submitText = submitBtn?.querySelector('.generator__submit-text');

  /* ── State ── */
  const words = [];

  /* ========================================
     Tag Input
     ======================================== */

  /**
   * Add a word to the tag list.
   * Trims, lowercases, deduplicates, and rejects empty strings.
   */
  function addWord(raw) {
    const word = raw.trim().toLowerCase();
    if (!word) return;

    // Deduplicate
    if (words.includes(word)) {
      tagInput.value = '';
      return;
    }

    words.push(word);
    renderTags();
    tagInput.value = '';
    tagInput.focus();
  }

  /**
   * Remove a word by index.
   */
  function removeWord(index) {
    words.splice(index, 1);
    renderTags();
    tagInput.focus();
  }

  /**
   * Re-render all tag elements inside the wrapper.
   */
  function renderTags() {
    // Remove existing tags (keep the input)
    const existing = tagWrapper.querySelectorAll('.tag');
    existing.forEach(function (el) { return el.remove(); });

    // Create tag for each word
    words.forEach(function (word, i) {
      var tag = document.createElement('span');
      tag.className = 'tag';
      tag.innerHTML =
        '<span>' + escapeHTML(word) + '</span>' +
        '<button class="tag__remove" type="button" data-index="' + i + '" aria-label="Remove ' + escapeHTML(word) + '">&times;</button>';

      // Insert before the input
      tagWrapper.insertBefore(tag, tagInput);
    });

    // Toggle a class so CSS can adjust padding
    if (words.length > 0) {
      tagWrapper.classList.add('has-tags');
    } else {
      tagWrapper.classList.remove('has-tags');
    }

    // Update submit button state
    updateSubmitState();
  }

  function escapeHTML(str) {
    var div = document.createElement('div');
    div.appendChild(document.createTextNode(str));
    return div.innerHTML;
  }

  /* ── Event: typing in the input ── */
  tagInput.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addWord(tagInput.value.replace(',', ''));
      return;
    }

    // Backspace on empty input removes the last tag
    if (e.key === 'Backspace' && tagInput.value === '' && words.length > 0) {
      removeWord(words.length - 1);
    }
  });

  // Also add on blur (treat leaving the input as "commit")
  tagInput.addEventListener('blur', function () {
    if (tagInput.value.trim()) {
      addWord(tagInput.value);
    }
  });

  /* ── Event: click on wrapper focuses input ── */
  tagWrapper.addEventListener('click', function (e) {
    // If a remove button was clicked, handle it
    if (e.target.classList.contains('tag__remove') || e.target.closest('.tag__remove')) {
      var btn = e.target.classList.contains('tag__remove') ? e.target : e.target.closest('.tag__remove');
      var idx = parseInt(btn.getAttribute('data-index'), 10);
      if (!isNaN(idx)) {
        removeWord(idx);
      }
      return;
    }
    // Otherwise focus the input
    tagInput.focus();
  });

  /* ========================================
     Scene & Voice Selection — visual only
     (radio inputs handle state natively)
     ======================================== */

  // No extra JS needed — CSS :checked pseudo-class handles the styling.
  // We read the selected values at submit time.

  /* ========================================
     Voice Sample Playback (placeholder)
     ======================================== */

  var currentSampleBtn = null;

  document.querySelectorAll('.voice-card__sample').forEach(function (btn) {
    btn.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();

      // Toggle off if clicking the same one
      if (currentSampleBtn === btn) {
        btn.classList.remove('playing');
        currentSampleBtn = null;
        return;
      }

      // Stop previous
      if (currentSampleBtn) {
        currentSampleBtn.classList.remove('playing');
      }

      // Start this one
      btn.classList.add('playing');
      currentSampleBtn = btn;

      // Auto-stop after 3 seconds (simulated sample length)
      setTimeout(function () {
        btn.classList.remove('playing');
        if (currentSampleBtn === btn) {
          currentSampleBtn = null;
        }
      }, 3000);
    });
  });

  /* ========================================
     Submit Button
     ======================================== */

  function updateSubmitState() {
    if (!submitBtn) return;
    submitBtn.disabled = words.length === 0;
  }

  // Initial state
  updateSubmitState();

  submitBtn.addEventListener('click', function () {
    if (words.length === 0) return;

    // Collect selected scene
    var sceneInput = document.querySelector('input[name="scene"]:checked');
    var scene = sceneInput ? sceneInput.value : null;

    // Collect selected voice
    var voiceInput = document.querySelector('input[name="voice"]:checked');
    var voice = voiceInput ? voiceInput.value : null;

    // Show loading state
    submitBtn.classList.add('loading');

    // Simulate AI generation delay (will be replaced with real API call)
    setTimeout(function () {
      submitBtn.classList.remove('loading');

      // Dispatch custom event with the collected data
      var event = new CustomEvent('generator:submit', {
        detail: {
          words: words.slice(),
          scene: scene,
          voice: voice,
        },
      });

      document.dispatchEvent(event);
    }, 2000);
  });

  /* ========================================
     Result Display — Mock data for demo
     ======================================== */

  var voiceMeta = {
    'british-female':     { flag: '🇬🇧', label: 'British Female' },
    'british-male':       { flag: '🇬🇧', label: 'British Male' },
    'australian-female':  { flag: '🇦🇺', label: 'Australian Female' },
    'american-female':    { flag: '🇺🇸', label: 'American Female' },
  };

  var sceneLabel = {
    'academic-lecture':     'Academic Lecture',
    'campus-conversation':  'Campus Conversation',
    'daily-life':           'Daily Life',
    'environment-nature':   'Environment & Nature',
  };

  /**
   * Generate a mock IELTS listening passage using the given words.
   * In production, this will be replaced by an API call.
   */
  function generateMockPassage(words, scene) {
    var templates = {
      'academic-lecture': [
        'In today\'s lecture, we will examine the relationship between <b>{0}</b> and modern society. Many scholars argue that <b>{1}</b> plays a crucial role in shaping public policy. Furthermore, research conducted at leading universities suggests that <b>{2}</b> is becoming increasingly important in the global context. Let us now turn our attention to how these factors interact with one another.',
      ],
      'campus-conversation': [
        'Student: "Professor, I was wondering if you could explain the concept of <b>{0}</b> in more detail?"\n\nProfessor: "Of course. <b>{0}</b> is closely linked to <b>{1}</b>, which we discussed last week. When we consider <b>{2}</b>, we must take into account the broader implications for society."',
      ],
      'daily-life': [
        'I recently read an interesting article about <b>{0}</b> and how it affects our everyday lives. The author pointed out that <b>{1}</b> is something we often take for granted. Additionally, the growing concern over <b>{2}</b> has led many people to reconsider their lifestyle choices.',
      ],
      'environment-nature': [
        'The impact of human activity on the environment has been a topic of heated debate. Scientists have identified <b>{0}</b> as one of the most pressing issues of our time. Without immediate action to address <b>{1}</b>, the consequences for future generations could be severe. Several countries have already implemented policies to promote <b>{2}</b> as a way to combat climate change.',
      ],
    };

    var templatesForScene = templates[scene] || templates['academic-lecture'];
    var template = templatesForScene[0];

    // Fill in the blanks with user words (or fallback)
    var filledWords = [];
    for (var i = 0; i < 3; i++) {
      filledWords.push(words[i] || words[0] || 'this topic');
    }

    return template
      .replace('{0}', filledWords[0])
      .replace('{1}', filledWords[1])
      .replace('{2}', filledWords[2]);
  }

  /**
   * Highlight user words in the passage HTML.
   */
  function highlightWords(html, words) {
    var result = html;
    words.forEach(function (word) {
      var escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      var regex = new RegExp('(\\b' + escaped + '\\b)', 'gi');
      result = result.replace(regex, '<span class="transcript__word-highlight">$1</span>');
    });
    return result;
  }

  document.addEventListener('generator:submit', function (e) {
    var data = e.detail;
    var resultSection = document.getElementById('resultSection');
    var transcriptText = document.getElementById('transcriptText');
    var targetWords = document.getElementById('targetWords');
    var voice = data.voice || 'british-female';
    var meta = voiceMeta[voice] || voiceMeta['british-female'];

    // Build transcript
    var rawPassage = generateMockPassage(data.words, data.scene);
    var highlighted = highlightWords(rawPassage, data.words);
    transcriptText.innerHTML = '<p>' + highlighted.replace(/\n\n/g, '</p><p>') + '</p>';

    // Build target words summary
    if (targetWords) {
      targetWords.innerHTML =
        '<span class="target-words__label">🎯 目标词汇：</span>' +
        data.words.map(function (w) {
          return '<span class="target-words__word"><span class="target-words__check">✓</span> ' + escapeHTML(w) + '</span>';
        }).join('');
    }

    // Update voice info in player
    var voiceFlag = document.querySelector('#audioPlayer .audio-player__voice-flag');
    var voiceLabel = document.querySelector('#audioPlayer .audio-player__voice-label');
    if (voiceFlag) voiceFlag.textContent = meta.flag;
    if (voiceLabel) voiceLabel.textContent = meta.label;

    // Show result section
    if (resultSection) {
      resultSection.classList.add('visible');
      resultSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    // Initialize player with demo audio (generated sine wave for demo)
    initDemoPlayer(voice);
  });

  function initDemoPlayer(voice) {
    var container = document.getElementById('audioPlayer');
    if (!container) return;

    // Destroy previous player instance if exists
    if (window._activePlayer) {
      window._activePlayer.destroy();
    }

    var voiceMetaMap = {
      'british-female':     { flag: '🇬🇧', label: 'British Female' },
      'british-male':       { flag: '🇬🇧', label: 'British Male' },
      'australian-female':  { flag: '🇦🇺', label: 'Australian Female' },
      'american-female':    { flag: '🇺🇸', label: 'American Female' },
    };
    var meta = voiceMetaMap[voice] || voiceMetaMap['british-female'];

    var player = window.IELTSPlayer.create(container, {
      voiceFlag: meta.flag,
      voiceLabel: meta.label,
    });

    // Generate a demo audio tone via Web Audio API
    generateDemoTone(function (blobUrl) {
      player.load(blobUrl);
    });

    window._activePlayer = player;
  }

  /**
   * Generate a simple demo audio tone.
   * This is a placeholder until real TTS audio is available.
   */
  function generateDemoTone(callback) {
    try {
      var AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) {
        console.warn('Web Audio API not available');
        callback('');
        return;
      }

      var ctx = new AudioContext();
      var sampleRate = ctx.sampleRate;
      var duration = 4; // seconds
      var length = sampleRate * duration;
      var buffer = ctx.createBuffer(1, length, sampleRate);
      var data = buffer.getChannelData(0);

      // Generate a simple melody-like tone
      var notes = [261.63, 293.66, 329.63, 349.23, 392.00, 349.23, 329.63, 293.66];
      var noteLength = length / notes.length;

      for (var i = 0; i < length; i++) {
        var noteIdx = Math.floor(i / noteLength);
        var freq = notes[Math.min(noteIdx, notes.length - 1)];
        var t = i / sampleRate;
        var envelope = Math.max(0, 1 - (i / length) * 0.7);

        // Mix sine wave with a bit of harmonics for a warmer tone
        var sample = Math.sin(2 * Math.PI * freq * t) * 0.6 +
                     Math.sin(2 * Math.PI * freq * 2 * t) * 0.2 +
                     Math.sin(2 * Math.PI * freq * 3 * t) * 0.1;
        data[i] = sample * envelope * 0.5;
      }

      // Convert to WAV blob
      var wav = encodeWAV(buffer);
      var blob = new Blob([wav], { type: 'audio/wav' });
      var url = URL.createObjectURL(blob);
      callback(url);
    } catch (err) {
      console.warn('Failed to generate demo tone:', err);
      callback('');
    }
  }

  /**
   * Encode AudioBuffer as WAV.
   */
  function encodeWAV(audioBuffer) {
    var numChannels = audioBuffer.numberOfChannels;
    var sampleRate = audioBuffer.sampleRate;
    var format = 1; // PCM
    var bitsPerSample = 16;
    var data = audioBuffer.getChannelData(0);
    var byteRate = sampleRate * numChannels * bitsPerSample / 8;
    var blockAlign = numChannels * bitsPerSample / 8;
    var dataLength = data.length * numChannels * bitsPerSample / 8;
    var buffer = new ArrayBuffer(44 + dataLength);
    var view = new DataView(buffer);

    // WAV header
    writeString(view, 0, 'RIFF');
    view.setUint32(4, 36 + dataLength, true);
    writeString(view, 8, 'WAVE');
    writeString(view, 12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, format, true);
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, byteRate, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, bitsPerSample, true);
    writeString(view, 36, 'data');
    view.setUint32(40, dataLength, true);

    // Write samples
    var offset = 44;
    for (var i = 0; i < data.length; i++) {
      var sample = Math.max(-1, Math.min(1, data[i]));
      sample = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
      view.setInt16(offset, sample, true);
      offset += 2;
    }

    return buffer;
  }

  function writeString(view, offset, string) {
    for (var i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  }

  /* ========================================
     Public API (exposed on window for later use)
     ======================================== */

  window.IELTSGenerator = {
    getWords: function () { return words.slice(); },
    getSelectedScene: function () {
      var el = document.querySelector('input[name="scene"]:checked');
      return el ? el.value : null;
    },
    getSelectedVoice: function () {
      var el = document.querySelector('input[name="voice"]:checked');
      return el ? el.value : null;
    },
    addWord: addWord,
    clearWords: function () {
      words.length = 0;
      renderTags();
    },
    setLoading: function (loading) {
      if (loading) {
        submitBtn.classList.add('loading');
      } else {
        submitBtn.classList.remove('loading');
      }
    },
  };
})();
