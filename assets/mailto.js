/**
 * CTA flow: clicking "Essayer le service" (and equivalent CTAs) opens an
 * in-page form to capture the listing URL and the visitor's email. Both are
 * validated on the front end; only when both pass does the mail composer open,
 * pre-filled so the visitor just clicks Send.
 */
(function () {
  const EMAIL = "contact.nguyen.fr@gmail.com";
  const SUBJECT = "Demande d'évaluation bien-evaluator";

  function mailtoBody(listingUrl, visitorEmail) {
    return [
      "Bonjour,",
      "",
      "Je souhaite tester le service bien-evaluator.",
      "",
      "URL de l'annonce qui m'intéresse :",
      listingUrl,
      "",
      "Mon email : " + visitorEmail,
      "",
      "Merci,",
    ].join("\n");
  }

  function mailtoHref(listingUrl, visitorEmail) {
    // Build the query manually: URLSearchParams encodes spaces as "+", which
    // mail clients render literally in a mailto: body (RFC 6068). encodeURIComponent
    // uses %20 so the subject and body read cleanly.
    const subject = encodeURIComponent(SUBJECT);
    const body = encodeURIComponent(mailtoBody(listingUrl, visitorEmail));
    return "mailto:" + EMAIL + "?subject=" + subject + "&body=" + body;
  }

  // --- Front-end validation -------------------------------------------------

  function isValidUrl(value) {
    let parsed;
    try {
      parsed = new URL(value);
    } catch (e) {
      return false;
    }
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  }

  // Pragmatic email check: a single @ with non-empty local part and a dotted domain.
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  function isValidEmail(value) {
    return EMAIL_RE.test(value);
  }

  // --- Modal construction ---------------------------------------------------

  const ctas = document.querySelectorAll("[data-mailto-cta]");
  if (!ctas.length) return;

  let lastFocused = null;

  const overlay = document.createElement("div");
  overlay.className = "url-modal";
  overlay.setAttribute("hidden", "");
  overlay.innerHTML = [
    '<div class="url-modal__backdrop" data-close></div>',
    '<div class="url-modal__dialog" role="dialog" aria-modal="true" aria-labelledby="url-modal-title">',
    '  <button type="button" class="url-modal__close" data-close aria-label="Fermer">&times;</button>',
    '  <h2 class="url-modal__title" id="url-modal-title">Évaluer mon annonce</h2>',
    '  <p class="url-modal__lede">Collez le lien de l’annonce et votre email. On vous répond avec le rapport.</p>',
    '  <form class="url-modal__form" novalidate>',
    '    <div class="url-modal__field">',
    '      <label for="url-modal-url">URL de l’annonce</label>',
    '      <input type="url" id="url-modal-url" name="url" inputmode="url" autocomplete="url"',
    '             placeholder="https://www.leboncoin.fr/..." aria-describedby="url-modal-url-error" />',
    '      <p class="url-modal__error" id="url-modal-url-error" role="alert" hidden></p>',
    "    </div>",
    '    <div class="url-modal__field">',
    '      <label for="url-modal-email">Votre email</label>',
    '      <input type="email" id="url-modal-email" name="email" inputmode="email" autocomplete="email"',
    '             placeholder="vous@exemple.fr" aria-describedby="url-modal-email-error" />',
    '      <p class="url-modal__error" id="url-modal-email-error" role="alert" hidden></p>',
    "    </div>",
    '    <button type="submit" class="btn btn--primary btn--lg url-modal__submit">Ouvrir l’email pré-rempli</button>',
    "  </form>",
    "</div>",
  ].join("");
  document.body.appendChild(overlay);

  const dialog = overlay.querySelector(".url-modal__dialog");
  const form = overlay.querySelector(".url-modal__form");
  const urlInput = overlay.querySelector("#url-modal-url");
  const emailInput = overlay.querySelector("#url-modal-email");
  const urlError = overlay.querySelector("#url-modal-url-error");
  const emailError = overlay.querySelector("#url-modal-email-error");

  function showError(input, errorEl, message) {
    errorEl.textContent = message;
    errorEl.removeAttribute("hidden");
    input.setAttribute("aria-invalid", "true");
  }

  function clearError(input, errorEl) {
    errorEl.textContent = "";
    errorEl.setAttribute("hidden", "");
    input.removeAttribute("aria-invalid");
  }

  function openModal() {
    lastFocused = document.activeElement;
    overlay.removeAttribute("hidden");
    document.body.classList.add("url-modal-open");
    // Defer focus until the element is visible.
    window.requestAnimationFrame(function () {
      urlInput.focus();
    });
  }

  function closeModal() {
    overlay.setAttribute("hidden", "");
    document.body.classList.remove("url-modal-open");
    if (lastFocused && typeof lastFocused.focus === "function") {
      lastFocused.focus();
    }
  }

  function isOpen() {
    return !overlay.hasAttribute("hidden");
  }

  // Wire CTAs: intercept the click and open the capture form instead of the
  // mail client. Keep them as anchors so they stay keyboard/SEO friendly.
  ctas.forEach(function (el) {
    el.setAttribute("href", "#essayer");
    el.addEventListener("click", function (e) {
      e.preventDefault();
      openModal();
    });
  });

  // Close interactions.
  overlay.querySelectorAll("[data-close]").forEach(function (el) {
    el.addEventListener("click", closeModal);
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && isOpen()) closeModal();
  });

  // Simple focus trap so Tab stays inside the dialog while open.
  dialog.addEventListener("keydown", function (e) {
    if (e.key !== "Tab") return;
    const focusable = dialog.querySelectorAll(
      'button, [href], input, [tabindex]:not([tabindex="-1"])'
    );
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  });

  // Clear an input's error as soon as the visitor edits it.
  urlInput.addEventListener("input", function () {
    clearError(urlInput, urlError);
  });
  emailInput.addEventListener("input", function () {
    clearError(emailInput, emailError);
  });

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    const url = urlInput.value.trim();
    const email = emailInput.value.trim();
    let ok = true;

    if (!url) {
      showError(urlInput, urlError, "Indiquez l’URL de l’annonce.");
      ok = false;
    } else if (!isValidUrl(url)) {
      showError(urlInput, urlError, "Ce lien n’est pas une URL valide (https://…).");
      ok = false;
    } else {
      clearError(urlInput, urlError);
    }

    if (!email) {
      showError(emailInput, emailError, "Indiquez votre email.");
      ok = false;
    } else if (!isValidEmail(email)) {
      showError(emailInput, emailError, "Cette adresse email n’est pas valide.");
      ok = false;
    } else {
      clearError(emailInput, emailError);
    }

    // On failure the composer does not open and the form keeps the input so
    // the visitor can correct it. Focus the first field in error.
    if (!ok) {
      if (urlInput.hasAttribute("aria-invalid")) urlInput.focus();
      else emailInput.focus();
      return;
    }

    window.location.href = mailtoHref(url, email);
    // The mail client opens in a separate app; close the modal so the visitor
    // returns to a clean page rather than a stale open form.
    closeModal();
  });
})();

/** Mobile burger navigation toggle. */
(function () {
  const toggle = document.querySelector(".nav-toggle");
  const nav = document.getElementById("site-nav");
  if (!toggle || !nav) return;

  function setOpen(open) {
    toggle.setAttribute("aria-expanded", String(open));
    if (open) {
      nav.setAttribute("data-open", "");
      toggle.setAttribute("aria-label", "Fermer le menu");
    } else {
      nav.removeAttribute("data-open");
      toggle.setAttribute("aria-label", "Ouvrir le menu");
    }
  }

  toggle.addEventListener("click", function () {
    setOpen(toggle.getAttribute("aria-expanded") !== "true");
  });

  // Close after choosing a destination.
  nav.querySelectorAll("a").forEach(function (link) {
    link.addEventListener("click", function () {
      setOpen(false);
    });
  });

  // Close on Escape.
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") setOpen(false);
  });

  // Close when clicking outside the header.
  document.addEventListener("click", function (e) {
    if (toggle.getAttribute("aria-expanded") !== "true") return;
    if (!e.target.closest(".site-header")) setOpen(false);
  });
})();