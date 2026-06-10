/**
 * Direct evaluation flow — the service-UI half of the meta-app report
 * workflow (issue #77, meta-app/dev-docs/report-workflow.md §5–§6).
 *
 * On submit: validate the listing URL client-side, generate a unique
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
  function apiBase() {
    try {
      var param = new URLSearchParams(window.location.search).get("api");
      if (param === "reset") {
        window.localStorage.removeItem("immoEvalsApiBase");
      } else if (param) {
        window.localStorage.setItem("immoEvalsApiBase", param);
      }
      var stored = window.localStorage.getItem("immoEvalsApiBase");
      return (param && param !== "reset" ? param : stored || cfg.apiBase || "")
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

  // --- Status panel ---------------------------------------------------------
  var panel = document.querySelector("[data-eval-status]");
  if (!panel) return;

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
    } else {
      rows.push('<span class="eval-status__badge eval-status__badge--pending"><span class="eval-status__spin" aria-hidden="true"></span>' + state.badge + "</span>");
    }
    rows.push("</div>");
    if (state.message) {
      rows.push('<p class="eval-status__msg">' + state.message + "</p>");
    }
    if (state.detail) {
      rows.push('<p class="eval-status__detail" role="alert"></p>');
    }
    if (state.reportUrl) {
      rows.push('<div class="eval-status__urlrow">');
      rows.push('<a class="eval-status__url" href="' + state.reportUrl + '" target="_blank" rel="noopener">' + state.reportUrl + "</a>");
      rows.push('<button type="button" class="btn btn--ghost eval-status__copy" data-copy-url>Copier</button>');
      rows.push("</div>");
      rows.push('<p class="eval-status__note">Ce lien est définitif : gardez-le, il affichera le rapport dès qu’il sera prêt.</p>');
    }
    panel.innerHTML = rows.join("");
    panel.removeAttribute("hidden");
    if (state.detail) {
      // textContent: the server detail is rendered verbatim but never as HTML.
      panel.querySelector(".eval-status__detail").textContent = state.detail;
    }
    var copy = panel.querySelector("[data-copy-url]");
    if (copy) {
      copy.addEventListener("click", function () {
        navigator.clipboard.writeText(state.reportUrl).then(function () {
          copy.textContent = "Copié !";
          setTimeout(function () { copy.textContent = "Copier"; }, 2000);
        });
      });
    }
    panel.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  // --- §4.2 error map: status → what the visitor must see -------------------
  function errorStateFor(status, detail, reportUrl) {
    if (status === 404) {
      return { phase: "error", message: "Ce service est indisponible pour le moment.", detail: "" };
    }
    if (status === 503) {
      return {
        phase: "error",
        message: "Le service est temporairement indisponible — votre demande n’a pas été traitée. Réessayez dans quelques minutes.",
        detail: detail,
      };
    }
    if (status === 413 || status === 415 || status === 422) {
      return { phase: "error", message: "Votre demande n’a pas pu être acceptée :", detail: detail, reportUrl: "" };
    }
    return {
      phase: "error",
      message: "Impossible de contacter le serveur d’analyse. Vérifiez votre connexion et réessayez.",
      detail: detail,
      reportUrl: reportUrl,
    };
  }

  // --- Submission + polling --------------------------------------------------
  var polling = null;

  function pollStatus(statusUrl, reportUrl, logsUrl) {
    var base = apiBase();
    var started = Date.now();
    var MAX_MS = 20 * 60 * 1000;
    clearInterval(polling);
    polling = setInterval(function () {
      if (Date.now() - started > MAX_MS) {
        clearInterval(polling);
        renderPanel({
          phase: "error",
          message: "L’analyse prend plus de temps que prévu. Gardez le lien du rapport et revérifiez plus tard.",
          reportUrl: reportUrl,
        });
        return;
      }
      fetch(base + statusUrl, { cache: "no-store" })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (body) {
          if (!body) return;
          if (body.status === "done") {
            clearInterval(polling);
            renderPanel({
              phase: "done",
              message: "Votre rapport est prêt. Il sera en ligne à l’adresse ci-dessous d’ici une à deux minutes (déploiement).",
              reportUrl: reportUrl,
            });
            waitForLive(reportUrl);
          } else if (body.status === "failed") {
            clearInterval(polling);
            renderPanel({
              phase: "failed",
              message: "L’analyse n’a pas abouti. Aucun rapport ne sera publié pour ce lien — vous pouvez soumettre l’annonce à nouveau.",
            });
          } else if (body.status === "running") {
            renderPanel({
              phase: "pending",
              badge: "Analyse en cours…",
              message: "Le modèle analyse l’annonce (quelques minutes).",
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
      if (Date.now() - started > MAX_MS) { clearInterval(timer); return; }
      fetch(reportUrl, { cache: "no-store" })
        .then(function (r) {
          if (r.ok) {
            clearInterval(timer);
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

  function submit(listingUrl, reportId, isRetry) {
    var base = apiBase();
    var reportUrl = reportUrlFor(reportId);

    renderPanel({
      phase: "pending",
      badge: "Envoi…",
      message: "Votre demande part vers le serveur d’analyse.",
      reportUrl: reportUrl,
    });

    var form = new FormData();
    form.append("listing_url", listingUrl);
    form.append("report_id", reportId);

    fetch(base + "/services/" + SERVICE_ID + "/jobs", { method: "POST", body: form })
      .then(function (response) {
        return response.json().catch(function () { return {}; }).then(function (body) {
          return { status: response.status, body: body };
        });
      })
      .then(function (r) {
        if (r.status === 202) {
          renderPanel({
            phase: "pending",
            badge: "En file d’attente…",
            message: "Demande acceptée. L’analyse démarre — comptez quelques minutes.",
            reportUrl: reportUrl,
          });
          pollStatus(r.body.status_url, reportUrl, r.body.logs_url);
          return;
        }
        if (r.status === 409 && !isRetry) {
          // §4.2: regenerate a fresh report_id, update the displayed URL,
          // resubmit automatically (one retry).
          submit(listingUrl, generateReportId(), true);
          return;
        }
        renderPanel(errorStateFor(r.status, r.body && r.body.detail ? String(r.body.detail) : ""));
      })
      .catch(function () {
        renderPanel(errorStateFor(0, ""));
      });
  }

  // --- Wire the hero form -----------------------------------------------------
  var formEl = document.querySelector("[data-eval-form]");
  if (formEl) {
    var input = formEl.querySelector('input[name="url"]');
    var errorEl = formEl.querySelector('[role="alert"]');

    function showError(message) {
      errorEl.textContent = message;
      errorEl.removeAttribute("hidden");
      input.setAttribute("aria-invalid", "true");
    }

    input.addEventListener("input", function () {
      errorEl.textContent = "";
      errorEl.setAttribute("hidden", "");
      input.removeAttribute("aria-invalid");
    });

    formEl.addEventListener("submit", function (e) {
      e.preventDefault();
      var url = input.value.trim();
      // §5: invalid input never triggers a backend call.
      if (!url) { showError("Indiquez l’URL de l’annonce."); input.focus(); return; }
      if (!isValidUrl(url)) { showError("Ce lien n’est pas une URL valide (https://…)."); input.focus(); return; }
      submit(url, generateReportId(), false);
    });
  }

  // CTAs scroll to the hero form and focus the input (no modal, no email).
  document.querySelectorAll("[data-eval-cta]").forEach(function (el) {
    el.addEventListener("click", function (e) {
      e.preventDefault();
      var input = document.getElementById("hero-listing-url");
      if (input) {
        input.scrollIntoView({ behavior: "smooth", block: "center" });
        setTimeout(function () { input.focus(); }, 350);
      }
    });
  });
})();
