/* ========================================
   AI Listening Generator — Interaction Logic
   ======================================== */

(function () {
  'use strict';

  /* ── DOM refs ── */
  const tagWrapper = document.getElementById('tagWrapper');
  const tagInput = document.getElementById('tagInput');
  const tagInputStatus = document.getElementById('tagInputStatus');
  const submitBtn = document.getElementById('generateBtn');
  const submitText = submitBtn?.querySelector('.generator__submit-text');
  const idleSubmitLabel = submitText ? submitText.textContent : '✨ 生成我的听力材料';

  /* ── State ── */
  const words = [];
  var activeAudioUrl = '';

  /* ========================================
     Tag Input
     ======================================== */

  function setTagInputStatus(message, type) {
    if (!tagInputStatus) return;
    tagInputStatus.textContent = message || '';
    tagInputStatus.classList.toggle('is-success', type === 'success');
    tagInputStatus.classList.toggle('is-error', type === 'error');
  }

  function reportWordResult(result) {
    if (result.overflow.length) {
      setTagInputStatus(
        '最多添加 20 个词条。本次已添加 ' + result.added.length +
        ' 个，另有 ' + result.overflow.length + ' 个未添加。',
        'error'
      );
      return;
    }

    if (result.invalid.length) {
      setTagInputStatus(
        '已添加 ' + result.added.length + ' 个词条，忽略 ' +
        result.invalid.length + ' 个无效词条。',
        'error'
      );
      return;
    }

    if (result.added.length > 1) {
      setTagInputStatus('已批量添加 ' + result.added.length + ' 个词条。', 'success');
      return;
    }

    if (!result.added.length && result.duplicates.length) {
      setTagInputStatus('这些词条已经添加过了。', '');
      return;
    }

    setTagInputStatus('', '');
  }

  /**
   * Add one or more target-word entries.
   * Commas, semicolons, line breaks, and tabs separate entries.
   * Spaces inside a phrase are preserved.
   */
  function addWords(raw, shouldFocus) {
    var result = window.IELTSWordParser.parse(raw, words);
    if (result.added.length) {
      Array.prototype.push.apply(words, result.added);
      renderTags();
    }
    tagInput.value = '';
    reportWordResult(result);
    if (shouldFocus !== false) tagInput.focus();
    return result;
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

  function clearElement(element) {
    while (element.firstChild) {
      element.removeChild(element.firstChild);
    }
  }

  /* ── Event: typing in the input ── */
  tagInput.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' || e.key === ',' || e.key === '，' ||
        e.key === ';' || e.key === '；') {
      e.preventDefault();
      addWords(tagInput.value);
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
      addWords(tagInput.value, false);
    }
  });

  tagInput.addEventListener('paste', function (e) {
    var pasted = e.clipboardData && e.clipboardData.getData('text');
    if (!pasted || !window.IELTSWordParser.hasSeparator(pasted)) return;

    e.preventDefault();
    var combined = tagInput.value
      ? tagInput.value + '\n' + pasted
      : pasted;
    addWords(combined);
  });

  // Handles punctuation entered through mobile keyboards or input methods.
  tagInput.addEventListener('input', function () {
    if (window.IELTSWordParser.hasSeparator(tagInput.value)) {
      addWords(tagInput.value);
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
     Section & Voice Selection — visual only
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

  function setGeneratingState(isGenerating) {
    if (!submitBtn) return;
    submitBtn.classList.toggle('loading', isGenerating);
    submitBtn.setAttribute('aria-busy', String(isGenerating));
    submitBtn.disabled = isGenerating || words.length === 0;
    if (submitText) {
      submitText.textContent = isGenerating
        ? '正在生成学习材料…'
        : idleSubmitLabel;
    }
  }

  // Initial state
  updateSubmitState();

  submitBtn.addEventListener('click', function () {
    if (words.length === 0 || submitBtn.classList.contains('loading')) return;

    // Collect selected IELTS section
    var sectionInput = document.querySelector('input[name="section"]:checked');
    var section = sectionInput ? sectionInput.value : 'section-1';

    // Collect the selected voice
    var voiceInput = document.querySelector('input[name="voice"]:checked');
    var voice = voiceInput ? voiceInput.value : 'british-female';
    var voices = [voice];

    // Show loading state
    setGeneratingState(true);
    setTagInputStatus('', '');

    // Call AI Service to generate passage
    window.AIService.generatePassage({
      words: words.slice(),
      section: section,
      voices: voices,
      difficulty: 'medium',
    })
      .then(function (result) {
        setGeneratingState(false);
        setTagInputStatus('', '');

        // Dispatch custom event with the result
        var event = new CustomEvent('generator:submit', {
          detail: {
            words: result.targetWords || words.slice(),
            section: section,
            voices: voices,
            passage: result.passage,
            title: result.title,
            metadata: result.metadata,
          },
        });

        document.dispatchEvent(event);
      })
      .catch(function (error) {
        setGeneratingState(false);
        console.error('[Generator] AI generation failed:', error);

        // Keep any previous successful result visible and avoid exposing
        // provider/validation details in the transcript area.
        setTagInputStatus('本次暂未生成成功，请再次点击 Generate。', 'error');
      });
  });

  /* ========================================
     Result Display — Mock data for demo
     ======================================== */

  // Passage generation: see js/services/mockProvider.js and js/services/apiProvider.js.
  // Lookup tables: use window.PromptBuilder.getVoiceMeta() / getSectionLabel().

  function buildHighlightRegex(words) {
    var patterns = words
      .filter(function (word) { return typeof word === 'string' && word.trim(); })
      .map(function (word) {
        return word.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      })
      .sort(function (a, b) { return b.length - a.length; });

    return patterns.length ? new RegExp('\\b(' + patterns.join('|') + ')\\b', 'gi') : null;
  }

  function appendHighlightedText(parent, text, regex) {
    if (!regex) {
      parent.appendChild(document.createTextNode(text));
      return;
    }

    regex.lastIndex = 0;
    var lastIndex = 0;
    var match;

    while ((match = regex.exec(text)) !== null) {
      parent.appendChild(document.createTextNode(text.slice(lastIndex, match.index)));

      var highlight = document.createElement('span');
      highlight.className = 'transcript__word-highlight';
      highlight.textContent = match[0];
      parent.appendChild(highlight);

      lastIndex = regex.lastIndex;
    }

    parent.appendChild(document.createTextNode(text.slice(lastIndex)));
  }

  function renderTranscript(container, passage, words) {
    clearElement(container);
    var regex = buildHighlightRegex(words);
    var paragraphs = String(passage || '').split(/\n+/).filter(function (paragraph) {
      return paragraph.trim();
    });

    paragraphs.forEach(function (paragraph) {
      var element = document.createElement('p');
      appendHighlightedText(element, paragraph, regex);
      container.appendChild(element);
    });
  }

  function renderTargetWords(container, words) {
    clearElement(container);

    var label = document.createElement('span');
    label.className = 'target-words__label';
    label.textContent = '🎯 目标词汇：';
    container.appendChild(label);

    words.forEach(function (word) {
      var item = document.createElement('span');
      item.className = 'target-words__word';

      var check = document.createElement('span');
      check.className = 'target-words__check';
      check.textContent = '✓';

      item.appendChild(check);
      item.appendChild(document.createTextNode(' ' + word));
      container.appendChild(item);
    });
  }

  document.addEventListener('generator:submit', function (e) {
    var data = e.detail;
    var resultSection = document.getElementById('resultSection');
    var transcriptText = document.getElementById('transcriptText');
    var targetWords = document.getElementById('targetWords');
    var voices = data.voices || ['british-female'];
    var meta = window.PromptBuilder
      ? window.PromptBuilder.getVoiceMeta(voices[0])
      : { flag: '🇬🇧', label: 'British Female' };

    // Use passage from AI service response
    var rawPassage = data.passage || '';
    var title = data.title || '';

    // Render untrusted passage as text and add trusted highlight elements.
    if (transcriptText) {
      renderTranscript(transcriptText, rawPassage, data.words || []);
    }

    // Update result title if we have one
    var resultTitle = document.getElementById('result-title');
    if (resultTitle && title) {
      resultTitle.textContent = title;
    } else if (resultTitle) {
      resultTitle.textContent = '你的听力材料';
    }

    // Build target words summary
    if (targetWords) {
      renderTargetWords(targetWords, data.words || []);
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

    // Generate and load real speech audio.
    initSpeechPlayer(rawPassage, voices[0]);
  });

  function setAudioStatus(message, isError) {
    var status = document.getElementById('audioStatus');
    if (!status) return;
    status.textContent = message || '';
    status.classList.toggle('is-error', Boolean(isError));
  }

  function initSpeechPlayer(text, voice) {
    var container = document.getElementById('audioPlayer');
    if (!container) return;

    // Destroy previous player instance if exists
    if (window._activePlayer) {
      window._activePlayer.destroy();
    }
    if (activeAudioUrl) {
      URL.revokeObjectURL(activeAudioUrl);
      activeAudioUrl = '';
    }

    var meta = window.PromptBuilder
      ? window.PromptBuilder.getVoiceMeta(voice)
      : { flag: '🇬🇧', label: 'British Female' };

    var player = window.IELTSPlayer.create(container, {
      voiceFlag: meta.flag,
      voiceLabel: meta.label,
    });

    window._activePlayer = player;
    setAudioStatus('正在生成语音…', false);
    var longSpeechTimer = window.setTimeout(function () {
      if (window._activePlayer !== player) return;
      setAudioStatus('长文本音频通常需要约 30–60 秒，请稍候…', false);
    }, 12000);

    window.SpeechService.generate(text, voice)
      .then(function (audioBlob) {
        window.clearTimeout(longSpeechTimer);
        if (window._activePlayer !== player) return;
        activeAudioUrl = URL.createObjectURL(audioBlob);
        player.load(activeAudioUrl);
        setAudioStatus('语音已生成，可以开始播放。', false);
      })
      .catch(function (error) {
        window.clearTimeout(longSpeechTimer);
        if (window._activePlayer !== player) return;
        console.error('[Generator] Speech generation failed:', error);
        setAudioStatus(
          error && error.message ? error.message : '语音生成失败，请稍后重试。',
          true
        );
      });
  }

  /* ========================================
     Public API (exposed on window for later use)
     ======================================== */

  window.IELTSGenerator = {
    getWords: function () { return words.slice(); },
    getSelectedSection: function () {
      var el = document.querySelector('input[name="section"]:checked');
      return el ? el.value : null;
    },
    getSelectedVoices: function () {
      var el = document.querySelector('input[name="voice"]:checked');
      return [el ? el.value : 'british-female'];
    },
    addWord: function (raw) { return addWords(raw); },
    addWords: addWords,
    clearWords: function () {
      words.length = 0;
      renderTags();
      setTagInputStatus('', '');
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
