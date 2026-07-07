/* ========================================
   Audio Player — Custom controls for <audio>
   ======================================== */

(function () {
  'use strict';

  /**
   * Create an audio player instance bound to a container.
   *
   * Usage:
   *   var player = window.IELTSPlayer.create(containerEl, {
   *     voiceLabel: 'British Female',
   *     voiceFlag:  '🇬🇧',
   *   });
   *   player.load('https://example.com/audio.mp3');
   */
  function createPlayer(container, options) {
    var opts = options || {};
    var audio = null;
    var isPlaying = false;
    var duration = 0;
    var currentSpeed = 1.0;

    /* ── Cache DOM elements ── */
    var playBtn = container.querySelector('.audio-player__play');
    var playIcon = container.querySelector('.audio-player__play-icon');
    var progressBar = container.querySelector('.audio-player__progress-bar');
    var progressFill = container.querySelector('.audio-player__progress-fill');
    var progressThumb = container.querySelector('.audio-player__progress-thumb');
    var timeCurrent = container.querySelector('.audio-player__time-current');
    var timeDuration = container.querySelector('.audio-player__time-duration');
    var volumeSlider = container.querySelector('.audio-player__volume-slider');
    var volumeBtn = container.querySelector('.audio-player__volume-btn');
    var skipBackBtn = container.querySelector('.audio-player__skip-back');
    var skipFwdBtn = container.querySelector('.audio-player__skip-fwd');
    var speedBtns = container.querySelectorAll('.audio-player__speed-btn');
    var voiceLabel = container.querySelector('.audio-player__voice-label');
    var voiceFlag = container.querySelector('.audio-player__voice-flag');

    /* ── Set voice info ── */
    if (voiceFlag && opts.voiceFlag) voiceFlag.textContent = opts.voiceFlag;
    if (voiceLabel && opts.voiceLabel) voiceLabel.textContent = opts.voiceLabel;

    /* ── Create audio element ── */
    audio = document.createElement('audio');
    audio.preload = 'metadata';

    /* ========================================
       Format time as mm:ss
       ======================================== */
    function formatTime(seconds) {
      if (isNaN(seconds) || !isFinite(seconds)) return '00:00';
      var m = Math.floor(seconds / 60);
      var s = Math.floor(seconds % 60);
      return (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
    }

    /* ========================================
       Update progress bar position
       ======================================== */
    function updateProgress() {
      if (!audio || !duration) return;
      var pct = (audio.currentTime / duration) * 100;
      if (progressFill) progressFill.style.width = pct + '%';
      if (progressThumb) progressThumb.style.left = pct + '%';
      if (timeCurrent) timeCurrent.textContent = formatTime(audio.currentTime);
    }

    /* ========================================
       Play / Pause toggle
       ======================================== */
    function togglePlay() {
      if (!audio) return;

      if (isPlaying) {
        audio.pause();
      } else {
        var promise = audio.play();
        if (promise && promise.catch) {
          promise.catch(function (err) {
            console.warn('Audio playback failed:', err);
            setPlayingState(false);
          });
        }
      }
    }

    function setPlayingState(playing) {
      isPlaying = playing;
      if (playIcon) {
        playIcon.textContent = playing ? '⏸' : '▶';
      }
    }

    /* ========================================
       Seek
       ======================================== */
    function seekTo(event) {
      if (!audio || !duration || !progressBar) return;

      var rect = progressBar.getBoundingClientRect();
      var pct = (event.clientX - rect.left) / rect.width;
      pct = Math.max(0, Math.min(1, pct));
      audio.currentTime = pct * duration;
      updateProgress();
    }

    /* ========================================
       Volume
       ======================================== */
    function setVolume(value) {
      if (!audio) return;
      audio.volume = Math.max(0, Math.min(1, value));
      if (volumeSlider) volumeSlider.value = audio.volume;
      updateVolumeIcon();
    }

    function updateVolumeIcon() {
      if (!audio || !volumeBtn) return;
      var v = audio.volume;
      var icon = v === 0 ? '🔇' : v < 0.5 ? '🔉' : '🔊';
      volumeBtn.textContent = icon;
    }

    function toggleMute() {
      if (!audio) return;
      if (audio.volume > 0) {
        // Store current volume as data attribute
        audio.dataset.prevVolume = audio.volume;
        setVolume(0);
      } else {
        var prev = parseFloat(audio.dataset.prevVolume) || 0.8;
        setVolume(prev);
      }
    }

    /* ========================================
       Skip
       ======================================== */
    function skip(seconds) {
      if (!audio) return;
      audio.currentTime = Math.max(0, Math.min(duration, audio.currentTime + seconds));
      updateProgress();
    }

    /* ========================================
       Speed
       ======================================== */
    function setSpeed(speed) {
      if (!audio) return;
      currentSpeed = speed;
      audio.playbackRate = speed;

      speedBtns.forEach(function (btn) {
        var btnSpeed = parseFloat(btn.getAttribute('data-speed'));
        if (btnSpeed === speed) {
          btn.classList.add('active');
        } else {
          btn.classList.remove('active');
        }
      });
    }

    /* ========================================
       Load audio source
       ======================================== */
    function load(src) {
      if (!audio) return;
      setPlayingState(false);
      duration = 0;
      if (progressFill) progressFill.style.width = '0%';
      if (progressThumb) progressThumb.style.left = '0%';
      if (timeCurrent) timeCurrent.textContent = '00:00';
      if (timeDuration) timeDuration.textContent = '00:00';

      audio.src = src;
      audio.load();
    }

    /* ========================================
       Event listeners
       ======================================== */

    if (playBtn) {
      playBtn.addEventListener('click', togglePlay);
    }

    // Audio element events
    audio.addEventListener('loadedmetadata', function () {
      duration = audio.duration;
      if (timeDuration) timeDuration.textContent = formatTime(duration);
    });

    audio.addEventListener('timeupdate', updateProgress);

    audio.addEventListener('play', function () {
      setPlayingState(true);
    });

    audio.addEventListener('pause', function () {
      setPlayingState(false);
    });

    audio.addEventListener('ended', function () {
      setPlayingState(false);
      audio.currentTime = 0;
      updateProgress();
    });

    audio.addEventListener('error', function () {
      console.warn('Audio failed to load:', audio.error);
      setPlayingState(false);
    });

    // Progress bar click/drag
    if (progressBar) {
      var dragging = false;

      progressBar.addEventListener('mousedown', function (e) {
        dragging = true;
        seekTo(e);
      });

      document.addEventListener('mousemove', function (e) {
        if (dragging) seekTo(e);
      });

      document.addEventListener('mouseup', function () {
        dragging = false;
      });
    }

    // Volume slider
    if (volumeSlider) {
      volumeSlider.addEventListener('input', function () {
        setVolume(parseFloat(volumeSlider.value));
      });
    }

    if (volumeBtn) {
      volumeBtn.addEventListener('click', toggleMute);
    }

    // Skip buttons
    if (skipBackBtn) {
      skipBackBtn.addEventListener('click', function () { skip(-15); });
    }
    if (skipFwdBtn) {
      skipFwdBtn.addEventListener('click', function () { skip(15); });
    }

    // Speed buttons
    speedBtns.forEach(function (btn) {
      btn.addEventListener('click', function () {
        var speed = parseFloat(btn.getAttribute('data-speed'));
        setSpeed(speed);
      });
    });

    // Keyboard shortcuts
    document.addEventListener('keydown', function (e) {
      // Only if the result section is visible
      var resultSection = document.getElementById('resultSection');
      if (!resultSection || !resultSection.classList.contains('visible')) return;

      // Ignore if typing in an input
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

      switch (e.code) {
        case 'Space':
          e.preventDefault();
          togglePlay();
          break;
        case 'ArrowLeft':
          e.preventDefault();
          skip(-5);
          break;
        case 'ArrowRight':
          e.preventDefault();
          skip(5);
          break;
      }
    });

    /* ========================================
       Public API
       ======================================== */
    return {
      load: load,
      play: function () { if (audio && !isPlaying) togglePlay(); },
      pause: function () { if (audio && isPlaying) togglePlay(); },
      toggle: togglePlay,
      seekTo: seekTo,
      setVolume: setVolume,
      setSpeed: setSpeed,
      getAudio: function () { return audio; },
      getDuration: function () { return duration; },
      isPlaying: function () { return isPlaying; },
      destroy: function () {
        if (audio) {
          audio.pause();
          audio.src = '';
          audio = null;
        }
      },
    };
  }

  /* ── Expose ── */
  window.IELTSPlayer = {
    create: createPlayer,
  };
})();
