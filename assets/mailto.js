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