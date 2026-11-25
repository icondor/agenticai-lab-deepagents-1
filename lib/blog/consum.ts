// lib/blog/consum.ts
//
// ===========================================================================
// CAT A COSTAT SI CAT DE PLIN E CONTEXTUL
// ===========================================================================
//
// Trei masuratori, din mesajele intoarse de agent:
//
// 1. consumDin: apeluri de model si tokeni (copiat din Lab 14).
//    Fiecare raspuns al modelului (AIMessage) are usage_metadata.
//
// 2. contextPePas (NOU in Lab 15): cat de mare a fost contextul trimis
//    modelului la fiecare pas. Din usage_metadata.input_tokens, daca exista.
//    Altfel (modele false, unii provideri), il ESTIMAM: caracterele
//    mesajelor de pana atunci, impartite la 4.
//    Atentie: estimarea NU include system prompt-ul si nici descrierile
//    tools-urilor, deci e mai mica decat realitatea (vezi lib/blog/agenti.ts,
//    «De unde vine costul unui Deep Agent»).
//
// 3. costRulare (NOU in Lab 15): dolari, apel cu apel, cu preturile din
//    lib/cost.ts. Calculam PE APEL, nu din totaluri, pentru ca un pret poate
//    avea prag pe marimea cererii (claude-haiku-5-5: x5 peste 100.000 de tokeni).
//    Cu modele false nu exista usage_metadata, deci costul iese 0 ("n/a").
//    Tine cont de PROMPT CACHING: tokenii cititi din cache (mult mai ieftini)
//    si scrisi in cache (putin mai scumpi), din usage_metadata.input_token_details.
//    CAPCANA: input_tokens INCLUDE tokenii din cache. Daca ii taxezi pe toti la
//    pret plin, costul unui Deep Agent pe Anthropic iese umflat.

import type { BaseMessage } from "@langchain/core/messages";
import { calculateCost } from "../cost";

export type Consum = Record<string, { apeluri: number; tokeni: number }>;

type CuUsage = {
  usage_metadata?: {
    input_tokens?: number;
    output_tokens?: number;
    total_tokens?: number;
    input_token_details?: { cache_read?: number; cache_creation?: number };
  };
};

/** Consumul unui agent, din mesajele intoarse de el. */
export function consumDin(agent: string, mesaje: BaseMessage[]): Consum {
  const ai = mesaje.filter((m) => m.getType() === "ai");
  const tokeni = ai.reduce((total, m) => total + ((m as CuUsage).usage_metadata?.total_tokens ?? 0), 0);
  return { [agent]: { apeluri: ai.length, tokeni } };
}

/** Aduna doua consumuri. */
export function aduna(a: Consum, b: Consum): Consum {
  const rezultat: Consum = { ...a };
  for (const [agent, v] of Object.entries(b)) {
    const vechi = rezultat[agent] ?? { apeluri: 0, tokeni: 0 };
    rezultat[agent] = { apeluri: vechi.apeluri + v.apeluri, tokeni: vechi.tokeni + v.tokeni };
  }
  return rezultat;
}

export type Context = { tokeniPePas: number[]; estimat: boolean };

/**
 * Marimea contextului la fiecare apel de model.
 * Pasul i = al i-lea raspuns al modelului; contextul lui = tot ce era inainte.
 */
export function contextPePas(mesaje: BaseMessage[]): Context {
  const tokeniPePas: number[] = [];
  let estimat = false;
  let caractere = 0;
  for (const m of mesaje) {
    if (m.getType() === "ai") {
      const reali = (m as CuUsage).usage_metadata?.input_tokens;
      if (reali) {
        tokeniPePas.push(reali);
      } else {
        estimat = true;
        tokeniPePas.push(Math.round(caractere / 4));
      }
    }
    // Ce intra in context: textul mesajului + argumentele tool calls (de exemplu
    // tot articolul trimis la write_file sta in istoric, ca argument).
    const apeluri = (m as { tool_calls?: { args: unknown }[] }).tool_calls ?? [];
    caractere += m.text.length + apeluri.reduce((s, a) => s + JSON.stringify(a.args).length, 0);
  }
  return { tokeniPePas, estimat };
}

export type Cost = {
  model: string;
  tokeniInput: number;
  tokeniOutput: number;
  /** Cati din tokeniInput au fost cititi din cache, respectiv scrisi in cache. */
  tokeniCacheCititi: number;
  tokeniCacheScrisi: number;
  dolari: number;
  /** Ce parte din cost a venit din input (context), intre 0 si 1. */
  procentInput: number;
};

/** Costul unei rulari: suma costurilor pe fiecare apel de model. */
export function costRulare(model: string, mesaje: BaseMessage[]): Cost {
  let tokeniInput = 0;
  let tokeniOutput = 0;
  let dolari = 0;
  let dolariInput = 0;
  let tokeniCacheCititi = 0;
  let tokeniCacheScrisi = 0;
  for (const m of mesaje) {
    if (m.getType() !== "ai") continue;
    const usage = (m as CuUsage).usage_metadata;
    const intrare = usage?.input_tokens ?? 0;
    const iesire = usage?.output_tokens ?? 0;
    const cache = { cititi: usage?.input_token_details?.cache_read ?? 0, scrisi: usage?.input_token_details?.cache_creation ?? 0 };
    tokeniInput += intrare;
    tokeniOutput += iesire;
    tokeniCacheCititi += cache.cititi;
    tokeniCacheScrisi += cache.scrisi;
    dolari += calculateCost(model, intrare, iesire, cache);
    dolariInput += calculateCost(model, intrare, 0, cache);
  }
  return { model, tokeniInput, tokeniOutput, tokeniCacheCititi, tokeniCacheScrisi, dolari, procentInput: dolari > 0 ? dolariInput / dolari : 0 };
}
