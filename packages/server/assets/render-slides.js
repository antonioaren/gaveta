/**
 * Slides view: thumbnails, presentation overlay, keyboard navigation.
 * Runs inside sandbox="allow-scripts" (opaque origin); no network.
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

  function slides(root) {
    return Array.prototype.slice.call(root.querySelectorAll('section.slide'));
  }

  function slideId(section, index) {
    var id = section.getAttribute('id');
    if (id !== null && id.trim().length > 0) {
      return id.trim();
    }
    return 'slide-' + String(index + 1);
  }

  function labelFor(section) {
    var heading = section.querySelector('h1, h2, h3');
    if (heading !== null) {
      var text = heading.textContent;
      if (text !== null && text.trim().length > 0) {
        return text.trim();
      }
    }
    return section.getAttribute('id') || 'Diapositiva';
  }

  function ensureIds(deckSections) {
    for (var i = 0; i < deckSections.length; i++) {
      var section = deckSections[i];
      if (section.getAttribute('id') === null || section.getAttribute('id').trim().length === 0) {
        section.setAttribute('id', 'slide-' + String(i + 1));
      }
    }
  }

  ready(function () {
    var root = document.querySelector('.gaveta-render--slides');
    if (root === null) {
      return;
    }
    var deck = root.querySelector('.gaveta-slides-deck');
    if (deck === null) {
      return;
    }
    var deckSections = slides(deck);
    if (deckSections.length === 0) {
      return;
    }
    ensureIds(deckSections);

    var thumbNav = root.querySelector('.gaveta-slide-thumbs');
    if (thumbNav !== null && thumbNav.children.length === 0) {
      for (var t = 0; t < deckSections.length; t++) {
        var sec = deckSections[t];
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'gaveta-slide-thumb';
        btn.setAttribute('data-gaveta-slide-thumb', slideId(sec, t));
        btn.setAttribute('aria-label', 'Diapositiva ' + String(t + 1) + ': ' + labelFor(sec));
        var span = document.createElement('span');
        span.className = 'gaveta-slide-thumb__label';
        span.textContent = labelFor(sec);
        btn.appendChild(span);
        thumbNav.appendChild(btn);
      }
    }

    var current = 0;
    var presenting = false;

    function sectionById(id) {
      return document.getElementById(id);
    }

    function goTo(index) {
      if (deckSections.length === 0) {
        return;
      }
      current = Math.max(0, Math.min(deckSections.length - 1, index));
      var targetId = slideId(deckSections[current], current);
      var target = sectionById(targetId);
      if (target !== null) {
        target.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
      syncThumbs();
      if (presenting) {
        syncPresentation();
      }
    }

    function syncThumbs() {
      var buttons = root.querySelectorAll('[data-gaveta-slide-thumb]');
      for (var i = 0; i < buttons.length; i++) {
        var button = buttons[i];
        var sid = button.getAttribute('data-gaveta-slide-thumb');
        var active = sid === slideId(deckSections[current], current);
        button.setAttribute('aria-current', active ? 'true' : 'false');
      }
    }

    function syncPresentation() {
      for (var i = 0; i < deckSections.length; i++) {
        var section = deckSections[i];
        if (i === current) {
          section.setAttribute('data-gaveta-slide-active', 'true');
        } else {
          section.removeAttribute('data-gaveta-slide-active');
        }
      }
    }

    function enterPresentation() {
      presenting = true;
      document.documentElement.classList.add('gaveta-presenting');
      syncPresentation();
      var live = document.getElementById('gaveta-slide-live');
      if (live !== null) {
        live.textContent =
          'Modo presentación. Diapositiva ' +
          String(current + 1) +
          ' de ' +
          String(deckSections.length);
      }
    }

    function exitPresentation() {
      presenting = false;
      document.documentElement.classList.remove('gaveta-presenting');
      for (var i = 0; i < deckSections.length; i++) {
        deckSections[i].removeAttribute('data-gaveta-slide-active');
      }
    }

    root.addEventListener('click', function (event) {
      var target = event.target;
      if (target === null || typeof target.closest !== 'function') {
        return;
      }
      var thumb = target.closest('[data-gaveta-slide-thumb]');
      if (thumb !== null) {
        var id = thumb.getAttribute('data-gaveta-slide-thumb');
        if (id !== null) {
          for (var j = 0; j < deckSections.length; j++) {
            if (slideId(deckSections[j], j) === id) {
              goTo(j);
              break;
            }
          }
        }
        return;
      }
      var present = target.closest('[data-gaveta-action="present"]');
      if (present !== null) {
        enterPresentation();
      }
    });

    document.addEventListener('keydown', function (event) {
      if (!presenting && event.key !== 'f' && event.key !== 'F') {
        return;
      }
      if (event.key === 'ArrowRight' || event.key === 'PageDown' || event.key === ' ') {
        event.preventDefault();
        if (!presenting) {
          enterPresentation();
        }
        goTo(current + 1);
        return;
      }
      if (event.key === 'ArrowLeft' || event.key === 'PageUp') {
        event.preventDefault();
        goTo(current - 1);
        return;
      }
      if (event.key === 'Home') {
        event.preventDefault();
        goTo(0);
        return;
      }
      if (event.key === 'End') {
        event.preventDefault();
        goTo(deckSections.length - 1);
        return;
      }
      if (event.key === 'Escape') {
        if (presenting) {
          event.preventDefault();
          exitPresentation();
        }
        return;
      }
      if (event.key === 'f' || event.key === 'F') {
        var presentBtn = root.querySelector('[data-gaveta-action="present"]');
        if (presentBtn !== null && !presenting) {
          event.preventDefault();
          enterPresentation();
        }
      }
    });

    syncThumbs();
  });
})();
