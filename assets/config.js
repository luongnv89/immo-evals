/**
 * Service UI configuration — the contract with meta-app (issue #77,
 * meta-app/dev-docs/report-workflow.md).
 *
 * apiBase is the meta-app origin (no trailing slash). Override per deployment
 * here, or ad hoc with ?api=http://127.0.0.1:8000 in the page URL (persisted
 * in localStorage under "immoEvalsApiBase" until ?api=reset).
 */
window.IMMO_EVALS_CONFIG = {
  serviceId: "bien-evaluator",
  apiBase: "http://127.0.0.1:8000",
  pagesBaseUrl: "https://luongnv.com/immo-evals",
};
