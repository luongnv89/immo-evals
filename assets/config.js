/**
 * Service UI configuration — the contract with meta-app (issue #77/#81,
 * meta-app/dev-docs/report-workflow.md).
 *
 * BEFORE DEPLOYING: set apiBase to the production meta-app origin.
 * For local dev, override ad hoc with ?api=http://127.0.0.1:8000 in the page
 * URL (persisted in localStorage under "immoEvalsApiBase" until ?api=reset).
 */
window.IMMO_EVALS_CONFIG = {
  serviceId: "bien-evaluator",
  apiBase: "https://api.luongnv.com",
  pagesBaseUrl: "https://luongnv.com/immo-evals",
};
