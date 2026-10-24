/**
 * Todo view: filters by checkbox state (persistence is handled by render-bridge.js).
 */
(function () {
  'use strict';

  function ready(fn) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', fn);
    } else {
      fn();
    }
  }

  function isDone(task) {
    var box = task.querySelector('input[type="checkbox"]');
    return box !== null && box.checked;
  }

  ready(function () {
    var root = document.querySelector('.gaveta-render--todo');
    if (root === null) {
      return;
    }
    var toolbar = root.querySelector('.gaveta-todo-filters');
    if (toolbar === null) {
      return;
    }
    var tasks = Array.prototype.slice.call(root.querySelectorAll('li[data-g-task]'));

    function applyFilter(mode) {
      for (var i = 0; i < tasks.length; i++) {
        var task = tasks[i];
        var done = isDone(task);
        var show = mode === 'all' || (mode === 'open' && !done) || (mode === 'done' && done);
        if (show) {
          task.removeAttribute('hidden');
        } else {
          task.setAttribute('hidden', '');
        }
      }
      var buttons = toolbar.querySelectorAll('button[data-filter]');
      for (var b = 0; b < buttons.length; b++) {
        var button = buttons[b];
        var active = button.getAttribute('data-filter') === mode;
        button.setAttribute('aria-pressed', active ? 'true' : 'false');
      }
    }

    toolbar.addEventListener('click', function (event) {
      var target = event.target;
      if (target === null || typeof target.closest !== 'function') {
        return;
      }
      var button = target.closest('button[data-filter]');
      if (button === null) {
        return;
      }
      var mode = button.getAttribute('data-filter');
      if (mode === 'all' || mode === 'open' || mode === 'done') {
        applyFilter(mode);
      }
    });

    applyFilter('all');
  });
})();
