/**
 * Direct evaluation flow — the service-UI half of the meta-app report
 * workflow (issue #77, meta-app/dev-docs/report-workflow.md §5–§6).
 *
 * On submit: validate email and listing URL client-side, generate a unique
 * report_id (publish-path token, grammar ^[a-z0-9][a-z0-9-]{2,62}[a-z0-9]$),
 * show the visitor the full stable report URL immediately, then POST the
 * submission to meta-app and poll the job status until done/failed. A 409
 * collision regenerates the id once and resubmits automatically; every other
 * rejection renders the server's safe `detail` verbatim (§4.2 error map).
 */
(function () {
  "use strict";

  var cfg = window.IMMO_EVALS_CONFIG || {};
  var SERVICE_ID = cfg.serviceId || "bien-evaluator";
  var PAGES_BASE = (cfg.pagesBaseUrl || "").replace(/\/+$/, "");

  // --- meta-app origin: ?api=… override > localStorage > config default ----
  // Persistence is restricted to localhost/127.x to prevent phishing via
  // shared links that would redirect PII (email) to attacker-controlled hosts.
  function isLocalOrigin(url) {
    try {
      var h = new URL(url).hostname;
      return h === "localhost" || h === "127.0.0.1" || h.startsWith("127.");
    } catch (e) { return false; }
  }

  function apiBase() {
    try {
      var param = new URLSearchParams(window.location.search).get("api");
      if (param === "reset") {
        window.localStorage.removeItem("immoEvalsApiBase");
      } else if (param && isLocalOrigin(param)) {
        window.localStorage.setItem("immoEvalsApiBase", param);
      }
      var stored = window.localStorage.getItem("immoEvalsApiBase");
      return (param && param !== "reset" && isLocalOrigin(param)
        ? param
        : stored || cfg.apiBase || "")
        .replace(/\/+$/, "");
    } catch (e) {
      return (cfg.apiBase || "").replace(/\/+$/, "");
    }
  }

  // --- report_id generation (workflow doc §3.1 recommended scheme) ---------
  function generateReportId() {
    var now = new Date();
    var stamp =
      now.getFullYear() +
      String(now.getMonth() + 1).padStart(2, "0") +
      String(now.getDate()).padStart(2, "0");
    var alphabet = "abcdefghijklmnopqrstuvwxyz0123456789";
    var bytes = new Uint8Array(8);
    (window.crypto || window.msCrypto).getRandomValues(bytes);
    var suffix = "";
    for (var i = 0; i < bytes.length; i++) {
      suffix += alphabet[bytes[i] % alphabet.length];
    }
    return "rpt-" + stamp + "-" + suffix;
  }

  function reportUrlFor(reportId) {
    return PAGES_BASE + "/reports/" + reportId + "/";
  }

  function isValidUrl(value) {
    var parsed;
    try {
      parsed = new URL(value);
    } catch (e) {
      return false;
    }
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  }

  // RFC-practical email validation: must have local@domain.tld
  function isValidEmail(value) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
  }

  // --- Status panel ---------------------------------------------------------
  var panel = document.querySelector("[data-eval-status]");
  if (!panel) return;

  function esc(s) {
    return String(s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;")
      .replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  function renderPanel(state) {
    // state: {phase, reportUrl, message, detail}
    var rows = [];
    rows.push('<div class="eval-status__head">');
    if (state.phase === "error") {
      rows.push('<span class="eval-status__badge eval-status__badge--error">Erreur</span>');
    } else if (state.phase === "failed") {
      rows.push('<span class="eval-status__badge eval-status__badge--error">Échec</span>');
    } else if (state.phase === "live") {
      rows.push('<span class="eval-status__badge eval-status__badge--live">Rapport en ligne</span>');
    } else if (state.phase === "done") {
      rows.push('<span class="eval-status__badge eval-status__badge--done">Analyse terminée</span>');
    } else if (state.phase === "fallback") {
      rows.push('<span class="eval-status__badge eval-status__badge--info">Email envoyé</span>');
    } else {
      rows.push('<span class="eval-status__badge eval-status__badge--pending"><span class="eval-status__spin" aria-hidden="true"></span>' + esc(state.badge) + "</span>");
    }
    rows.push("</div>");
    if (state.message) {
      rows.push('<p class="eval-status__msg">' + esc(state.message) + "</p>");
    }
    if (state.detail) {
      rows.push('<p class="eval-status__detail" role="alert"></p>');
    }
    if (state.reportUrl) {
      rows.push('<div class="eval-status__urlrow">');
      rows.push('<a class="eval-status__url" href="' + esc(state.reportUrl) + '" target="_blank" rel="noopener">' + esc(state.reportUrl) + "</a>");
      rows.push('<button type="button" class="btn btn--ghost eval-status__copy" data-copy-url>Copier</button>');
      rows.push("</div>");
      rows.push('<p class="eval-status__note">Ce lien est définitif : gardez-le, il affichera le rapport dès qu\'il sera prêt.</p>');
    }
    var wasHidden = panel.hasAttribute("hidden");
    panel.innerHTML = rows.join("");
    panel.removeAttribute("hidden");
    if (state.detail) {
      // textContent: the server detail is rendered verbatim but never as HTML.
      panel.querySelector(".eval-status__detail").textContent = state.detail;
    }
    var copy = panel.querySelector("[data-copy-url]");
    if (copy) {
      copy.addEventListener("click", function () {
        if (navigator.clipboard) {
          navigator.clipboard.writeText(state.reportUrl).then(function () {
            copy.textContent = "Copié !";
            setTimeout(function () { copy.textContent = "Copier"; }, 2000);
          }).catch(function () { copy.textContent = "Copier"; });
        }
      });
    }
    if (wasHidden) {
      panel.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }

  // --- §4.2 error map: status → what the visitor must see -------------------
  function errorStateFor(status, detail) {
    if (status === 404) {
      return { phase: "error", message: "Ce service est indisponible pour le moment.", detail: "" };
    }
    if (status === 409) {
      return { phase: "error", message: "Ce rapport a déjà été soumis. Vérifiez vos emails ou soumettez l'annonce à nouveau.", detail: "" };
    }
    if (status === 503) {
      return {
        phase: "fallback",
        message: "Le serveur d'analyse est temporairement indisponible. Un email va être envoyé avec votre lien.",
        detail: detail,
      };
    }
    if (status === 413 || status === 415 || status === 422) {
      return { phase: "error", message: "Votre demande n'a pas pu être acceptée :", detail: detail, reportUrl: "" };
    }
    return {
      phase: "error",
      message: "Impossible de contacter le serveur d'analyse. Vérifiez votre connexion et réessayez.",
      detail: detail,
    };
  }

  // --- Submission + polling --------------------------------------------------
  var polling = null;
  var submitting = false;

  function pollStatus(statusUrl, reportUrl) {
    var base = apiBase();
    var started = Date.now();
    var MAX_MS = 20 * 60 * 1000;
    clearInterval(polling);
    polling = setInterval(function () {
      if (Date.now() - started > MAX_MS) {
        clearInterval(polling);
        submitting = false;
        setSubmitBusy(false);
        renderPanel({
          phase: "error",
          message: "L'analyse prend plus de temps que prévu. Gardez le lien du rapport et revérifiez plus tard.",
          reportUrl: reportUrl,
        });
        return;
      }
      fetch(new URL(statusUrl, base + "/"), { cache: "no-store" })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (body) {
          if (!body) return;
          if (body.status === "done") {
            clearInterval(polling);
            renderPanel({
              phase: "done",
              message: "Votre rapport est prêt. Il sera en ligne à l'adresse ci-dessous d'ici une à deux minutes (déploiement).",
              reportUrl: reportUrl,
            });
            waitForLive(reportUrl);
          } else if (body.status === "failed") {
            clearInterval(polling);
            submitting = false;
            setSubmitBusy(false);
            renderPanel({
              phase: "failed",
              message: "L'analyse n'a pas abouti. Aucun rapport ne sera publié pour ce lien — vous pouvez soumettre l'annonce à nouveau.",
            });
          } else if (body.status === "running") {
            renderPanel({
              phase: "pending",
              badge: "Analyse en cours…",
              message: "Le modèle analyse l'annonce (quelques minutes).",
              reportUrl: reportUrl,
            });
          }
        })
        .catch(function () { /* transient — next tick retries */ });
    }, 3000);
  }

  function waitForLive(reportUrl) {
    var started = Date.now();
    var MAX_MS = 10 * 60 * 1000;
    var timer = setInterval(function () {
      if (Date.now() - started > MAX_MS) { clearInterval(timer); submitting = false; setSubmitBusy(false); return; }
      fetch(reportUrl, { cache: "no-store" })
        .then(function (r) {
          if (r.ok) {
            clearInterval(timer);
            submitting = false;
            setSubmitBusy(false);
            renderPanel({
              phase: "live",
              message: "Votre rapport est en ligne :",
              reportUrl: reportUrl,
            });
          }
        })
        .catch(function () { /* Pages not deployed yet */ });
    }, 15000);
  }

  var submitBtn = null;

  function setSubmitBusy(busy) {
    if (!submitBtn) {
      submitBtn = formEl ? formEl.querySelector('[type=submit]') : null;
    }
    if (submitBtn) {
      submitBtn.disabled = busy;
      submitBtn.textContent = busy ? "Envoi en cours…" : "Évaluer mon annonce";
    }
  }

  function submit(email, listingUrl, reportId, catalogListed, isRetry) {
    if (submitting) return;
    submitting = true;
    setSubmitBusy(true);

    var base = apiBase();
    var reportUrl = reportUrlFor(reportId);

    renderPanel({
      phase: "pending",
      badge: "Envoi…",
      message: "Votre demande part vers le serveur d'analyse.",
      reportUrl: reportUrl,
    });

    var form = new FormData();
    form.append("email", email);
    form.append("listing_url", listingUrl);
    form.append("report_id", reportId);
    // catalog_listed (issue #85): "true" = listed in public catalog (default);
    // "false" = report published at stable URL but hidden from catalog.
    form.append("catalog_listed", catalogListed ? "true" : "false");

    fetch(base + "/services/" + SERVICE_ID + "/jobs", { method: "POST", body: form })
      .then(function (response) {
        return response.json().catch(function () { return {}; }).then(function (body) {
          return { status: response.status, body: body };
        });
      })
      .then(function (r) {
        if (r.status === 202) {
          if (!r.body || !r.body.status_url) {
            submitting = false;
            setSubmitBusy(false);
            renderPanel(errorStateFor(0, ""));
            return;
          }
          renderPanel({
            phase: "pending",
            badge: "En file d'attente…",
            message: "Demande acceptée. L'analyse démarre — comptez quelques minutes.",
            reportUrl: reportUrl,
          });
          pollStatus(r.body.status_url, reportUrl);
          return;
        }
        if (r.status === 409 && !isRetry) {
          // §4.2: regenerate a fresh report_id, update the displayed URL,
          // resubmit automatically (one retry). Reset submitting so the
          // recursive call is allowed through the guard.
          submitting = false;
          submit(email, listingUrl, generateReportId(), catalogListed, true);
          return;
        }
        // 503: meta-app unavailable — use email fallback
        if (r.status === 503 && window.EmailFallback) {
          submitting = false;
          setSubmitBusy(false);
          window.EmailFallback.send(listingUrl);
          renderPanel({
            phase: "fallback",
            message: "Le serveur d'analyse est temporairement indisponible. Un email a été envoyé avec votre lien — l'équipe traitera votre demande manuellement.",
            reportUrl: reportUrl,
          });
          return;
        }
        submitting = false;
        setSubmitBusy(false);
        renderPanel(errorStateFor(r.status, r.body && r.body.detail ? String(r.body.detail) : ""));
      })
      .catch(function () {
        submitting = false;
        setSubmitBusy(false);
        // network error — use email fallback
        if (window.EmailFallback) {
          window.EmailFallback.send(listingUrl);
          renderPanel({
            phase: "fallback",
            message: "Le serveur d'analyse est injoignable. Un email a été envoyé avec votre lien — l'équipe traitera votre demande manuellement.",
            reportUrl: reportUrl,
          });
        } else {
          renderPanel(errorStateFor(0, ""));
        }
      });
  }

  // --- Wire the hero form -----------------------------------------------------
  var formEl = document.querySelector("[data-eval-form]");
  if (formEl) {
    var emailInput = formEl.querySelector('input[name="email"]');
    var urlInput = formEl.querySelector('input[name="url"]');
    var hideFromCatalogInput = formEl.querySelector('input[name="hide_from_catalog"]');
    var emailErrorEl = formEl.querySelector("#hero-email-error");
    var urlErrorEl = formEl.querySelector("#hero-listing-url-error");

    if (!emailInput || !urlInput || !emailErrorEl || !urlErrorEl) return;

    function showEmailError(message) {
      emailErrorEl.textContent = message;
      emailErrorEl.removeAttribute("hidden");
      emailInput.setAttribute("aria-invalid", "true");
    }

    function showUrlError(message) {
      urlErrorEl.textContent = message;
      urlErrorEl.removeAttribute("hidden");
      urlInput.setAttribute("aria-invalid", "true");
    }

    emailInput.addEventListener("input", function () {
      emailErrorEl.textContent = "";
      emailErrorEl.setAttribute("hidden", "");
      emailInput.removeAttribute("aria-invalid");
    });

    urlInput.addEventListener("input", function () {
      urlErrorEl.textContent = "";
      urlErrorEl.setAttribute("hidden", "");
      urlInput.removeAttribute("aria-invalid");
    });

    formEl.addEventListener("submit", function (e) {
      e.preventDefault();
      var email = emailInput.value.trim();
      var url = urlInput.value.trim();

      // §5: invalid input never triggers a backend call.
      if (!email) { showEmailError("Indiquez votre adresse email."); emailInput.focus(); return; }
      if (!isValidEmail(email)) { showEmailError("Adresse email invalide."); emailInput.focus(); return; }
      if (!url) { showUrlError("Indiquez l'URL de l'annonce."); urlInput.focus(); return; }
      if (!isValidUrl(url)) { showUrlError("Ce lien n'est pas une URL valide (https://…)."); urlInput.focus(); return; }

      // catalog_listed: true (listed) unless the "hide" checkbox is checked.
      var catalogListed = !(hideFromCatalogInput && hideFromCatalogInput.checked);
      submit(email, url, generateReportId(), catalogListed, false);
    });
  }

  // CTAs scroll to the hero form and focus the email input (no modal, no mailto).
  document.querySelectorAll("[data-eval-cta]").forEach(function (el) {
    el.addEventListener("click", function (e) {
      var emailInput = document.getElementById("hero-email");
      if (emailInput) {
        e.preventDefault();
        emailInput.scrollIntoView({ behavior: "smooth", block: "center" });
        setTimeout(function () { emailInput.focus(); }, 350);
      }
      // else: let the href navigate to index.html#hero-email
    });
  });
})();
