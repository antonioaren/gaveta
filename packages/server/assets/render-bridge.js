/**
 * Navigation bridge for sandboxed render iframes (opaque origin; postMessage targetOrigin '*').
 * Parent shell MUST verify event.source === iframe.contentWindow and validate payloads with
 * parseGavetaNavigateMessage from @gaveta/core before navigating.
 */
(function () {
  'use strict';

  document.addEventListener(
    'click',
    function (event) {
      var target = event.target;
      if (target === null || typeof target.closest !== 'function') {
        return;
      }
      var anchor = target.closest('a[data-g-to], a[data-g-pending]');
      if (anchor === null) {
        return;
      }
      var explicit = anchor.getAttribute('href');
      if (explicit !== null && explicit.trim().length > 0) {
        return;
      }
      var ref = anchor.getAttribute('data-g-to') || anchor.getAttribute('data-g-pending');
      if (ref === null || ref.trim().length === 0) {
        return;
      }
      event.preventDefault();
      if (window.parent !== window) {
        window.parent.postMessage({ type: 'gaveta:navigate', ref: ref.trim() }, '*');
      }
    },
    true,
  );
})();
