/** Build mailto CTA for trying bien-evaluator with listing URL placeholder. */
(function () {
  const EMAIL = "contact.nguyen.fr@gmail.com";
  const SUBJECT = "Demande d'évaluation bien-evaluator";
  const BODY = [
    "Bonjour,",
    "",
    "Je souhaite tester le service bien-evaluator.",
    "",
    "URL de l'annonce qui m'intéresse :",
    "",
    "(Collez ici le lien LeBonCoin, SeLoger, PAP ou Bien'ici)",
    "",
    "Merci,",
  ].join("\n");

  function mailtoHref() {
    const params = new URLSearchParams({
      subject: SUBJECT,
      body: BODY,
    });
    return "mailto:" + EMAIL + "?" + params.toString();
  }

  document.querySelectorAll("[data-mailto-cta]").forEach(function (el) {
    el.setAttribute("href", mailtoHref());
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