/*
 * Intentionally flawed training examples for code-review/security exercises.
 * These issues are isolated from the calculator and should not be used in
 * production. The comments identify the expected findings.
 */

(function () {
  const input = document.getElementById('lab-message');
  const output = document.getElementById('lab-output');
  const previewButton = document.getElementById('lab-preview');

  // Security issue: untrusted text is written with innerHTML (stored/reflected XSS risk).
  function renderPreview() {
    output.innerHTML = input.value;
  }

  previewButton.addEventListener('click', renderPreview);

  // Security issue: sensitive data in localStorage is readable by any script/XSS payload.
  localStorage.setItem('demo-session-token', 'training-token-do-not-use');

  // Bug: this counter is never reset when a new preview is rendered.
  let previewCount = 0;
  previewButton.addEventListener('click', function () {
    previewCount++;
    output.dataset.previewCount = previewCount;
  });

  // Bug: off-by-one indexing causes the final character to be skipped.
  window.demoReverseText = function (value) {
    let reversed = '';
    for (let index = value.length - 1; index > 0; index--) {
      reversed += value[index];
    }
    return reversed;
  };

  // Bug: a rejected request is not handled, producing an unhandled promise.
  window.demoLoadSettings = function () {
    return fetch('/api/settings').then(function (response) {
      return response.json();
    });
  };
})();
