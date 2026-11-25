// lib/blog/fisiere.ts
//
// ===========================================================================
// CE FISIERE A SCRIS AGENTUL: din state (demo4) sau de pe disc (demo5)
// ===========================================================================
//
// Doua backend-uri, doua locuri unde cauti fisierele:
//   StateBackend (implicit)  state.files = { "/cercetare/note.md": { content, ... } }
//   FilesystemBackend        fisiere reale, sub folderul radacina (redactie/)
//
// CAPCANA: content-ul unui fisier din state nu are mereu aceeasi forma.
// Fisierele scrise de agent in 1.15.1 au content string; formatul mai vechi
// (inca acceptat la intrare) este o lista de linii. Le tratam pe amandoua.

import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

export type Fisier = { cale: string; text: string };

type FisierDinState = { content: string | string[] };

/** demo2-demo4: fisierele virtuale, din state.files. */
export function fisiereDinState(files: Record<string, FisierDinState> | undefined): Fisier[] {
  return Object.entries(files ?? {})
    .map(([cale, f]) => ({ cale, text: Array.isArray(f.content) ? f.content.join("\n") : f.content }))
    .sort((a, b) => a.cale.localeCompare(b.cale));
}

/** demo5: fisierele de pe disc, cu cai afisate ca pentru agent ("/" = radacina). */
export function fisiereDePeDisc(radacina: string): Fisier[] {
  const rezultat: Fisier[] = [];
  const parcurge = (folder: string) => {
    for (const nume of readdirSync(folder)) {
      const complet = path.join(folder, nume);
      if (statSync(complet).isDirectory()) parcurge(complet);
      else rezultat.push({ cale: "/" + path.relative(radacina, complet).split(path.sep).join("/"), text: readFileSync(complet, "utf8") });
    }
  };
  parcurge(radacina);
  return rezultat.sort((a, b) => a.cale.localeCompare(b.cale));
}
