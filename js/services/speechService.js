/* ========================================
   Speech Service
   Requests synthesized audio from the trusted
   same-origin Node backend.
   ======================================== */

(function () {
  'use strict';

  function generate(text, voice) {
    return fetch('/api/speech', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text: text,
        voice: voice,
      }),
    }).then(function (response) {
      if (response.ok) {
        return response.blob();
      }

      return response.json()
        .catch(function () {
          return { error: { message: 'Server returned an unreadable speech response.' } };
        })
        .then(function (payload) {
          var message = payload && payload.error && payload.error.message
            ? payload.error.message
            : 'Speech generation failed.';
          throw new Error(message);
        });
    });
  }

  window.SpeechService = {
    generate: generate,
  };
})();
