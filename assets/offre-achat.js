/**
 * Offre d'achat PDF generator (self-contained, no framework, no build).
 *
 * The PDF builder `buildOffreAchatPdf` is environment-agnostic so it can be
 * unit-tested in Node (require('jspdf')) and used in the browser
 * (window.jspdf.jsPDF). The browser bootstrap that wires the modal/button is
 * guarded so requiring this file in Node never touches the DOM.
 */
(function () {
  "use strict";

  // --- Pure PDF builder -----------------------------------------------------

  function buildOffreAchatPdf(jsPDFCtor, reportData, buyerData) {
    const report = reportData || {};
    const buyer = buyerData || {};
    const kpi = report.kpi || {};

    const doc = new jsPDFCtor({ unit: "pt", format: "a4" });
    doc.setFont("helvetica");

    const PAGE_W = 595;
    const PAGE_H = 842;
    const MARGIN = 40;
    const MAX_W = PAGE_W - MARGIN * 2;
    const BOTTOM = PAGE_H - MARGIN;
    const LINE = 16;
    const GAP = 10;

    let y = MARGIN;

    function ensureSpace(needed) {
      if (y + needed > BOTTOM) {
        doc.addPage();
        y = MARGIN;
      }
    }

    function writeText(text, opts) {
      opts = opts || {};
      const size = opts.size || 11;
      const style = opts.style || "normal";
      const color = opts.color || 30;
      doc.setFont("helvetica", style);
      doc.setFontSize(size);
      doc.setTextColor(color);
      const lines = doc.splitTextToSize(String(text), MAX_W);
      ensureSpace(lines.length * LINE);
      doc.text(lines, MARGIN, y, { maxWidth: MAX_W });
      y += lines.length * LINE;
    }

    function title(text) {
      ensureSpace(40);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(20);
      doc.setTextColor(22, 130, 61);
      doc.text(text, MARGIN, y);
      y += 26;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(11);
      doc.setTextColor(90);
      const sub = doc.splitTextToSize("Conformément à la pratique immobilière en France", MAX_W);
      doc.text(sub, MARGIN, y, { maxWidth: MAX_W });
      y += sub.length * LINE + GAP;
    }

    function section(label) {
      ensureSpace(30);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(13);
      doc.setTextColor(10);
      const lines = doc.splitTextToSize(label, MAX_W);
      doc.text(lines, MARGIN, y, { maxWidth: MAX_W });
      y += lines.length * LINE + 4;
      doc.setDrawColor(22, 130, 61);
      doc.setLineWidth(0.8);
      doc.line(MARGIN, y, PAGE_W - MARGIN, y);
      y += GAP;
      doc.setFont("helvetica", "normal");
      doc.setTextColor(30);
    }

    function field(label, value) {
      ensureSpace(LINE);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(11);
      doc.setTextColor(30);
      const text = label + " : " + (value === undefined || value === null || value === "" ? "—" : value);
      const lines = doc.splitTextToSize(text, MAX_W);
      doc.text(lines, MARGIN, y, { maxWidth: MAX_W });
      y += lines.length * LINE;
    }

    function blankLine(label) {
      ensureSpace(LINE);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(11);
      doc.setTextColor(30);
      doc.text(label + " : ____________", MARGIN, y);
      y += LINE;
    }

    title("OFFRE D'ACHAT");

    // Date
    ensureSpace(LINE);
    field("Date", report.date || new Date().toISOString().slice(0, 10));
    y += GAP;

    // 1. Désignation du bien
    section("1. Désignation du bien");
    field("Titre", report.title);
    field("Prix de vente", kpi.price);
    field("Surface", kpi.surface);
    field("Type", kpi.type);
    field("Lien de l'annonce", report.url);
    y += GAP;

    // 2. L'acheteur
    section("2. L'acheteur");
    if (buyer.fullName) {
      field("Nom et prénom", buyer.fullName);
      field("Adresse", buyer.address);
      field("Téléphone", buyer.phone);
      field("Email", buyer.email);
    } else {
      blankLine("Nom et prénom");
      blankLine("Adresse");
      blankLine("Téléphone");
      blankLine("Email");
    }
    y += GAP;

    // 3. Conditions de l'offre
    section("3. Conditions de l'offre");
    field("Prix proposé", buyer.offerPrice || kpi.price);
    field("Financement", buyer.financing || "Sous réserve d'obtention d'un prêt");
    field("Conditions particulières", buyer.conditions);
    field("Validité de l'offre", (buyer.validityDays || 10) + " jours");
    y += GAP;

    // 4. Mentions légales
    section("4. Mentions légales");
    writeText(
      "La présente offre est irrévocable jusqu'à la date de fin de validité indiquée ci-dessus. " +
        "L'acheteur dispose d'un délai de rétractation de dix jours à compter de la réception de la " +
        "promesse de vente, conformément à l'article L. 271-1 du Code de la construction et de " +
        "l'habitation. Les présentes conditions s'entendent sous réserve de la signature " +
        "d'un compromis ou d'une promesse de vente rédigé par un professionnel habilité."
    );
    y += GAP;
    ensureSpace(40);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(10);
    doc.text("Signature de l'acheteur :", MARGIN, y);
    y += 28;
    doc.setDrawColor(120);
    doc.setLineWidth(0.5);
    doc.line(MARGIN, y, PAGE_W - MARGIN, y);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(30);

    return doc;
  }

  // --- Browser bootstrap ----------------------------------------------------

  function initOffreAchat() {
    const DATA = JSON.parse(document.getElementById("report-data").textContent);

    const STYLE_ID = "oa-style";
    const SCRIPT_SRC = "https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js";

    let jspdfLoaded = false;
    let jspdfLoading = false;

    const CSS = [
      ".oa-modal[hidden]{display:none}",
      ".oa-modal{position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;padding:1rem}",
      ".oa-modal__backdrop{position:absolute;inset:0;background:rgba(10,10,10,0.45)}",
      ".oa-modal__dialog{position:relative;width:100%;max-width:420px;background:var(--paper,#fff);color:var(--ink,#0a0a0a);border-radius:16px;box-shadow:0 18px 50px rgba(0,0,0,0.25);padding:1.5rem;font-family:inherit}",
      ".oa-modal__close{position:absolute;top:0.5rem;right:0.75rem;background:none;border:0;font-size:1.5rem;line-height:1;cursor:pointer;color:#555}",
      ".oa-modal__title{font-size:1.15rem;font-weight:700;margin:0 0 0.25rem}",
      ".oa-modal__sub{font-size:0.85rem;color:#555;margin:0 0 1rem}",
      ".oa-modal__actions{display:flex;flex-direction:column;gap:0.6rem;margin-top:0.5rem}",
      ".oa-btn{appearance:none;border:0;border-radius:999px;padding:0.6rem 1rem;font-weight:600;font-size:0.9rem;cursor:pointer;text-align:center}",
      ".oa-btn--primary{background:var(--leafdeep,#15803d);color:#fff}",
      ".oa-btn--ghost{background:var(--leafsoft,#f0fdf4);color:var(--leafdeep,#15803d);border:1px solid var(--leaf,#16a34a)}",
      ".oa-field{display:flex;flex-direction:column;gap:0.25rem;margin-bottom:0.75rem}",
      ".oa-field label{font-size:0.82rem;font-weight:600}",
      ".oa-field input,.oa-field textarea{font:inherit;padding:0.5rem 0.6rem;border:1px solid #d4d4d4;border-radius:10px;background:#fff;color:inherit}",
      ".oa-field input[aria-invalid='true'],.oa-field textarea[aria-invalid='true']{border-color:#dc2626}",
      ".oa-error{color:#dc2626;font-size:0.8rem;margin:0 0 0.75rem}",
      ".oa-link{background:none;border:0;color:var(--leafdeep,#15803d);text-decoration:underline;cursor:pointer;font:inherit;padding:0.25rem 0;margin-top:0.5rem}",
    ].join("\n");

    if (!document.getElementById(STYLE_ID)) {
      const style = document.createElement("style");
      style.id = STYLE_ID;
      style.textContent = CSS;
      document.head.appendChild(style);
    }

    function loadJsPdf(cb) {
      if (jspdfLoaded) return cb(true);
      if (jspdfLoading) return;
      jspdfLoading = true;
      const s = document.createElement("script");
      s.src = SCRIPT_SRC;
      s.onload = function () {
        jspdfLoaded = true;
        jspdfLoading = false;
        cb(true);
      };
      s.onerror = function () {
        jspdfLoading = false;
        cb(false);
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

    function renderForm() {
      subEl.textContent = "Renseignez vos informations pour pré-remplir l'offre.";
      const price = (DATA.kpi && DATA.kpi.price) || "";
      body.innerHTML = [
        '<form id="oa-form" novalidate>',
        '  <div class="oa-field"><label for="oa-fullName">Nom et prénom *</label>',
        '    <input id="oa-fullName" name="fullName" type="text" autocomplete="name" required></div>',
        '  <div class="oa-field"><label for="oa-address">Adresse</label>',
        '    <input id="oa-address" name="address" type="text" autocomplete="street-address"></div>',
        '  <div class="oa-field"><label for="oa-phone">Téléphone</label>',
        '    <input id="oa-phone" name="phone" type="tel" autocomplete="tel"></div>',
        '  <div class="oa-field"><label for="oa-email">Email</label>',
        '    <input id="oa-email" name="email" type="email" autocomplete="email"></div>',
        '  <div class="oa-field"><label for="oa-offerPrice">Prix proposé</label>',
        '    <input id="oa-offerPrice" name="offerPrice" type="text" value="' +
          (price ? price.replace(/"/g, "&quot;") : "") + '"></div>',
        '  <div class="oa-field"><label for="oa-conditions">Conditions particulières</label>',
        '    <textarea id="oa-conditions" name="conditions" rows="3"></textarea></div>',
        '  <div class="oa-field"><label for="oa-validity">Validité de l\'offre en jours</label>',
        '    <input id="oa-validity" name="validityDays" type="number" min="1" value="10"></div>',
        '  <div class="oa-modal__actions">',
        '    <button type="submit" class="oa-btn oa-btn--primary">Générer le PDF</button>',
        '    <button type="button" class="oa-link" id="oa-back">← Retour</button>',
        "  </div>",
        "</form>",
      ].join("");
      const form = body.querySelector("#oa-form");
      const fullName = form.querySelector("#oa-fullName");
      form.querySelector("#oa-back").addEventListener("click", renderChoice);
      fullName.focus();
      form.addEventListener("submit", function (e) {
        e.preventDefault();
        clearError(errorEl);
        fullName.removeAttribute("aria-invalid");
        const value = fullName.value.trim();
        if (!value) {
          fullName.setAttribute("aria-invalid", "true");
          showError(errorEl, "Le nom et prénom sont requis.");
          fullName.focus();
          return;
        }
        const buyerData = {
          fullName: value,
          address: form.querySelector("#oa-address").value.trim(),
          phone: form.querySelector("#oa-phone").value.trim(),
          email: form.querySelector("#oa-email").value.trim(),
          offerPrice: form.querySelector("#oa-offerPrice").value.trim(),
          conditions: form.querySelector("#oa-conditions").value.trim(),
          validityDays: parseInt(form.querySelector("#oa-validity").value, 10),
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

    // Hook next to the print button
    const printBtn = document.querySelector('button[onclick="window.print()"]');
    if (printBtn) {
      const offreBtn = document.createElement("button");
      offreBtn.className = printBtn.className;
      offreBtn.innerHTML = "✍ <span class=\"hidden sm:inline\">Offre</span>";
      offreBtn.setAttribute("aria-label", "Générer une offre d'achat (PDF)");
      offreBtn.addEventListener("click", function () {
        openModal(offreBtn);
      });
      printBtn.insertAdjacentElement("afterend", offreBtn);
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
