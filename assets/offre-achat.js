/**
 * Offre d'achat PDF generator (self-contained, no framework, no build).
 *
 * The PDF builder `buildOffreAchatPdf` is environment-agnostic so it can be
 * unit-tested in Node (require('jspdf')) and used in the browser
 * (window.jspdf.jsPDF). The browser bootstrap that wires the modal/button is
 * guarded so requiring this file in Node never touches the DOM.
 *
 * Two render modes:
 *  - blank  : emits the agency "modèle vierge" with [bracket placeholders].
 *  - filled : builds the formal French purchase-offer letter from buyerData.
 */
(function () {
  "use strict";

  // --- Pure PDF builder -----------------------------------------------------

  function buildOffreAchatPdf(jsPDFCtor, reportData, buyerData) {
    const report = reportData || {};
    const bd = buyerData || {};
    const kpi = report.kpi || {};

    const doc = new jsPDFCtor({ unit: "pt", format: "a4" });
    doc.setFont("helvetica");

    const PAGE_W = 595;
    const PAGE_H = 842;
    const MARGIN = 50;
    const MAX_W = PAGE_W - MARGIN * 2;
    const BOTTOM = PAGE_H - MARGIN;
    const LINE = 15;
    const GAP = 10;

    let y = MARGIN;

    function ensureSpace(needed) {
      if (y + needed > BOTTOM) {
        doc.addPage();
        y = MARGIN;
      }
    }

    function writeLines(text) {
      const lines = doc.splitTextToSize(String(text == null ? "" : text), MAX_W);
      ensureSpace(lines.length * LINE);
      doc.text(lines, MARGIN, y, { maxWidth: MAX_W });
      y += lines.length * LINE;
    }

    function writeText(text, opts) {
      opts = opts || {};
      const size = opts.size || 11;
      const style = opts.style || "normal";
      const color = opts.color || 30;
      doc.setFont("helvetica", style);
      doc.setFontSize(size);
      doc.setTextColor(color);
      writeLines(text);
    }

    function writeRight(text) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(11);
      doc.setTextColor(30);
      const lines = doc.splitTextToSize(String(text), MAX_W);
      ensureSpace(lines.length * LINE);
      lines.forEach(function (l) {
        doc.text(l, PAGE_W - MARGIN, y, { align: "right" });
        y += LINE;
      });
    }

    // Right-aligned multi-line block starting at `startY`; returns the y after it.
    function rightBlock(lines, startY) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(11);
      doc.setTextColor(30);
      let yy = startY;
      lines.forEach(function (l) {
        const spl = doc.splitTextToSize(String(l == null ? "" : l), MAX_W);
        spl.forEach(function (s) {
          doc.text(s, PAGE_W - MARGIN, yy, { align: "right" });
          yy += LINE;
        });
      });
      return yy;
    }

    function isBlank() {
      return !bd || Object.keys(bd).length === 0 || !(bd.buyers && bd.buyers.length);
    }

    // --- Blank "modèle vierge" ----------------------------------------------
    if (isBlank()) {
      // Sender (left) + agency (right) letterhead
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.setTextColor(10);
      writeLines("[Vos Nom et Prénom]");
      writeLines("[Votre adresse]");
      writeLines("[Code Postal Ville]");
      const blankAgency = rightBlock(
        ["[Nom de l'agence]", "[Adresse de l'agence]", "[Code Postal Ville]"],
        MARGIN
      );
      y = Math.max(y, blankAgency) + GAP;
      writeRight("[Date du jour]");
      y += GAP * 1.5;
      writeText("Objet : Proposition d'offre d'achat pour [Adresse du bien] à [Ville]");
      y += GAP;
      writeText("Madame, Monsieur,");
      y += GAP;
      writeText(
        "nous, soussigné(e)s [Monsieur / Madame Prénom Nom, adresse, date et lieu de " +
          "naissance]" +
          "[et Madame / Monsieur Prénom Nom, adresse, date et lieu de naissance],"
      );
      y += GAP;
      writeText(
        "vous informons vouloir nous porter acquéreurs du bien sis à [Ville] " +
          "[adresse / désignation / surface]."
      );
      writeText("Nous vous faisons donc une offre au prix de [PRIX] frais d'agence inclus.");
      writeText("Le financement de cet achat se fera de la façon suivante :");
      writeText("[Modalités]");
      y += GAP;
      writeText("Cette offre est valable jusqu'au [JJ/MM/AAAA].");
      y += GAP * 1.5;
      doc.setFont("helvetica", "italic");
      doc.setFontSize(10);
      doc.setTextColor(80);
      writeLines(
        "(Date et signature de tous les acheteurs, précédées de la mention manuscrite"
      );
      writeLines("« Bon pour achat »)");
      y += GAP;
      writeLines("[Votre Signature]");
      return doc;
    }

    // --- Filled formal letter -----------------------------------------------

    function guessCity(r) {
      const t = r.title || "";
      const m = t.match(/—\s*([A-Za-zÉÉÈÀÇ0-9().\s-]+)$/);
      if (m) return m[1].trim();
      return "";
    }

    const reportPrice =
      bd.offerPrice || report.price || kpi.price || "";
    const surface = report.surface || kpi.surface || "";
    const type = report.type || kpi.type || "";

    const city = (bd.propertyCity || guessCity(report) || "VERSAILLES").toUpperCase();

    const propRefParts = [];
    if (bd.propertyAddress) propRefParts.push(bd.propertyAddress);
    if (bd.propertyDesignation) propRefParts.push(bd.propertyDesignation);
    else {
      if (surface) propRefParts.push(surface);
      if (type) propRefParts.push(type);
    }
    const propRef = propRefParts.join(" — ");

    function buildBuyerClause(buyers) {
      return buyers
        .map(function (b) {
          const civ = b.civilite || "Monsieur";
          const nom = (b.nom || "").trim().toUpperCase();
          const pre = (b.prenom || "").trim();
          let s = civ + " " + (pre ? pre + " " : "") + (nom || "");
          const bits = [];
          if (b.adresse) bits.push("demeurant " + b.adresse);
          if (b.dateNaissance) bits.push("né(e) le " + b.dateNaissance);
          if (b.lieuNaissance) bits.push("à " + b.lieuNaissance);
          if (bits.length) s += ", " + bits.join(", ");
          return s.trim();
        })
        .join(" et ");
    }

    const buyerClause = buildBuyerClause(bd.buyers);
    const letterDate =
      bd.date ||
      new Date().toLocaleDateString("fr-FR", {
        day: "2-digit",
        month: "long",
        year: "numeric",
      });
    const offerPrice = reportPrice || "[PRIX]";
    const financing =
      bd.financing || "Sous réserve d'obtention d'un prêt bancaire";
    const validityDate = bd.validityDate || "[JJ/MM/AAAA]";

    // Sender block (top-left)
    const senderLines = [];
    if (bd.senderName) senderLines.push(bd.senderName);
    if (bd.senderAddress) senderLines.push(bd.senderAddress);
    if (bd.senderCity) senderLines.push(bd.senderCity);
    if (!senderLines.length) senderLines.push("[Nom et Prénom]");
    senderLines.forEach(function (l, i) {
      writeText(l, { style: i === 0 ? "bold" : "normal" });
    });

    // Agency block (top-right)
    const agencyLines = [];
    agencyLines.push(bd.agencyName || "AGENCE IMMOBILIERE ROMY");
    if (bd.agencyAddress) {
      bd.agencyAddress.split(/\n+/).forEach(function (l) {
        if (l.trim()) agencyLines.push(l.trim());
      });
    } else {
      agencyLines.push("71 rue de la Paroisse");
      agencyLines.push("78000 VERSAILLES");
    }
    const agencyEnd = rightBlock(agencyLines, MARGIN);
    y = Math.max(y, agencyEnd) + GAP;

    // Date (right aligned, under the agency)
    writeRight(letterDate);
    y += GAP * 1.5;

    // Objet
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(10);
    writeLines("Objet : Proposition d'offre d'achat pour " + (bd.propertyAddress || propRef || "[Adresse du bien]") + " à " + city);
    y += GAP;

    // Body
    writeText("Madame, Monsieur,");
    y += GAP;
    writeText(
      "nous, soussigné(e)s " +
        buyerClause +
        ", vous informons vouloir nous porter acquéreurs du bien sis à " +
        city +
        (propRef ? " (" + propRef + ")" : "") +
        "."
    );
    writeText("Nous vous faisons donc une offre au prix de " + offerPrice + " frais d'agence inclus.");
    writeText("Le financement de cet achat se fera de la façon suivante :");
    writeText(financing);
    y += GAP;
    writeText("Cette offre est valable jusqu'au " + validityDate + ".");
    y += GAP * 1.5;

    // Signature block
    doc.setFont("helvetica", "italic");
    doc.setFontSize(10);
    doc.setTextColor(80);
    writeLines(
      "(Date et signature de tous les acheteurs, précédées de la mention manuscrite"
    );
    writeLines("« Bon pour achat »)");
    doc.setFont("helvetica", "normal");
    doc.setTextColor(30);
    y += GAP;

    bd.buyers.forEach(function (b, i) {
      const label =
        (b.civilite || "Monsieur") +
        " " +
        ((b.prenom || "").trim() + " " + (b.nom || "").trim().toUpperCase()).trim();
      ensureSpace(LINE * 3);
      doc.setFontSize(11);
      doc.text("À " + city + ", le ______________", MARGIN, y);
      y += LINE;
      doc.setFontSize(10);
      doc.setTextColor(120);
      doc.text("« Bon pour achat »", MARGIN, y);
      y += LINE * 0.5;
      doc.setDrawColor(120);
      doc.setLineWidth(0.5);
      doc.line(MARGIN, y, PAGE_W - MARGIN, y);
      y += LINE * 0.4;
      doc.setFontSize(10);
      doc.setTextColor(60);
      doc.text(label, MARGIN, y);
      y += GAP * 1.5;
    });

    return doc;
  }

  // --- Browser bootstrap ----------------------------------------------------

  // HTML-context escaping for any value injected into modal markup (defense in depth).
  function htmlEncode(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function initOffreAchat() {
    const dataEl = document.getElementById("report-data");
    if (!dataEl) return;
    let DATA;
    try {
      DATA = JSON.parse(dataEl.textContent);
    } catch (e) {
      return;
    }

    const STYLE_ID = "oa-style";
    const SCRIPT_SRC = "https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js";

    let jspdfLoaded = false;
    let jspdfLoading = false;

    const CSS = [
      ".oa-modal[hidden]{display:none}",
      ".oa-modal{position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;padding:1rem;overflow:auto}",
      ".oa-modal__backdrop{position:absolute;inset:0;background:rgba(10,10,10,0.45)}",
      ".oa-modal__dialog{position:relative;width:100%;max-width:520px;background:var(--paper,#fff);color:var(--ink,#0a0a0a);border-radius:16px;box-shadow:0 18px 50px rgba(0,0,0,0.25);padding:1.5rem;font-family:inherit;margin:auto}",
      ".oa-modal__close{position:absolute;top:0.5rem;right:0.75rem;background:none;border:0;font-size:1.5rem;line-height:1;cursor:pointer;color:#555}",
      ".oa-modal__title{font-size:1.15rem;font-weight:700;margin:0 0 0.25rem}",
      ".oa-modal__sub{font-size:0.85rem;color:#555;margin:0 0 1rem}",
      ".oa-modal__actions{display:flex;flex-direction:column;gap:0.6rem;margin-top:0.5rem}",
      ".oa-btn{appearance:none;border:0;border-radius:999px;padding:0.6rem 1rem;font-weight:600;font-size:0.9rem;cursor:pointer;text-align:center}",
      ".oa-btn--primary{background:var(--leafdeep,#15803d);color:#fff}",
      ".oa-btn--ghost{background:var(--leafsoft,#f0fdf4);color:var(--leafdeep,#15803d);border:1px solid var(--leaf,#16a34a)}",
      ".oa-field{display:flex;flex-direction:column;gap:0.25rem;margin-bottom:0.6rem}",
      ".oa-field label{font-size:0.82rem;font-weight:600}",
      ".oa-field input,.oa-field textarea,.oa-field select{font:inherit;padding:0.5rem 0.6rem;border:1px solid #d4d4d4;border-radius:10px;background:#fff;color:inherit}",
      ".oa-fieldset{border:1px solid #e5e7eb;border-radius:12px;padding:0.75rem;margin:0 0 0.85rem}",
      ".oa-fieldset>legend{font-size:0.82rem;font-weight:700;padding:0 0.4rem}",
      ".oa-grid{display:grid;grid-template-columns:1fr 1fr;gap:0 0.6rem}",
      ".oa-row{display:flex;gap:0.5rem;align-items:center;margin-bottom:0.5rem}",
      ".oa-input-inline{flex:1}",
      ".oa-remove{background:none;border:1px solid #dc2626;color:#dc2626;border-radius:8px;padding:0.3rem 0.5rem;font-size:0.8rem;cursor:pointer}",
      ".oa-field input:focus-visible,.oa-field textarea:focus-visible,.oa-field select:focus-visible,.oa-btn:focus-visible,.oa-modal__close:focus-visible,.oa-link:focus-visible,.oa-remove:focus-visible{outline:2px solid var(--leaf,#16a34a);outline-offset:2px}",
      ".oa-field input[aria-invalid='true'],.oa-field textarea[aria-invalid='true']{border-color:#dc2626}",
      ".oa-modal__error,.oa-error{color:#dc2626;font-size:0.8rem;margin:0 0 0.75rem}",
      ".oa-link{background:none;border:0;color:var(--leafdeep,#15803d);text-decoration:underline;cursor:pointer;font:inherit;padding:0.25rem 0;margin-top:0.5rem}",
    ].join("\n");

    if (!document.getElementById(STYLE_ID)) {
      const style = document.createElement("style");
      style.id = STYLE_ID;
      style.textContent = CSS;
      document.head.appendChild(style);
    }

    const jspdfWaiters = [];

    function loadJsPdf(cb) {
      if (jspdfLoaded) return cb(true);
      jspdfWaiters.push(cb);
      if (jspdfLoading) return;
      jspdfLoading = true;
      const s = document.createElement("script");
      s.src = SCRIPT_SRC;
      s.onload = function () {
        jspdfLoaded = true;
        jspdfLoading = false;
        const waiters = jspdfWaiters.splice(0);
        waiters.forEach(function (fn) {
          fn(true);
        });
      };
      s.onerror = function () {
        jspdfLoading = false;
        const waiters = jspdfWaiters.splice(0);
        waiters.forEach(function (fn) {
          fn(false);
        });
      };
      document.head.appendChild(s);
    }

    function showError(alertEl, msg) {
      if (alertEl) {
        alertEl.textContent = msg;
        alertEl.setAttribute("role", "alert");
      }
    }
    function clearError(alertEl) {
      if (alertEl) alertEl.textContent = "";
    }
    function isValidEmail(v) {
      return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
    }
    function isValidPhone(v) {
      if (!v) return true;
      if (!/^[0-9+()\-./\s]+$/.test(v)) return false;
      const digits = v.replace(/\D/g, "");
      return digits.length >= 6 && digits.length <= 15;
    }
    function fmtDateFr(d) {
      const dd = String(d.getDate()).padStart(2, "0");
      const mm = String(d.getMonth() + 1).padStart(2, "0");
      return dd + "/" + mm + "/" + d.getFullYear();
    }
    function defaultValidity() {
      const d = new Date();
      d.setDate(d.getDate() + 10);
      return fmtDateFr(d);
    }
    function guessCityTitle(title) {
      const m = String(title || "").match(/—\s*([A-Za-zÉÈÀÇ0-9().\s-]+)$/);
      return m ? m[1].trim() : "Versailles";
    }

    // --- Build modal DOM ---
    const overlay = document.createElement("div");
    overlay.className = "oa-modal";
    overlay.setAttribute("hidden", "");
    overlay.innerHTML = [
      '<div class="oa-modal__backdrop" data-close></div>',
      '<div class="oa-modal__dialog" role="dialog" aria-modal="true" aria-labelledby="oa-title">',
      '  <button type="button" class="oa-modal__close" data-close aria-label="Fermer">&times;</button>',
      '  <h2 class="oa-modal__title" id="oa-title">Offre d\'achat</h2>',
      '  <p class="oa-modal__sub" id="oa-sub">Générez un PDF d\'offre d\'achat prêt à imprimer.</p>',
      '  <div class="oa-modal__error" id="oa-error" role="alert"></div>',
      '  <div id="oa-body"></div>',
      "</div>",
    ].join("");
    document.body.appendChild(overlay);

    const body = overlay.querySelector("#oa-body");
    const errorEl = overlay.querySelector("#oa-error");
    const subEl = overlay.querySelector("#oa-sub");

    let trigger = null;

    function openModal(btn) {
      trigger = btn || null;
      errorEl.textContent = "";
      renderChoice();
      overlay.removeAttribute("hidden");
      const first = overlay.querySelector("button, input, textarea, [tabindex]");
      if (first) first.focus();
    }

    function closeModal() {
      overlay.setAttribute("hidden", "");
      if (trigger && typeof trigger.focus === "function") trigger.focus();
    }

    function renderChoice() {
      subEl.textContent = "Générez un PDF d'offre d'achat prêt à imprimer.";
      body.innerHTML = [
        '<div class="oa-modal__actions">',
        '  <button type="button" class="oa-btn oa-btn--primary" id="oa-blank">Télécharger un modèle vierge</button>',
        '  <button type="button" class="oa-btn oa-btn--ghost" id="oa-fill">Pré-remplir avec mes informations</button>',
        "</div>",
      ].join("");
      body.querySelector("#oa-blank").addEventListener("click", function () {
        generate({});
      });
      body.querySelector("#oa-fill").addEventListener("click", renderForm);
    }

    function buyerFieldsetHtml(idx, defaults) {
      defaults = defaults || {};
      const civ = defaults.civilite || (idx === 0 ? "Monsieur" : "Madame");
      const removable = idx > 0;
      return (
        '<fieldset class="oa-fieldset" data-buyer="' + idx + '">' +
        "  <legend>Acheteur " + (idx + 1) + (removable ? "" : " (principal)") + "</legend>" +
        '  <div class="oa-row">' +
        '    <div class="oa-field oa-input-inline"><label>Civilité</label>' +
        '      <select name="civilite">' +
        '        <option value="Monsieur"' + (civ === "Monsieur" ? " selected" : "") + ">Monsieur</option>" +
        '        <option value="Madame"' + (civ === "Madame" ? " selected" : "") + ">Madame</option>" +
        "      </select></div>" +
        (removable
          ? '    <button type="button" class="oa-remove" data-remove-buyer="' + idx + '">Retirer</button>'
          : "") +
        "  </div>" +
        '  <div class="oa-grid">' +
        '    <div class="oa-field"><label>Prénom *</label><input name="prenom" type="text" value="' + htmlEncode(defaults.prenom || "") + '" required></div>' +
        '    <div class="oa-field"><label>Nom *</label><input name="nom" type="text" value="' + htmlEncode(defaults.nom || "") + '" required></div>' +
        "  </div>" +
        '  <div class="oa-field"><label>Adresse</label><input name="adresse" type="text" value="' + htmlEncode(defaults.adresse || "") + '"></div>' +
        '  <div class="oa-grid">' +
        '    <div class="oa-field"><label>Date de naissance</label><input name="dateNaissance" type="text" placeholder="JJ/MM/AAAA" value="' + htmlEncode(defaults.dateNaissance || "") + '"></div>' +
        '    <div class="oa-field"><label>Lieu de naissance</label><input name="lieuNaissance" type="text" value="' + htmlEncode(defaults.lieuNaissance || "") + '"></div>' +
        "  </div>" +
        "</fieldset>"
      );
    }

    function renderForm() {
      subEl.textContent = "Renseignez vos informations pour pré-remplir l'offre.";
      const price = (DATA.price || (DATA.kpi && DATA.kpi.price) || "").toString();
      const surface = DATA.surface || (DATA.kpi && DATA.kpi.surface) || "";
      const type = DATA.type || (DATA.kpi && DATA.kpi.type) || "";
      const designation = [surface, type].filter(Boolean).join(" — ");
      const city = guessCityTitle(DATA.title);

      body.innerHTML = [
        '<form id="oa-form" novalidate>',
        '  <fieldset class="oa-fieldset"><legend>Vos coordonnées (expéditeur)</legend>',
        '    <div class="oa-field"><label>Nom et prénom *</label><input name="senderName" type="text" required aria-describedby="oa-error"></div>',
        '    <div class="oa-field"><label>Adresse</label><input name="senderAddress" type="text"></div>',
        '    <div class="oa-field"><label>Code postal et ville</label><input name="senderCity" type="text" placeholder="78000 Versailles"></div>',
        "  </fieldset>",
        '  <fieldset class="oa-fieldset"><legend>Agence immobilière (destinataire)</legend>',
        '    <div class="oa-field"><label>Nom de l\'agence</label><input name="agencyName" type="text" value="AGENCE IMMOBILIERE ROMY"></div>',
        '    <div class="oa-field"><label>Adresse de l\'agence</label><textarea name="agencyAddress" rows="2">71 rue de la Paroisse\n78000 VERSAILLES</textarea></div>',
        "  </fieldset>",
        '  <fieldset class="oa-fieldset"><legend>Le bien</legend>',
        '    <div class="oa-field"><label>Adresse du bien</label><input name="propertyAddress" type="text" placeholder="4 rue Philippe de Dangeau"></div>',
        '    <div class="oa-field"><label>Ville</label><input name="propertyCity" type="text" value="' + htmlEncode(city) + '"></div>',
        '    <div class="oa-field"><label>Désignation / surface</label><input name="propertyDesignation" type="text" value="' + htmlEncode(designation) + '" placeholder="42 m² — Appartement T2"></div>',
        "  </fieldset>",
        '  <fieldset class="oa-fieldset"><legend>Conditions de l\'offre</legend>',
        '    <div class="oa-field"><label>Prix proposé (frais d\'agence inclus)</label><input name="offerPrice" type="text" value="' + htmlEncode(price) + '"></div>',
        '    <div class="oa-field"><label>Financement</label><textarea name="financing" rows="2" placeholder="Apport + prêt bancaire">Sous réserve d\'obtention d\'un prêt bancaire</textarea></div>',
        '    <div class="oa-field"><label>Offre valable jusqu\'au (JJ/MM/AAAA)</label><input name="validityDate" type="text" value="' + htmlEncode(defaultValidity()) + '"></div>',
        "  </fieldset>",
        '  <div id="oa-buyers">' + buyerFieldsetHtml(0) + "</div>",
        '  <button type="button" class="oa-link" id="oa-add-buyer">+ Ajouter un co-acquéreur</button>',
        '  <div class="oa-modal__actions">',
        '    <button type="submit" class="oa-btn oa-btn--primary">Générer le PDF</button>',
        '    <button type="button" class="oa-link" id="oa-back">← Retour</button>',
        "  </div>",
        "</form>",
      ].join("");

      const form = body.querySelector("#oa-form");
      form.querySelector("#oa-back").addEventListener("click", renderChoice);

      const buyersWrap = form.querySelector("#oa-buyers");
      form.querySelector("#oa-add-buyer").addEventListener("click", function () {
        const count = buyersWrap.querySelectorAll("fieldset[data-buyer]").length;
        if (count >= 2) return;
        const div = document.createElement("div");
        div.innerHTML = buyerFieldsetHtml(count);
        const fs = div.firstChild;
        buyersWrap.appendChild(fs);
        if (count + 1 >= 2) form.querySelector("#oa-add-buyer").setAttribute("hidden", "");
        fs.querySelector("[data-remove-buyer]").addEventListener("click", function () {
          fs.remove();
          form.querySelector("#oa-add-buyer").removeAttribute("hidden");
        });
        fs.querySelector("input[name='prenom']").focus();
      });

      // Clear error as soon as any required field is edited.
      form.addEventListener("input", function (e) {
        if (e.target.matches("input[required], textarea[required]")) {
          e.target.removeAttribute("aria-invalid");
          if (errorEl.textContent) errorEl.textContent = "";
        }
      });

      form.querySelector("input[name='senderName']").focus();

      form.addEventListener("submit", function (e) {
        e.preventDefault();
        clearError(errorEl);

        const required = form.querySelectorAll("input[required]");
        let firstInvalid = null;
        required.forEach(function (inp) {
          if (!inp.value.trim()) {
            inp.setAttribute("aria-invalid", "true");
            if (!firstInvalid) firstInvalid = inp;
          } else {
            inp.removeAttribute("aria-invalid");
          }
        });
        if (firstInvalid) {
          showError(errorEl, "Merci de renseigner les champs obligatoires (*).");
          firstInvalid.focus();
          return;
        }

        const validityVal = form.querySelector("input[name='validityDate']").value.trim();
        const buyerNodes = buyersWrap.querySelectorAll("fieldset[data-buyer]");
        const buyers = [];
        let buyerMissing = false;
        buyerNodes.forEach(function (fs) {
          const prenom = fs.querySelector("input[name='prenom']").value.trim();
          const nom = fs.querySelector("input[name='nom']").value.trim();
          if (!prenom || !nom) {
            fs.querySelector("input[name='prenom']").setAttribute("aria-invalid", "true");
            fs.querySelector("input[name='nom']").setAttribute("aria-invalid", "true");
            buyerMissing = true;
            return;
          }
          buyers.push({
            civilite: fs.querySelector("select[name='civilite']").value,
            prenom: prenom,
            nom: nom,
            adresse: fs.querySelector("input[name='adresse']").value.trim(),
            dateNaissance: fs.querySelector("input[name='dateNaissance']").value.trim(),
            lieuNaissance: fs.querySelector("input[name='lieuNaissance']").value.trim(),
          });
        });
        if (buyerMissing) {
          showError(errorEl, "Chaque acheteur doit avoir un prénom et un nom.");
          return;
        }

        const buyerData = {
          senderName: form.querySelector("input[name='senderName']").value.trim(),
          senderAddress: form.querySelector("input[name='senderAddress']").value.trim(),
          senderCity: form.querySelector("input[name='senderCity']").value.trim(),
          agencyName: form.querySelector("input[name='agencyName']").value.trim(),
          agencyAddress: form.querySelector("textarea[name='agencyAddress']").value.trim(),
          propertyAddress: form.querySelector("input[name='propertyAddress']").value.trim(),
          propertyCity: form.querySelector("input[name='propertyCity']").value.trim(),
          propertyDesignation: form.querySelector("input[name='propertyDesignation']").value.trim(),
          offerPrice: form.querySelector("input[name='offerPrice']").value.trim(),
          financing: form.querySelector("textarea[name='financing']").value.trim(),
          validityDate: validityVal,
          buyers: buyers,
        };
        generate(buyerData);
      });
    }

    function generate(buyerData) {
      loadJsPdf(function (ok) {
        if (!ok) {
          showError(errorEl, "Impossible de charger la bibliothèque PDF. Vérifiez votre connexion.");
          return;
        }
        try {
          const jsPDF = window.jspdf.jsPDF;
          const doc = buildOffreAchatPdf(jsPDF, DATA, buyerData);
          doc.save("offre-dachat.pdf");
          closeModal();
        } catch (err) {
          showError(errorEl, "Une erreur est survenue lors de la génération du PDF.");
        }
      });
    }

    // Close interactions
    overlay.querySelectorAll("[data-close]").forEach(function (el) {
      el.addEventListener("click", closeModal);
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && !overlay.hasAttribute("hidden")) closeModal();
    });

    // Simple focus trap so keyboard users stay inside the open dialog.
    const dialog = overlay.querySelector(".oa-modal__dialog");
    dialog.addEventListener("keydown", function (e) {
      if (e.key !== "Tab") return;
      const focusable = dialog.querySelectorAll(
        'button, [href], input, textarea, select, [tabindex]:not([tabindex="-1"])'
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

    function mountOffreTrigger(btn) {
      btn.setAttribute("type", "button");
      btn.setAttribute("aria-label", "Générer une offre d'achat (PDF)");
      btn.addEventListener("click", function () {
        openModal(btn);
      });
    }

    const printBtn = document.querySelector('button[onclick="window.print()"]');
    if (printBtn) {
      const offreBtn = document.createElement("button");
      offreBtn.className = printBtn.className;
      offreBtn.innerHTML = "✍ <span class=\"hidden sm:inline\">Offre</span>";
      mountOffreTrigger(offreBtn);
      printBtn.insertAdjacentElement("afterend", offreBtn);
    } else {
      const toolbar =
        document.querySelector("header .flex.items-center") ||
        document.querySelector("header .container .flex") ||
        document.querySelector("header");
      if (toolbar) {
        const offreBtn = document.createElement("button");
        offreBtn.className =
          "h-9 px-3.5 rounded-full border border-line2 bg-paper text-xs font-semibold text-body hover:bg-ink hover:text-paper hover:border-ink transition inline-flex items-center gap-1.5";
        offreBtn.innerHTML = "✍ <span class=\"hidden sm:inline\">Offre</span>";
        mountOffreTrigger(offreBtn);
        toolbar.appendChild(offreBtn);
      }
    }
  }

  // Node export (does not affect browser IIFE)
  if (typeof module !== "undefined" && module.exports) {
    module.exports = { buildOffreAchatPdf };
  }

  // Browser bootstrap guard
  if (typeof document !== "undefined" && document.getElementById("report-data")) {
    initOffreAchat();
  }
})();
