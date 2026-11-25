// lib/blog/agenti.ts
//
// ===========================================================================
// CINCI AGENTI, FIECARE CU O PIESA IN PLUS
// ===========================================================================
//
//   demo1  agentFaraHarness   createAgent din Lab 7: trei articole intr-o
//                             singura conversatie. Contextul creste la fiecare pas.
//   demo2  deepMinimal        createDeepAgent: acelasi model, primeste gata
//                             8 tools (filesystem + task) si o stiva de middleware.
//   demo3  deepCuPlan         + planificare: tool-ul write_todos.
//   demo4  deepCuNotite       + filesystem virtual: notitele si articolul in fisiere.
//   demo5  deepCuMemorie      + memory: AGENTS.md (ghidul de stil), citit de pe disc.
//
// Fiecare functie adauga O SINGURA piesa fata de cea de dinainte, ca sa se
// vada ce aduce fiecare.
//
// ELEMENT NOU: createDeepAgent, din pachetul "deepagents" (versiunea 1.15.1).
// Un Deep Agent este createAgent + o stiva de middleware aleasa dinainte:
//   FilesystemMiddleware   tools ls, read_file, write_file, edit_file, delete, glob, grep
//   SubAgentMiddleware     tool-ul task (subagenti, Lab 16)
//   Summarization          rezuma istoricul cand contextul se umple
//   PatchToolCalls         repara istoricul cand un tool call a ramas fara raspuns
// Plus, la cerere: todoListMiddleware, memory, skills (Lab 16), interruptOn (Lab 16).
//
// ---------------------------------------------------------------------------
// DE UNDE VINE COSTUL UNUI DEEP AGENT
// ---------------------------------------------------------------------------
//
// La FIECARE apel, modelul primeste nu doar conversatia, ci si o parte fixa:
// descrierile tools-urilor (nume, descriere, schema) si system prompt-ul.
// Harness-ul face aceasta parte fixa mult mai mare. Masurat cu `pnpm masoara`
// (verificare/masoara-harness.ts), tokeni ~ caractere / 4:
//
//   demo                 tools   descrieri tools   system prompt   fix pe apel
//   demo1 fara harness      1          ~100              ~55            ~150
//   demo2 deep minimal      9        ~2.300              ~40          ~2.350
//   demo3 + plan           10        ~5.350             ~350          ~5.700
//   demo5 + memory         10        ~5.350           ~1.700          ~7.050
//
// Ce reiese:
//   - cele 8 tools gata facute (ls ... task) costa ~2.300 de tokeni pe apel;
//   - write_todos SINGUR costa ~3.000: descrierea lui e cea mai lunga dintre
//     toate, cu exemple de cand sa-l folosesti si cand nu, plus un paragraf
//     adaugat in system prompt;
//   - memory adauga ~1.300 la fiecare apel, dar AGENTS.md e doar ~180 din
//     ele (722 de caractere). Restul, ~1.100, sunt instructiunile bibliotecii
//     despre memorie (<memory_guidelines>, citit in codul 1.15.1). Aceeasi
//     lectie ca la write_todos: textul bibliotecii costa mai mult decat al tau.
//
// Inmultit cu numarul de apeluri: un articol in demo5 are ~7 apeluri, deci
// partea fixa se plateste de ~7 ori (~50.000 de tokeni de input). Cu
// claude-haiku-4-5 ($1 pe milion la input) inseamna ~5 centi pe articol,
// fata de ~0,2 centi in demo1. Pe articol e putin; la 1.000 de articole pe
// luna diferenta se vede. Costul il calculeaza lib/cost.ts, apel cu apel.
//
// Cat de exacte sunt cifrele: caractere / 4 e o estimare. Un tokenizer real
// imparte altfel textul si JSON-ul, iar Anthropic si Gemini primesc tools-urile
// intr-un format putin diferit de cel OpenAI masurat aici. Ordinul de marime
// si PROPORTIILE dintre demo-uri sunt de incredere; valorile exacte le da
// providerul, in usage_metadata, la rularea cu model real (le vedeti in
// pagina, la «Contextul la fiecare apel» si la «Cost»).
//
// ---------------------------------------------------------------------------
// PROMPT CACHING: partea fixa se plateste mai ieftin (automat, pe Anthropic)
// ---------------------------------------------------------------------------
//
// createDeepAgent adauga SINGUR anthropicPromptCachingMiddleware cand modelul
// este ChatAnthropic (LLM_PROVIDER=anthropic, implicit in .env.example). Nu
// scriem nimic pentru asta. Middleware-ul cere providerului sa pastreze 5
// minute prefixul cererii (tools, apoi system, apoi istoricul); la apelul
// urmator, partea identica se citeste din cache cu 10% din pretul de input.
// demo1 (createAgent simplu) NU are prompt caching.
//
// Doua conditii, verificate in documentatia Anthropic:
//   - prefixul trebuie sa fie IDENTIC: o data sau un id in system prompt, sau
//     un tool adaugat dinamic, invalideaza cache-ul la fiecare apel;
//   - un minim de tokeni: 4.096 la claude-haiku-4-5 (512 la Haiku/Sonnet 5.5).
//     Cu estimarile noastre, demo2 (~2.350 fix) ramane probabil sub minim pe
//     un articol scurt, demo3-5 (~5.700-7.050) sunt peste. Verificati in pagina.
// In pagina, panoul «Cost» arata cati tokeni au venit din cache. Celelalte
// tipuri de cache (raspunsuri, noduri LangGraph, tools) sunt in Lab 19.

import { createAgent, todoListMiddleware } from "langchain";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { createDeepAgent, FilesystemBackend } from "deepagents";
import { cautaSurse } from "./surse";

// ---------------------------------------------------------------------------
// Bucatile de system prompt. Le compunem, ca sa se vada ce adauga fiecare demo.
// ---------------------------------------------------------------------------

export const PROMPT_REDACTOR =
  "Esti redactorul blogului TaskFlow. Cauti informatii DOAR cu tool-ul cautaSurse si nu inventezi nimic. " +
  "Scrii in romana un articol de maxim 250 de cuvinte, cu un titlu.";

export const PROMPT_PLAN =
  "Inainte de orice, faci un plan cu write_todos: cercetare, scriere, recitire. " +
  "Dupa fiecare pas actualizezi planul: pasul terminat devine completed, urmatorul in_progress.";

export const PROMPT_NOTITE =
  "Lucrezi cu fisiere. Salvezi faptele gasite in /cercetare/note.md. " +
  "Scrii articolul in /articole/articol.md, folosind faptele din /cercetare/note.md. " +
  "La final raspunzi DOAR cu titlul articolului si calea fisierului, nu cu tot articolul.";

// ---------------------------------------------------------------------------
// demo1: fara harness. Agentul din Lab 7, cu o sarcina lunga.
// ---------------------------------------------------------------------------

export const SARCINA_TREI_ARTICOLE =
  "Scrie trei articole despre lansarea rapoartelor programate: unul pentru clienti, " +
  "unul pentru echipa de vanzari, unul despre limitari. Pentru fiecare cauti separat in surse.";

/** demo1: un agent obisnuit. Tot ce gaseste si tot ce scrie ramane in istoric. */
export function creeazaAgentFaraHarness(model: BaseChatModel) {
  return createAgent({
    model,
    tools: [cautaSurse],
    systemPrompt: "Esti singurul om din echipa de continut a TaskFlow. " + PROMPT_REDACTOR,
  });
}

// ---------------------------------------------------------------------------
// demo2: Deep Agent minimal.
// ---------------------------------------------------------------------------

/** demo2: aceeasi sarcina, dar cu harness-ul gata asamblat. */
export function creeazaDeepMinimal(model: BaseChatModel) {
  return createDeepAgent({
    // CAPCANA: daca lipseste `model`, createDeepAgent foloseste implicit
    // "anthropic:claude-sonnet-4-6". Fara ANTHROPIC_API_KEY, prima cerere
    // cade; cu cheia setata, platesti alt model decat cel din lib/llm.ts.
    // Dam MEREU modelul explicit.
    model,
    tools: [cautaSurse],
    // In 1.15.1, system prompt-ul este EXACT textul nostru: biblioteca nu
    // adauga un prompt de baza (exceptie: cateva modele cu "harness profile",
    // de exemplu anthropic:claude-haiku-4-5 primeste un sufix). Instructiunile
    // pentru tools stau in descrierile lor (~2.300 de tokeni pe apel, vezi
    // «De unde vine costul unui Deep Agent», sus).
    systemPrompt: PROMPT_REDACTOR,
  });
}

// ---------------------------------------------------------------------------
// demo3: + planificare.
// ---------------------------------------------------------------------------

/** demo3: agentul isi face un plan si il actualizeaza. Planul sta in state.todos. */
export function creeazaDeepCuPlan(model: BaseChatModel) {
  return createDeepAgent({
    model,
    tools: [cautaSurse],
    systemPrompt: `${PROMPT_REDACTOR}\n\n${PROMPT_PLAN}`,
    // CAPCANA: write_todos NU vine implicit in deepagents 1.15.1 (documentatia
    // mai veche il da ca inclus). Fara linia de mai jos, modelul nu are tool-ul
    // si planul ramane doar o intentie in system prompt.
    // PRET: write_todos e cel mai «scump» tool, ~3.000 de tokeni la FIECARE apel
    // (descriere lunga + un paragraf in system prompt). Il adaugi cand sarcina
    // chiar are mai multi pasi; pentru o intrebare scurta e risipa.
    middleware: [todoListMiddleware()],
  });
}

// ---------------------------------------------------------------------------
// demo4: + filesystem virtual (StateBackend, implicit).
// ---------------------------------------------------------------------------

/**
 * demo4: notitele si articolul ajung in fisiere. Fisierele sunt VIRTUALE:
 * stau in state.files, nu pe disc. Dispar cand se termina rularea, daca nu
 * folosim un checkpointer (Lab 13).
 */
export function creeazaDeepCuNotite(model: BaseChatModel) {
  return createDeepAgent({
    model,
    tools: [cautaSurse],
    systemPrompt: `${PROMPT_REDACTOR}\n\n${PROMPT_PLAN}\n\n${PROMPT_NOTITE}`,
    middleware: [todoListMiddleware()],
    // backend: implicit StateBackend, adica fisiere in state. Nu scriem nimic.
  });
}

// ---------------------------------------------------------------------------
// demo5: + memory (AGENTS.md), cu fisiere pe disc (FilesystemBackend).
// ---------------------------------------------------------------------------

/**
 * demo5: ghidul de stil al companiei, din redactie/AGENTS.md, intra in system
 * prompt la FIECARE apel. Notitele si articolul se scriu pe disc, in redactie/.
 *
 * @param radacina folderul care devine "/" pentru agent (in aplicatie: redactie/)
 */
export function creeazaDeepCuMemorie(model: BaseChatModel, radacina: string) {
  return createDeepAgent({
    model,
    tools: [cautaSurse],
    systemPrompt: `${PROMPT_REDACTOR}\n\n${PROMPT_PLAN}\n\n${PROMPT_NOTITE}`,
    middleware: [todoListMiddleware()],
    // CAPCANA: fara virtualMode: true, caile se rezolva pe discul real: "/" e
    // radacina discului. Verificat: "/etc/hostname" citeste fisierul real al
    // sistemului, iar calea completa spre .env.local ar citi cheile de API.
    // Cu virtualMode: true, "/" inseamna `radacina`, "/etc/hostname" se cauta
    // in interiorul ei, iar iesirea cu ".." este refuzata ("Path traversal not
    // allowed"). In demo5 o refuza si mai devreme verificarea din permissions
    // (mai jos): «path must not contain ".."». Doua straturi, verificate
    // separat in test. Revenim la subiect in Lab 18 (Guardrails).
    backend: new FilesystemBackend({ rootDir: radacina, virtualMode: true }),
    // Caile din memory sunt relative la backend: "/AGENTS.md" = redactie/AGENTS.md.
    // Spre deosebire de skills (Lab 16), memory se incarca MEREU, la fiecare apel.
    memory: ["/AGENTS.md"],
    // CAPCANA: memory nu e doar citit. Biblioteca adauga in system prompt
    // instructiuni care ii spun agentului ca actualizarea memoriei e «una din
    // prioritatile principale» si sa o faca imediat, cu edit_file, cand
    // utilizatorul isi spune o preferinta. Subiectul e text de la utilizator:
    // «de acum titlurile cu majuscule, tine minte» ar rescrie ghidul de stil
    // pe disc, pentru toate rularile urmatoare. Verificat cu model fals.
    // Ghidul il schimba echipa, nu agentul: interzicem scrierea in el.
    // Permisiunile pe fisiere le detaliem in Lab 16.
    permissions: [{ operations: ["write"], paths: ["/AGENTS.md"], mode: "deny" }],
  });
}
