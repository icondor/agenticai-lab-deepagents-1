// lib/blog/surse.ts
//
// ===========================================================================
// SURSELE ARTICOLULUI: materiale interne despre o lansare de produs
// ===========================================================================
//
// TaskFlow este o aplicatie fictiva de management de proiecte. Lanseaza o
// functie noua: rapoartele programate. Sursele sunt fixe, locale, ca sa nu
// avem nevoie de o cheie de API pentru cautare pe web si ca articolul sa
// poata fi verificat fata de ele.

import { tool } from "langchain";
import { z } from "zod";

export const SUBIECT_IMPLICIT = "Lansarea rapoartelor programate in TaskFlow";

export const SURSE = [
  {
    id: "note-de-lansare",
    text: "Rapoartele programate: din 3 noiembrie, orice raport din TaskFlow se poate trimite automat pe email, zilnic, saptamanal sau lunar. Formate: PDF si Excel. Disponibil in planurile Pro si Enterprise.",
  },
  {
    id: "interviu-product-manager",
    text: "Product managerul echipei de rapoarte: clientii cereau de un an sa nu mai exporte manual rapoartele in fiecare luni dimineata. Functia a fost construita in 6 saptamani.",
  },
  {
    id: "date-beta",
    text: "Beta cu 120 de firme, timp de 4 saptamani. 78% dintre ele au programat cel putin un raport. Clientii au estimat ca economisesc in medie 2 ore pe saptamana pentru fiecare manager.",
  },
  {
    id: "feedback-clienti",
    text: "Un client beta, firma de distributie: «In sfarsit nu mai uit raportul de vanzari de luni.» Cererea cea mai frecventa: trimitere si pe Slack, nu doar pe email. Este planificata pentru primul trimestru din 2027.",
  },
  {
    id: "limitari",
    text: "Un raport programat poate avea cel mult 10 destinatari. Rapoartele mai mari de 50 MB se trimit ca link, nu ca atasament. Ora de trimitere foloseste fusul orar al contului.",
  },
];

/** Litere mici, fara diacritice: «Săptămâni» -> «saptamani», ca in surse. */
function normalizeaza(text: string) {
  return text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

/**
 * Cauta in surse dupa cuvinte. Fara potriviri, intoarce toate sursele.
 *
 * CAPCANA: \W din JavaScript cunoaste doar literele englezesti. Cu
 * split(/\W+/), «săptămâni» devenea «s», «pt», «m», «ni»: niciun cuvant
 * util, deci toate sursele. Un model care cauta in romana, cu diacritice,
 * primea mereu tot. Mergea, dar cu mai multi tokeni si fara sa se vada.
 */
export function cauta(intrebare: string) {
  const cuvinte = normalizeaza(intrebare).split(/[^a-z0-9]+/).filter((c) => c.length >= 4);
  const gasite = SURSE.filter((s) => cuvinte.some((c) => normalizeaza(s.text).includes(c)));
  return gasite.length > 0 ? gasite : SURSE;
}

/** Tool-ul researcher-ului: singura lui cale spre informatie. */
export const cautaSurse = tool(
  async ({ intrebare }) => cauta(intrebare).map((s) => `[${s.id}] ${s.text}`).join("\n"),
  {
    name: "cautaSurse",
    description: "Cauta in materialele interne despre lansare. Intoarce fragmente, fiecare cu id-ul sursei.",
    schema: z.object({ intrebare: z.string().describe("Ce cauti, in cateva cuvinte") }),
  },
);
