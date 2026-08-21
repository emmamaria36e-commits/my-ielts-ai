/* ========================================
   Closed Beta Access
   Stores a user-supplied invite for this browser
   tab and attaches it only to same-origin API calls.
   ======================================== */

(function () {
  'use strict';

  var STORAGE_KEY = 'my-ielts-ai-beta-invite';
  var INVALID_MESSAGE = '测试邀请码无效或已失效，请重新输入。';

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
  }

  function requestInvite() {
    var value = window.prompt('请输入测试邀请码：');
    var invite = typeof value === 'string' ? value.trim() : '';
    if (invite) saveInvite(invite);
    return invite;
  }

  function getInvite() {
    return readInvite() || requestInvite();
  }

  function requestWithInvite(url, options, invite, hasRetried) {
    var requestOptions = Object.assign({}, options || {});
    requestOptions.headers = Object.assign({}, requestOptions.headers || {}, {
      'X-Beta-Invite': invite,
    });

    return window.fetch(url, requestOptions).then(function (response) {
      if (response.status !== 403) return response;

      clearInvite();
      window.alert(INVALID_MESSAGE);
      if (hasRetried) return response;

      var replacement = requestInvite();
      return replacement
        ? requestWithInvite(url, options, replacement, true)
        : response;
    });
  }

  function fetchWithInvite(url, options) {
    var invite = getInvite();
    if (!invite) {
      return Promise.reject(Object.assign(new Error(INVALID_MESSAGE), { status: 403 }));
    }
    return requestWithInvite(url, options, invite, false);
  }

  window.BetaAccess = {
    fetch: fetchWithInvite,
    clear: clearInvite,
  };
})();
