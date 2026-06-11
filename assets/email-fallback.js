// Email fallback module — sends URL to contact when meta-server is unavailable
(function () {
  'use strict';

  var DEFAULT_TO = 'contact.nguyen.fr@gmail.com';
  var STORAGE_KEY = 'immo_evals_pending';

  // --- Mailto-based fallback (no external dependency) ---

  function buildMailtoUrl(url, toAddr) {
    var to = toAddr || DEFAULT_TO;
    var subject = encodeURIComponent('Demande d\'évaluation immobilière');
    var body = encodeURIComponent(
      'Bonjour,\n\n' +
      'Je souhaite faire évaluer l\'annonce suivante :\n\n' +
      url + '\n\n' +
      'Merci d\'avance pour votre analyse.'
    );
    return 'mailto:' + to + '?subject=' + subject + '&body=' + body;
  }

  // --- Pending queue (localStorage) ---

  function getPending() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
    } catch (_) {
      return [];
    }
  }

  function savePending(queue) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(queue));
    } catch (_) {
      // localStorage full or unavailable — silently fail
    }
  }

  function addPending(url) {
    var queue = getPending();
    // Avoid duplicates
    if (queue.some(function (item) { return item.url === url && item.status === 'pending'; })) {
      return;
    }
    queue.push({
      url: url,
      addedAt: new Date().toISOString(),
      status: 'pending'
    });
    savePending(queue);
  }

  function removePending(url) {
    var queue = getPending().filter(function (item) { return item.url !== url; });
    savePending(queue);
  }

  function getPendingCount() {
    return getPending().filter(function (item) { return item.status === 'pending'; }).length;
  }

  function clearPending() {
    savePending([]);
  }

  // --- Public API ---

  window.EmailFallback = {
    /**
     * Send URL via email fallback.
     * Opens mailto: with pre-filled subject and body.
     * Also stores the URL in localStorage pending queue.
     *
     * @param {string} url - The property listing URL to evaluate
     * @param {object} [options]
     * @param {string} [options.to] - Recipient email (default: contact.nguyen.fr@gmail.com)
     * @param {boolean} [options.noQueue=false] - Skip localStorage queue
     * @returns {{ mailtoUrl: string }} - The generated mailto URL
     */
    send: function (url, options) {
      options = options || {};

      if (!options.noQueue) {
        addPending(url);
      }

      var mailtoUrl = buildMailtoUrl(url, options.to || window.FALLBACK_EMAIL_TO || DEFAULT_TO);
      window.location.href = mailtoUrl;

      return { mailtoUrl: mailtoUrl };
    },

    /**
     * Get the count of pending (unsent) fallback requests.
     * @returns {number}
     */
    getPendingCount: getPendingCount,

    /**
     * Get all pending fallback requests.
     * @returns {Array<{url: string, addedAt: string, status: string}>}
     */
    getPending: getPending,

    /**
     * Mark a pending URL as sent (remove from queue).
     * @param {string} url
     */
    markSent: removePending,

    /**
     * Clear all pending requests.
     */
    clearPending: clearPending,

    /**
     * Build a mailto URL without opening it.
     * @param {string} url
     * @returns {string}
     */
    buildMailtoUrl: function (url) {
      return buildMailtoUrl(url, window.FALLBACK_EMAIL_TO || DEFAULT_TO);
    },

    /**
     * Default recipient address.
     */
    DEFAULT_TO: DEFAULT_TO
  };
})();
