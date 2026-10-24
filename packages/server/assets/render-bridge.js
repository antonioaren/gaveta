/**
 * Navigation and task bridge for sandboxed render iframes (opaque origin; postMessage '*').
 * Parent shell MUST verify event.source === iframe.contentWindow and validate payloads with
 * parseGavetaNavigateMessage / parseGavetaTaskToggleMessage from @gaveta/core before acting.
 */
(function () {
  'use strict';

  function findTaskItem(node) {
    if (node === null || typeof node.closest !== 'function') {
      return null;
    }
    var li = node.closest('li[data-g-task]');
    if (li === null) {
      return null;
    }
    var id = li.getAttribute('id');
    if (id === null || id.trim().length === 0) {
      return null;
    }
    return { li: li, taskId: id.trim() };
  }

  window.addEventListener('message', function (event) {
    var data = event.data;
    if (data === null || typeof data !== 'object') {
      return;
    }
    if (data.type !== 'gaveta:task-checked') {
      return;
    }
    var taskId = data.taskId;
    var checked = data.checked;
    if (typeof taskId !== 'string' || typeof checked !== 'boolean') {
      return;
    }
    var tasks = document.querySelectorAll('li[data-g-task]');
    for (var i = 0; i < tasks.length; i++) {
      var li = tasks[i];
      if (li.getAttribute('id') === taskId.trim()) {
        var box = li.querySelector('input[type="checkbox"]');
        if (box !== null) {
          box.checked = checked;
        }
        break;
      }
    }
  });

  document.addEventListener(
    'change',
    function (event) {
      var target = event.target;
      if (
        target === null ||
        target.tagName !== 'INPUT' ||
        target.getAttribute('type') !== 'checkbox'
      ) {
        return;
      }
      var task = findTaskItem(target);
      if (task === null) {
        return;
      }
      if (window.parent !== window) {
        window.parent.postMessage(
          {
            type: 'gaveta:task-toggle',
            taskId: task.taskId,
            checked: target.checked,
          },
          '*',
        );
      }
    },
    true,
  );

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
      if (explicit !== null) {
        var trimmedHref = explicit.trim();
        if (trimmedHref.length > 0 && trimmedHref !== '#') {
          return;
        }
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
