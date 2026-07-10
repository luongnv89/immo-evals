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

const MIN_BYTES = 3 * 1024;

const sampleReport = {
  title: "Appartement T2 — Versailles",
  date: "2026-06-18",
  url: "https://example.com/annonce",
  price: "285 000 €",
  surface: "42 m²",
  type: "Appartement",
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
  senderName: "Jean Dupont",
  senderAddress: "12 rue de la Paix",
  senderCity: "78000 Versailles",
  agencyName: "AGENCE IMMOBILIERE ROMY",
  agencyAddress: "71 rue de la Paroisse\n78000 VERSAILLES",
  propertyAddress: "4 rue Philippe de Dangeau",
  propertyCity: "Versailles",
  propertyDesignation: "42 m² — Appartement T2",
  offerPrice: "280 000 €",
  financing: "Apport personnel + prêt bancaire",
  validityDate: "20/07/2026",
  buyers: [
    {
      civilite: "Monsieur",
      prenom: "Jean",
      nom: "Dupont",
      adresse: "12 rue de la Paix, 78000 Versailles",
      dateNaissance: "01/01/1980",
      lieuNaissance: "Paris",
    },
    {
      civilite: "Madame",
      prenom: "Marie",
      nom: "Dupont",
      adresse: "12 rue de la Paix, 78000 Versailles",
      dateNaissance: "02/02/1982",
      lieuNaissance: "Lyon",
    },
  ],
});
const filledSize = pdfByteLength(filledDoc);
if (filledSize <= MIN_BYTES) {
  console.error(`FAIL pre-filled PDF too small: ${filledSize} bytes (min ${MIN_BYTES})`);
  process.exit(1);
}

console.log(`OK blank PDF ${blankSize} bytes, pre-filled ${filledSize} bytes`);
