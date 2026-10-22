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

  function storedSource(block) {
    return block.getAttribute('data-g-mermaid');
  }

  function restoreSource(block) {
    var stored = storedSource(block);
    if (stored === null) {
      block.setAttribute('data-g-mermaid', block.textContent);
      return;
    }
    block.textContent = stored;
    block.removeAttribute('data-processed');
  }

  function renderAll() {
    if (!window.mermaid) {
      return;
    }
    var dark = resolvedTheme() === 'dark';
    window.mermaid.initialize({
      startOnLoad: false,
      securityLevel: 'strict',
      theme: dark ? 'dark' : 'default',
    });
    var blocks = document.querySelectorAll('pre.mermaid');
    if (blocks.length === 0) {
      return;
    }
    for (var index = 0; index < blocks.length; index += 1) {
      restoreSource(blocks[index]);
    }
    window.mermaid.run({ nodes: blocks }).catch(function () {
      /* Source stays visible when rendering fails. */
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', renderAll);
  } else {
    renderAll();
  }

  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', renderAll);
  new MutationObserver(function () {
    renderAll();
  }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
})();
