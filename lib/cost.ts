// lib/cost.ts
//
// ===========================================================================
// CAT COSTA UN APEL DE MODEL (pornit din lib/cost.ts din Lab 4)
// ===========================================================================
//
// Formula, pentru UN apel:
//   cost = tokeni_input / 1.000.000 x pret_input + tokeni_output / 1.000.000 x pret_output
//
// La un agent, formula se aplica la FIECARE apel de model, iar tokenii de
// input inseamna TOT contextul trimis la acel apel: system prompt, descrierile
// tools-urilor, tot istoricul. De aceea, la agenti, inputul domina costul.
//
// Preturi in dolari pe milion de tokeni, standard (fara cache, fara batch).
//   Anthropic: verificat pe platform.claude.com/docs/en/about-claude/pricing, 1 noiembrie 2026.
//   OpenAI, Google, xAI: copiate din Lab 4 (iunie-iulie 2026), NEVERIFICATE de atunci.
//   Verificati providerii inainte de a da cifre in sala:
//     https://openai.com/api/pricing
//     https://ai.google.dev/gemini-api/docs/pricing
//     https://docs.x.ai
//
// NOU fata de Lab 4: pretul poate avea un PRAG pe lungimea prompt-ului.
// claude-haiku-5-5 costa $0.10 / $0.50 pana la 100.000 de tokeni de input
// si $0.50 / $2.50 peste (de 5 ori mai mult). Pragul se aplica PE CERERE:
// fiecare apel de model se taxeaza separat, dupa marimea lui. Un agent al
// carui context creste poate trece pragul la jumatatea sarcinii.
// (Gemini 2.5 Pro si 3.x Pro au si ele praguri, la 200.000; nu le modelam aici.)
//
// NOU: PROMPT CACHING. Providerul pastreaza prefixul cererii (tools, system,
// istoric) cateva minute; la apelul urmator, partea identica se citeste din
// cache, mai ieftin. Anthropic (verificat 1 noiembrie 2026), fata de pretul de input:
//   scriere in cache (5 minute):  x1.25
//   citire din cache:             x0.10  (x0.05 la Opus 5.5 si Sonnet 5.5,
//                                         x0.025 la Fable 5.1 si Mythos 5.1)
// createDeepAgent porneste prompt caching AUTOMAT cand modelul e ChatAnthropic
// (vezi lib/blog/agenti.ts). Fara calculul de mai jos, costul ar iesi umflat.
// Pentru OpenAI, Google, xAI nu avem multiplicatori verificati: tokenii din
// cache se taxeaza la pret plin (estimare pesimista). Detaliile: Lab 19.

type Pret = {
  input: number;
  output: number;
  /** Optional: peste `tokeni` de input, se aplica alt pret, pentru tot apelul. */
  prag?: { tokeni: number; input: number; output: number };
  /** Optional: multiplicatori fata de pretul de input, pentru prompt caching. */
  cache?: { citire: number; scriere: number };
};

const CACHE_ANTHROPIC = { citire: 0.1, scriere: 1.25 };

const PRET_PE_MILION: Record<string, Pret> = {
  // ------------------------------------------------------------------
  // Anthropic (verificat 1 noiembrie 2026). Numele ca in API: cratima, nu punct.
  // ------------------------------------------------------------------
  "claude-fable-5-1": { input: 10, output: 50, cache: { citire: 0.025, scriere: 1.25 } },
  "claude-mythos-5-1": { input: 10, output: 50, cache: { citire: 0.025, scriere: 1.25 } },
  "claude-opus-5-5": { input: 4, output: 20, cache: { citire: 0.05, scriere: 1.25 } },
  "claude-sonnet-5-5": { input: 2, output: 10, cache: { citire: 0.05, scriere: 1.25 } },
  "claude-haiku-5-5": { input: 0.1, output: 0.5, prag: { tokeni: 100_000, input: 0.5, output: 2.5 }, cache: CACHE_ANTHROPIC },
  "claude-fable-5": { input: 10, output: 50, cache: CACHE_ANTHROPIC },
  "claude-mythos-5": { input: 10, output: 50, cache: CACHE_ANTHROPIC },
  "claude-opus-5": { input: 5, output: 25, cache: CACHE_ANTHROPIC },
  "claude-sonnet-5": { input: 2, output: 10, cache: CACHE_ANTHROPIC },
  "claude-opus-4-8": { input: 5, output: 25, cache: CACHE_ANTHROPIC },
  "claude-opus-4-7": { input: 5, output: 25, cache: CACHE_ANTHROPIC },
  "claude-opus-4-6": { input: 5, output: 25, cache: CACHE_ANTHROPIC },
  "claude-opus-4-5": { input: 5, output: 25, cache: CACHE_ANTHROPIC },
  "claude-sonnet-4-6": { input: 3, output: 15, cache: CACHE_ANTHROPIC },
  "claude-sonnet-4-5": { input: 3, output: 15, cache: CACHE_ANTHROPIC },
  "claude-haiku-4-5": { input: 1, output: 5, cache: CACHE_ANTHROPIC }, // modelul implicit din .env.example

  // ------------------------------------------------------------------
  // OpenAI (din Lab 4, neverificat)
  // ------------------------------------------------------------------
  "gpt-5.5": { input: 5, output: 30 },
  "gpt-5.4": { input: 2.5, output: 15 },
  "gpt-5.4-mini": { input: 0.25, output: 2 },
  "gpt-5.4-nano": { input: 0.2, output: 1.25 },
  "gpt-5.2": { input: 1.75, output: 14 },
  "gpt-5": { input: 1.25, output: 10 },
  "gpt-5-nano": { input: 0.05, output: 0.4 },
  "gpt-4.1": { input: 2, output: 8 },
  "gpt-4.1-mini": { input: 0.4, output: 1.6 },
  "gpt-4.1-nano": { input: 0.1, output: 0.4 },
  "gpt-4o": { input: 2.5, output: 10 },
  "gpt-4o-mini": { input: 0.15, output: 0.6 },
  o3: { input: 2, output: 8 },
  "o4-mini": { input: 1.1, output: 4.4 },

  // ------------------------------------------------------------------
  // Google Gemini (din Lab 4, neverificat; prompt-uri sub 200.000 de tokeni)
  // ------------------------------------------------------------------
  "gemini-3.5-flash": { input: 1.5, output: 9 },
  "gemini-3.1-pro": { input: 2, output: 12 },
  "gemini-3.1-flash-lite": { input: 0.25, output: 1.5 },
  "gemini-3-flash": { input: 0.5, output: 3 },
  "gemini-3-flash-lite": { input: 0.25, output: 1.5 },
  "gemini-2.5-pro": { input: 1.25, output: 10 },
  "gemini-2.5-flash": { input: 0.3, output: 2.5 },
  "gemini-2.5-flash-lite": { input: 0.1, output: 0.4 },

  // ------------------------------------------------------------------
  // xAI Grok (din Lab 4, neverificat; prompt-uri sub 200.000 de tokeni)
  // ------------------------------------------------------------------
  "grok-4.5": { input: 2, output: 6 },
  "grok-4.3": { input: 1.25, output: 2.5 },
  "grok-build-0.1": { input: 1, output: 2 },
};

/** Pretul unui model; undefined daca nu e in tabel (sau e local, Ollama). */
export function pretPentru(model: string): Pret | undefined {
  return PRET_PE_MILION[model.toLowerCase()];
}

/** Tokenii de input care au venit din prompt caching (subset din inputTokens). */
export type TokeniCache = { cititi: number; scrisi: number };

/**
 * Costul UNUI apel de model, in dolari. 0 daca modelul nu e in tabel.
 *
 * inputTokens = TOT inputul apelului, inclusiv partea din cache (asa il
 * raporteaza @langchain/anthropic in usage_metadata.input_tokens).
 * cache = cati dintre ei au fost cititi din cache, respectiv scrisi in cache.
 *
 * Exemplu, claude-haiku-4-5, 7.000 de tokeni input, 6.000 cititi din cache:
 *   fara cache:  7.000 x $1/M                       = $0.0070
 *   cu cache:    1.000 x $1/M + 6.000 x $0.10/M     = $0.0016
 */
export function calculateCost(model: string, inputTokens: number, outputTokens: number, cache: TokeniCache = { cititi: 0, scrisi: 0 }): number {
  const pret = pretPentru(model);
  if (!pret) return 0; // model necunoscut sau local: nu stricam UI-ul
  // Pragul se judeca dupa TOT inputul cererii, cu tot cu cache.
  const tarif = pret.prag && inputTokens > pret.prag.tokeni ? pret.prag : pret;
  // Fara multiplicatori verificati: tokenii din cache la pret plin (pesimist).
  const m = pret.cache ?? { citire: 1, scriere: 1 };
  const normali = inputTokens - cache.cititi - cache.scrisi;
  const echivalentInput = normali + cache.cititi * m.citire + cache.scrisi * m.scriere;
  return (echivalentInput / 1_000_000) * tarif.input + (outputTokens / 1_000_000) * tarif.output;
}

/** Afisare: "n/a" pentru 0, altfel dolari cu 6 zecimale (costurile pe apel sunt mici). */
export function formatCost(cost: number): string {
  return cost === 0 ? "n/a" : `$${cost.toFixed(6)}`;
}
