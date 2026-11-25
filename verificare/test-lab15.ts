// verificare/test-lab15.ts
//
// ===========================================================================
// VERIFICARE: Lab 15. Fara chei, cu un model fals.
// ===========================================================================
//
// Rulare:  pnpm verifica
//
// Modelul fals isi alege scenariul dupa system prompt (ca in Lab 14) si
// pasul dupa cate raspunsuri a dat deja. Asa verificam MECANISMUL: ce tools
// primeste modelul, ce ajunge in system prompt, unde se scriu fisierele,
// cum creste contextul. Calitatea textelor NU se verifica aici.
//
// CAPCANA (modele false): createDeepAgent cheama bindTools pe model. Un model
// fals trebuie sa aiba bindTools() care intoarce modelul, altfel createDeepAgent
// arunca eroare inainte de primul pas.

import { mkdtempSync, writeFileSync, existsSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { AIMessageChunk, type BaseMessage } from "@langchain/core/messages";
import type { ChatResult } from "@langchain/core/outputs";
import { createDeepAgent, FilesystemBackend } from "deepagents";
import { cauta } from "../lib/blog/surse";
import { contextPePas, costRulare } from "../lib/blog/consum";
import { calculateCost } from "../lib/cost";
import { fisiereDinState, fisiereDePeDisc } from "../lib/blog/fisiere";
import {
  creeazaAgentFaraHarness,
  creeazaDeepMinimal,
  creeazaDeepCuPlan,
  creeazaDeepCuNotite,
  creeazaDeepCuMemorie,
  PROMPT_REDACTOR,
} from "../lib/blog/agenti";
import { creeazaDeepCuLinkedIn } from "../exercitiu/referinta";

let trecute = 0;
let picate = 0;
function verifica(nume: string, conditie: boolean, detaliu?: unknown) {
  if (conditie) {
    trecute++;
    console.log(`  ok    ${nume}`);
  } else {
    picate++;
    console.log(`  PICAT ${nume}${detaliu !== undefined ? `   (${JSON.stringify(detaliu).slice(0, 300)})` : ""}`);
  }
}

type Apel = { name: string; args: Record<string, unknown> };

/** Model fals: scenariul dupa system prompt, pasul dupa numarul de raspunsuri date. */
class ModelPeRoluri extends BaseChatModel {
  // CAPCANA: campul NU se poate numi `tools`. createAgent verifica daca modelul
  // are deja tools legate citind tocmai proprietatea `tools`, si arunca
  // MultipleToolsBoundError.
  toolsPrimite: string[] = [];
  sisteme: string[] = [];
  constructor(private roluri: [string, Apel[][]][]) {
    super({});
  }
  _llmType() {
    return "fals-pe-roluri";
  }
  bindTools(tools: { name?: string }[]) {
    this.toolsPrimite = tools.map((t) => t.name ?? "?");
    return this;
  }
  async _generate(mesaje: BaseMessage[]): Promise<ChatResult> {
    // createAgent trimite system prompt-ul ca lista de blocuri: citim .text, nu content.
    const sistem = mesaje.find((m) => m.getType() === "system")?.text ?? "";
    this.sisteme.push(sistem);
    const [rol, pasi] = this.roluri.find(([cheie]) => sistem.includes(cheie)) ?? ["necunoscut", []];
    const pas = mesaje.filter((m) => m.getType() === "ai").length;
    const apeluri = (pasi[pas] ?? []).map((a, i) => ({ ...a, id: `${rol}-${pas}-${i}`, type: "tool_call" as const }));
    const mesaj = new AIMessageChunk({ content: apeluri.length ? "" : `[${rol}] raspuns final`, tool_calls: apeluri, id: crypto.randomUUID() });
    return { generations: [{ text: String(mesaj.content), message: mesaj }] };
  }
}

const todos = (...statusuri: string[]) => ({
  name: "write_todos",
  args: { todos: ["cercetare", "scriere", "recitire"].map((content, i) => ({ content, status: statusuri[i] })) },
});
const NOTE = "Rapoarte programate din 3 noiembrie [note-de-lansare]. 78% din firmele beta [date-beta].";
const ARTICOL = "# Rapoartele pleaca singure\n\nText scurt.\n\nCe urmeaza: Slack.";

const PASI_CU_FISIERE: Apel[][] = [
  [todos("in_progress", "pending", "pending")],
  [{ name: "cautaSurse", args: { intrebare: "rapoarte programate" } }],
  [{ name: "write_file", args: { file_path: "/cercetare/note.md", content: NOTE } }],
  [{ name: "read_file", args: { file_path: "/cercetare/note.md" } }],
  [{ name: "write_file", args: { file_path: "/articole/articol.md", content: ARTICOL } }],
  [todos("completed", "completed", "completed")],
];

const roluri = (): [string, Apel[][]][] => [
  ["LinkedIn", [...PASI_CU_FISIERE, [{ name: "write_file", args: { file_path: "/articole/linkedin.md", content: "Trei fraze." } }]]],
  ["/cercetare/note.md", PASI_CU_FISIERE],
  ["write_todos", [
    [todos("in_progress", "pending", "pending")],
    [{ name: "cautaSurse", args: { intrebare: "rapoarte programate" } }],
    [todos("completed", "in_progress", "pending")],
  ]],
  ["singurul om", [
    [{ name: "cautaSurse", args: { intrebare: "rapoarte clienti" } }],
    [{ name: "cautaSurse", args: { intrebare: "rapoarte vanzari" } }],
    [{ name: "cautaSurse", args: { intrebare: "limitari destinatari" } }],
  ]],
  ["redactorul", [[{ name: "cautaSurse", args: { intrebare: "rapoarte programate" } }]]],
];

const intrare = { messages: [{ role: "user", content: "Scrie articolul" }] };
const numeTools = (m: BaseMessage[]) => m.filter((x) => x.getType() === "tool").map((x) => (x as { name?: string }).name);
const TOOLS_DEEP = ["ls", "read_file", "write_file", "edit_file", "delete", "glob", "grep", "task"];

/** Un folder temporar, cu AGENTS.md copiat din redactie/, ca sa nu murdarim proiectul. */
function redactieTemporara(): string {
  const dir = mkdtempSync(path.join(tmpdir(), "lab15-"));
  writeFileSync(path.join(dir, "AGENTS.md"), readFileSync(path.join("redactie", "AGENTS.md"), "utf8"));
  return dir;
}

async function main() {
  // Siguranta: `pnpm verifica` nu trebuie sa ajunga NICIODATA la un provider real.
  delete process.env.ANTHROPIC_API_KEY;

  console.log("\nA. Sursele, contextul, fisierele");
  {
    verifica("cauta gaseste fragmente relevante", cauta("rapoarte programate email").length >= 1);
    verifica("cauta: diacriticele nu mai strica cautarea («săptămâni» gaseste doar sursele cu saptamani)", JSON.stringify(cauta("săptămâni").map((s) => s.id)) === '["interviu-product-manager","date-beta"]', cauta("săptămâni").map((s) => s.id));
    const ctx = contextPePas([
      { getType: () => "human", text: "x".repeat(400) },
      { getType: () => "ai", text: "", tool_calls: [{ args: { a: 1 } }] },
      { getType: () => "tool", text: "y".repeat(400) },
      { getType: () => "ai", text: "gata" },
    ] as unknown as BaseMessage[]);
    verifica("contextPePas: fara usage_metadata estimeaza caractere / 4", ctx.estimat && ctx.tokeniPePas[0] === 100 && ctx.tokeniPePas[1] > 200, ctx);
    const f = fisiereDinState({ "/b.md": { content: ["l1", "l2"] }, "/a.md": { content: "text" } });
    verifica("fisiereDinState: sortate si cu ambele formate de content", f[0].cale === "/a.md" && f[1].text === "l1\nl2", f);
  }

  console.log("\nA2. Costul (lib/cost.ts)");
  {
    const aproape = (a: number, b: number) => Math.abs(a - b) < 1e-9;
    verifica("haiku-4-5: 1M input + 1M output = $1 + $5", aproape(calculateCost("claude-haiku-4-5", 1_000_000, 1_000_000), 6));
    verifica("haiku-5-5 sub prag: 100.000 input = $0.01", aproape(calculateCost("claude-haiku-5-5", 100_000, 0), 0.01));
    verifica("haiku-5-5 peste prag: 100.001 input, tot apelul la $0.50/M", aproape(calculateCost("claude-haiku-5-5", 100_001, 0), 0.0500005));
    verifica("model necunoscut sau local: 0, adica n/a", calculateCost("qwen3:8b", 1000, 1000) === 0);
    const ai = (input: number, output: number) => ({ getType: () => "ai", text: "", usage_metadata: { input_tokens: input, output_tokens: output } });
    const c = costRulare("claude-haiku-5-5", [ai(60_000, 1_000), ai(120_000, 1_000)] as unknown as BaseMessage[]);
    // apelul 1: 0.06 x 0.10 + 0.001 x 0.50 = 0.0065;  apelul 2 (peste prag): 0.12 x 0.50 + 0.001 x 2.50 = 0.0625
    verifica("costRulare: pragul se aplica PE APEL, nu pe total", aproape(c.dolari, 0.069) && c.tokeniInput === 180_000, c);
    verifica("costRulare: inputul domina costul (peste 90%)", c.procentInput > 0.9, c.procentInput);

    // Prompt caching (Anthropic): input_tokens INCLUDE tokenii din cache.
    verifica("cache: 7.000 input, 6.000 cititi din cache = $0.0016 (nu $0.0070)", aproape(calculateCost("claude-haiku-4-5", 7_000, 0, { cititi: 6_000, scrisi: 0 }), 0.0016));
    verifica("cache: scrierea in cache costa x1.25: 4.000 scrisi = $0.005", aproape(calculateCost("claude-haiku-4-5", 4_000, 0, { cititi: 0, scrisi: 4_000 }), 0.005));
    verifica("cache: model fara multiplicatori verificati, cache la pret plin", aproape(calculateCost("gpt-4o-mini", 1_000_000, 0, { cititi: 900_000, scrisi: 0 }), 0.15));
    const aiCache = (input: number, citit: number, scris: number) => ({ getType: () => "ai", text: "", usage_metadata: { input_tokens: input, output_tokens: 0, input_token_details: { cache_read: citit, cache_creation: scris } } });
    const cc = costRulare("claude-haiku-4-5", [aiCache(5_000, 0, 5_000), aiCache(6_000, 5_000, 1_000)] as unknown as BaseMessage[]);
    // apel 1: 5.000 x 1.25 = 6.250 echivalent;  apel 2: 5.000 x 0.1 + 1.000 x 1.25 = 1.750;  total 8.000 x $1/M
    verifica("costRulare citeste input_token_details: $0.008 si contorii de cache", aproape(cc.dolari, 0.008) && cc.tokeniCacheCititi === 5_000 && cc.tokeniCacheScrisi === 6_000, cc);
  }

  console.log("\nB. demo1: fara harness, trei articole");
  {
    const r = await creeazaAgentFaraHarness(new ModelPeRoluri(roluri())).invoke(intrare);
    verifica("trei cautari, toate in acelasi istoric", JSON.stringify(numeTools(r.messages)) === '["cautaSurse","cautaSurse","cautaSurse"]', numeTools(r.messages));
    const ctx = contextPePas(r.messages).tokeniPePas;
    verifica("contextul creste la fiecare apel de model", ctx.length === 4 && ctx.every((t, i) => i === 0 || t > ctx[i - 1]), ctx);
  }

  console.log("\nC. demo2: Deep Agent minimal");
  {
    const model = new ModelPeRoluri(roluri());
    const r = await creeazaDeepMinimal(model).invoke(intrare);
    verifica("modelul primeste cautaSurse + cele 8 tools gata facute", JSON.stringify(model.toolsPrimite.sort()) === JSON.stringify(["cautaSurse", ...TOOLS_DEEP].sort()), model.toolsPrimite);
    verifica("fara write_todos: nu vine implicit", !model.toolsPrimite.includes("write_todos"));
    verifica("system prompt-ul este EXACT al nostru (fara prompt de baza ascuns)", model.sisteme[0] === PROMPT_REDACTOR, model.sisteme[0]);
    verifica("bucla e aceeasi ca la createAgent: cauta, apoi raspunde", JSON.stringify(numeTools(r.messages)) === '["cautaSurse"]');
  }

  console.log("\nD. demo3: planificare");
  {
    const model = new ModelPeRoluri(roluri());
    const r = await creeazaDeepCuPlan(model).invoke(intrare);
    verifica("cu todoListMiddleware, modelul are write_todos", model.toolsPrimite.includes("write_todos"), model.toolsPrimite);
    const plan = (r as { todos?: { content: string; status: string }[] }).todos ?? [];
    verifica("planul sta in state.todos, cu ultima versiune", plan.map((t) => t.status).join(",") === "completed,in_progress,pending", plan);
  }

  console.log("\nE. demo4: filesystem virtual (StateBackend)");
  {
    const r = await creeazaDeepCuNotite(new ModelPeRoluri(roluri())).invoke(intrare);
    const fisiere = fisiereDinState((r as { files?: Record<string, { content: string | string[] }> }).files);
    verifica("doua fisiere in state: notitele si articolul", JSON.stringify(fisiere.map((f) => f.cale)) === '["/articole/articol.md","/cercetare/note.md"]', fisiere.map((f) => f.cale));
    verifica("articolul din fisier e cel scris de agent", fisiere[0].text === ARTICOL);
    const citit = r.messages.find((m) => (m as { name?: string }).name === "read_file");
    // CAPCANA: raspunsul lui read_file e o lista de blocuri, cu un antet
    // "@@ lines 1-1 of 1 @@". String(content) da "[object Object]": citim .text.
    verifica("read_file intoarce notitele, cu antetul de linii", (citit?.text ?? "").startsWith("@@ lines") && (citit?.text ?? "").includes("[date-beta]"), citit?.text);
    // Verificam acolo unde ar ajunge cu FilesystemBackend: in redactie/ (demo5).
    // Testul porneste cu un folder redactie/ fara note.md doar daca nu ai rulat
    // demo5 din pagina; de aceea comparam data fisierului, nu existenta lui.
    const notePeDisc = path.join("redactie", "cercetare", "note.md");
    const inainte = existsSync(notePeDisc) ? statSync(notePeDisc).mtimeMs : 0;
    await creeazaDeepCuNotite(new ModelPeRoluri(roluri())).invoke(intrare);
    const dupa = existsSync(notePeDisc) ? statSync(notePeDisc).mtimeMs : 0;
    verifica("nimic pe disc: StateBackend tine fisierele doar in state (redactie/ neatins)", inainte === dupa);
  }

  console.log("\nF. demo5: memory + FilesystemBackend");
  {
    const dir = redactieTemporara();
    try {
      const model = new ModelPeRoluri(roluri());
      await creeazaDeepCuMemorie(model, dir).invoke(intrare);
      verifica("AGENTS.md intra in system prompt la fiecare apel", model.sisteme.length > 1 && model.sisteme.every((s) => s.includes("GHIDUL DE STIL")), model.sisteme.length);
      verifica("fisierele ajung pe disc, sub radacina", existsSync(path.join(dir, "cercetare", "note.md")) && readFileSync(path.join(dir, "articole", "articol.md"), "utf8") === ARTICOL);
      const caiPeDisc = fisiereDePeDisc(dir).map((f) => f.cale);
      verifica("fisiereDePeDisc afiseaza caile ca agentul: /AGENTS.md, /articole/..., /cercetare/...", JSON.stringify(caiPeDisc) === '["/AGENTS.md","/articole/articol.md","/cercetare/note.md"]', caiPeDisc);

      // CAPCANA virtualMode: incercam sa iesim din radacina cu "..".
      const evadare = new ModelPeRoluri([["/cercetare/note.md", [[{ name: "write_file", args: { file_path: "/../evadare.md", content: "nu" } }]]]]);
      const r = await creeazaDeepCuMemorie(evadare, dir).invoke(intrare);
      const raspunsTool = r.messages.find((m) => m.getType() === "tool")?.text ?? "";
      console.log(`        (raspunsul tool-ului: ${raspunsTool.slice(0, 90)})`);
      // In demo5 refuza intai permissions (valideaza calea), apoi ar refuza virtualMode.
      verifica("demo5: scrierea in afara radacinii e refuzata (permissions: «path must not contain ..»)", !existsSync(path.join(dir, "..", "evadare.md")) && /must not contain/i.test(raspunsTool), raspunsTool);
      // virtualMode singur, fara permissions: al doilea strat tine si el.
      const doarVirtual = createDeepAgent({ model: new ModelPeRoluri([["x", [[{ name: "write_file", args: { file_path: "/../evadare.md", content: "nu" } }]]]]), systemPrompt: "x", backend: new FilesystemBackend({ rootDir: dir, virtualMode: true }) });
      const r3 = await doarVirtual.invoke(intrare);
      const raspunsVirtual = r3.messages.find((m) => m.getType() === "tool")?.text ?? "";
      verifica("virtualMode singur: «Path traversal not allowed»", !existsSync(path.join(dir, "..", "evadare.md")) && /Path traversal not allowed/.test(raspunsVirtual), raspunsVirtual);

      // CAPCANA memory: biblioteca ii cere agentului sa-si actualizeze memoria.
      // Un subiect ca «de acum titlurile cu majuscule, tine minte» il impinge
      // sa editeze AGENTS.md. Permisiunea din creeazaDeepCuMemorie o refuza.
      const ghid = readFileSync(path.join(dir, "AGENTS.md"), "utf8");
      const rescrie = new ModelPeRoluri([["/cercetare/note.md", [[{ name: "edit_file", args: { file_path: "/AGENTS.md", old_string: "## Ton", new_string: "## Ton\n- Titlurile cu MAJUSCULE." } }]]]]);
      const r2 = await creeazaDeepCuMemorie(rescrie, dir).invoke(intrare);
      const raspunsEdit = r2.messages.find((m) => m.getType() === "tool")?.text ?? "";
      verifica("memory: agentul NU poate rescrie AGENTS.md (permission denied), fisierul ramane neatins", /permission denied/i.test(raspunsEdit) && readFileSync(path.join(dir, "AGENTS.md"), "utf8") === ghid, raspunsEdit);
      verifica("memory: biblioteca chiar ii cere sa-si actualizeze memoria cu edit_file", (rescrie.sisteme[0] ?? "").includes("MAIN PRIORITIES") && (rescrie.sisteme[0] ?? "").includes("edit_file"));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }

  console.log("\nG. Capcana: createDeepAgent fara model");
  {
    let eroare = "";
    try {
      await createDeepAgent({ systemPrompt: "x" }).invoke(intrare);
    } catch (e) {
      eroare = e instanceof Error ? e.message : String(e);
    }
    verifica("fara model si fara cheie Anthropic: cade (modelul implicit e Anthropic)", /anthropic/i.test(eroare), eroare.slice(0, 120));
  }

  console.log("\nG2. Capcana: agentul care nu se mai opreste (optiunile din app/api/blog/route.ts)");
  {
    // Un model care cauta la nesfarsit. Fara limite, createDeepAgent l-ar lasa
    // pana la recursionLimit 10.000.
    const inCerc = () => new ModelPeRoluri([["redactorul", Array.from({ length: 10_000 }, () => [{ name: "cautaSurse", args: { intrebare: "rapoarte" } }])]]);
    let apeluri = 0;
    const numara = { handleLLMStart: () => void apeluri++ };
    let eroare = "";
    try {
      await creeazaDeepMinimal(inCerc()).invoke(intrare, { recursionLimit: 100, callbacks: [numara] });
    } catch (e) {
      eroare = e instanceof Error ? e.name : String(e);
    }
    verifica("recursionLimit: 100 la apel bate limita de 10.000 a lui createDeepAgent", eroare === "GraphRecursionError" && apeluri < 60, { eroare, apeluri });

    const oprire = new AbortController();
    apeluri = 0;
    eroare = "";
    try {
      const flux = await creeazaDeepMinimal(inCerc()).stream(intrare, { streamMode: ["updates"], signal: oprire.signal, callbacks: [numara] });
      for await (const _ of flux) if (apeluri >= 3) oprire.abort(); // «clientul a inchis pagina»
    } catch (e) {
      eroare = e instanceof Error ? e.name : String(e);
    }
    const laOprire = apeluri;
    await new Promise((r) => setTimeout(r, 200));
    verifica("signal: dupa abort nu mai pleaca niciun apel de model", eroare === "AbortError" && apeluri === laOprire && apeluri < 10, { eroare, laOprire, apeluri });
  }

  console.log("\nH. Tema: glosar + varianta LinkedIn");
  {
    const dir = redactieTemporara();
    writeFileSync(path.join(dir, "GLOSAR.md"), readFileSync(path.join("exercitiu", "GLOSAR.md"), "utf8"));
    try {
      const model = new ModelPeRoluri(roluri());
      const r = await creeazaDeepCuLinkedIn(model, dir).invoke(intrare);
      verifica("GLOSAR.md intra si el in system prompt", model.sisteme.every((s) => s.includes("GLOSAR")), model.sisteme[0].slice(0, 80));
      verifica("varianta LinkedIn e scrisa pe disc", existsSync(path.join(dir, "articole", "linkedin.md")));
      verifica("o singura cautare in surse: LinkedIn se scrie din fisiere, nu din surse noi", numeTools(r.messages).filter((n) => n === "cautaSurse").length === 1, numeTools(r.messages));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }

  console.log(`\n${trecute} trecute, ${picate} picate`);
  if (picate > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
