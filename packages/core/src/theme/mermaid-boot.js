(function () {
  'use strict';

  function resolvedTheme() {
    var root = document.documentElement;
    var forced = root.getAttribute('data-theme');
    if (forced === 'dark' || forced === 'light') {
      return forced;
    }
    if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
      return 'dark';
    }
    return 'light';
  }

  function configure() {
    if (!window.mermaid) {
      return;
    }
    var dark = resolvedTheme() === 'dark';
    window.mermaid.initialize({
      startOnLoad: true,
      securityLevel: 'strict',
      theme: dark ? 'dark' : 'default',
    });
    var blocks = document.querySelectorAll('pre.mermaid');
    if (blocks.length === 0) {
      return;
    }
    window.mermaid.run({ nodes: blocks }).catch(function () {
      /* Source stays visible when rendering fails. */
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', configure);
  } else {
    configure();
  }

  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', configure);
  new MutationObserver(function () {
    configure();
  }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
})();
