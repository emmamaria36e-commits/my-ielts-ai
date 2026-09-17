/* ========================================
   Closed Beta Access
   Stores a user-supplied invite for this browser
   tab and attaches it only to same-origin API calls.
   ======================================== */

(function () {
  'use strict';

  var STORAGE_KEY = 'my-ielts-ai-beta-invite';
  var INPUT_ID = 'betaInviteInput';
  var STATUS_ID = 'betaInviteStatus';
  var REQUIRED_MESSAGE = '请输入测试邀请码后再生成。';
  var INVALID_MESSAGE = '测试邀请码无效或已失效，请重新输入。';

  function getInput() {
    return window.document && window.document.getElementById
      ? window.document.getElementById(INPUT_ID)
      : null;
  }

  function getStatus() {
    return window.document && window.document.getElementById
      ? window.document.getElementById(STATUS_ID)
      : null;
  }

  function setStatus(message, isError) {
    var input = getInput();
    var status = getStatus();

    if (status) {
      status.textContent = message || '';
      if (status.classList) status.classList.toggle('is-error', Boolean(isError));
    }

    if (input) {
      input.setAttribute('aria-invalid', isError ? 'true' : 'false');
    }
  }

  function readInvite() {
    try {
      return (window.sessionStorage.getItem(STORAGE_KEY) || '').trim();
    } catch (error) {
      return '';
    }
  }

  function saveInvite(value) {
    try {
      window.sessionStorage.setItem(STORAGE_KEY, value);
    } catch (error) {
      // The invite remains available for the current request even when
      // browser storage is unavailable.
    }
  }

  function clearInvite() {
    try {
      window.sessionStorage.removeItem(STORAGE_KEY);
    } catch (error) {
      // Nothing else is required when browser storage is unavailable.
    }

    var input = getInput();
    if (input) input.value = '';
  }

  function getInvite() {
    var input = getInput();
    return input ? String(input.value || '').trim() : readInvite();
  }

  function requireInvite() {
    var invite = getInvite();
    var input = getInput();

    if (!invite) {
      clearInvite();
      setStatus(REQUIRED_MESSAGE, true);
      if (input && input.focus) input.focus();
      return '';
    }

    saveInvite(invite);
    setStatus('', false);
    return invite;
  }

  function requestWithInvite(url, options, invite) {
    var requestOptions = Object.assign({}, options || {});
    requestOptions.headers = Object.assign({}, requestOptions.headers || {}, {
      'X-Beta-Invite': invite,
    });

    return window.fetch(url, requestOptions).then(function (response) {
      if (response.status !== 403) return response;

      clearInvite();
      setStatus(INVALID_MESSAGE, true);
      var input = getInput();
      if (input && input.focus) input.focus();
      return response;
    });
  }

  function fetchWithInvite(url, options) {
    var invite = requireInvite();
    if (!invite) {
      return Promise.reject(Object.assign(new Error(REQUIRED_MESSAGE), {
        status: 403,
        code: 'BETA_INVITE_REQUIRED',
      }));
    }
    return requestWithInvite(url, options, invite);
  }

  function initialize() {
    var input = getInput();
    if (!input) return;

    var storedInvite = readInvite();
    if (storedInvite && !String(input.value || '').trim()) {
      input.value = storedInvite;
    }

    if (input.addEventListener) {
      input.addEventListener('input', function () {
        setStatus('', false);
        if (!String(input.value || '').trim()) clearInvite();
      });
    }
  }

  window.BetaAccess = {
    fetch: fetchWithInvite,
    requireInvite: requireInvite,
    clear: clearInvite,
  };

  initialize();
})();
