/**
 * Smoke test for buildOffreAchatPdf (Node + jspdf devDependency).
 * Run: npm install && npm run smoke:offre-achat
 */
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const { buildOffreAchatPdf } = require(join(root, "assets/offre-achat.js"));

const { jsPDF } = require("jspdf");

const MIN_BYTES = 6 * 1024;

const sampleReport = {
  title: "Appartement T2 — Versailles",
  date: "2026-06-18",
  url: "https://example.com/annonce",
  kpi: {
    price: "285 000 €",
    surface: "42 m²",
    type: "Appartement",
  },
};

function pdfByteLength(doc) {
  const out = doc.output("arraybuffer");
  return out.byteLength;
}

const blankDoc = buildOffreAchatPdf(jsPDF, sampleReport, {});
const blankSize = pdfByteLength(blankDoc);
if (blankSize <= MIN_BYTES) {
  console.error(`FAIL blank PDF too small: ${blankSize} bytes (min ${MIN_BYTES})`);
  process.exit(1);
}

const filledDoc = buildOffreAchatPdf(jsPDF, sampleReport, {
  fullName: "Jean Dupont",
  address: "12 rue de la Paix, 78000 Versailles",
  phone: "06 12 34 56 78",
  email: "jean@example.com",
  offerPrice: "280 000 €",
  conditions: "Sous réserve de visite",
  validityDays: 10,
});
const filledSize = pdfByteLength(filledDoc);
if (filledSize <= MIN_BYTES) {
  console.error(`FAIL pre-filled PDF too small: ${filledSize} bytes (min ${MIN_BYTES})`);
  process.exit(1);
}

console.log(`OK blank PDF ${blankSize} bytes, pre-filled ${filledSize} bytes`);