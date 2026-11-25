// app/api/blog/route.ts
//
// ===========================================================================
// O RUTA, CINCI DEMO-URI
// ===========================================================================
//
//   POST { demo: "demo1" ... "demo5", subiect }
//
// Raspunsul e SSE, ca in Lab 13 si 14: linii "data: {json}\n\n".
// Rulam agentul cu doua stream modes:
//   "updates"  un eveniment cand termina un nod: model_request, tools sau un
//              middleware (de exemplu todoListMiddleware.after_model)
//   "values"   tot state-ul dupa fiecare pas: messages, todos, files
// Din "updates" afisam pasii; din "values" luam planul si fisierele.

import { NextRequest } from "next/server";
import path from "node:path";
import { z } from "zod";
import type { BaseMessage } from "@langchain/core/messages";
import { createModel, readProviderFromEnv, getActiveModelName } from "@/lib/llm";
import {
  creeazaAgentFaraHarness,
  creeazaDeepMinimal,
  creeazaDeepCuPlan,
  creeazaDeepCuNotite,
  creeazaDeepCuMemorie,
  SARCINA_TREI_ARTICOLE,
} from "@/lib/blog/agenti";
import type { Demo } from "@/lib/blog/demouri";
import { consumDin, contextPePas, costRulare, type Consum, type Context, type Cost } from "@/lib/blog/consum";
import { fisiereDinState, fisiereDePeDisc, type Fisier } from "@/lib/blog/fisiere";

export const runtime = "nodejs";

// Folderul care devine "/" pentru agentul din demo5. Contine AGENTS.md.
const REDACTIE = path.join(process.cwd(), "redactie");

export type Todo = { content: string; status: "pending" | "in_progress" | "completed" };

export type Eveniment =
  | { tip: "pas"; text: string; middleware: boolean }
  | { tip: "plan"; todos: Todo[] }
  | { tip: "fisiere"; fisiere: Fisier[] }
  | { tip: "gata"; raspuns: string; consum: Consum; context: Context; cost: Cost }
  | { tip: "eroare"; mesaj: string };

const Cerere = z.object({
  demo: z.enum(["demo1", "demo2", "demo3", "demo4", "demo5"]),
  // max: subiectul ajunge in prompt, la fiecare apel. Fara limita, un text
  // de un megabyte s-ar plati de ~7 ori.
  subiect: z.string().min(3).max(300),
});

function creeazaAgent(demo: Demo) {
  const model = createModel(readProviderFromEnv());
  switch (demo) {
    case "demo1": return creeazaAgentFaraHarness(model);
    case "demo2": return creeazaDeepMinimal(model);
    case "demo3": return creeazaDeepCuPlan(model);
    case "demo4": return creeazaDeepCuNotite(model);
    case "demo5": return creeazaDeepCuMemorie(model, REDACTIE);
  }
}

type Update = Record<string, { messages?: { getType(): string; tool_calls?: { name: string }[]; name?: string }[] } | undefined>;

/** Un pas, din stream mode "updates". Middleware-ul il marcam separat. */
function descriePas(update: Update): { text: string; middleware: boolean }[] {
  const pasi: { text: string; middleware: boolean }[] = [];
  for (const [nod, valoare] of Object.entries(update)) {
    const ultim = valoare?.messages?.at(-1);
    if (nod === "model_request") {
      const apeluri = ultim?.tool_calls ?? [];
      pasi.push({ text: apeluri.length ? `modelul cheama ${apeluri.map((t) => t.name).join(", ")}` : "modelul da raspunsul final", middleware: false });
    } else if (nod === "tools") {
      const nume = (valoare?.messages ?? []).map((m) => m.name).filter(Boolean).join(", ");
      pasi.push({ text: `tool-ul ${nume} a raspuns`, middleware: false });
    } else {
      // Nodurile cu punct in nume sunt hook-uri de middleware (Lab 9):
      // "FilesystemMiddleware.before_agent", "todoListMiddleware.after_model"...
      pasi.push({ text: nod, middleware: true });
    }
  }
  return pasi;
}

export async function POST(request: NextRequest) {
  const corp = Cerere.safeParse(await request.json().catch(() => null));
  if (!corp.success) return Response.json({ error: "Cerere invalida" }, { status: 400 });
  const { demo, subiect } = corp.data;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const encoder = new TextEncoder();
      const emite = (ev: Eveniment) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(ev)}\n\n`));
        } catch {
          // clientul a inchis pagina
        }
      };

      try {
        const agent = creeazaAgent(demo);
        const sarcina = demo === "demo1" ? SARCINA_TREI_ARTICOLE : `Scrie articolul de blog. Subiect: ${subiect}`;
        const input = { messages: [{ role: "user", content: sarcina }] };

        let mesaje: BaseMessage[] = [];
        let planAnterior = "";
        let fisiereAnterioare = "";

        // Cei cinci agenti au tipuri diferite (fiecare isi poarta tools-urile si
        // middleware-ul in tip), deci stream-ul lor are tipuri diferite. Le citim
        // pe toate la fel, cu un tip comun minim.
        //
        // CAPCANA (cost): agentul NU se opreste cand utilizatorul inchide pagina.
        // LangGraph ruleaza graful mai departe chiar daca nu mai citeste nimeni
        // stream-ul (verificat cu model fals: 43 de apeluri de model intr-o
        // secunda). Iar createDeepAgent pune recursionLimit 10.000. Un agent
        // care se invarte in cerc ar plati pana acolo.
        //   signal          Next 16 il anuleaza cand clientul inchide conexiunea;
        //                   LangGraph se opreste la urmatorul pas
        //   recursionLimit  pasi de graf, nu apeluri de model (middleware-ul are
        //                   si el noduri); un articol are ~7 apeluri, deci 100
        //                   lasa loc. Peste: GraphRecursionError, in panoul rosu.
        const evenimente = (await agent.stream(input, {
          streamMode: ["updates", "values"],
          signal: request.signal,
          recursionLimit: 100,
        })) as AsyncIterable<[string, unknown]>;

        for await (const [mode, chunk] of evenimente) {
          if (mode === "updates") {
            for (const pas of descriePas(chunk as Update)) emite({ tip: "pas", ...pas });
            continue;
          }

          // mode === "values": tot state-ul. Trimitem planul si fisierele doar cand se schimba.
          const stare = chunk as { messages: BaseMessage[]; todos?: Todo[]; files?: Record<string, { content: string | string[] }> };
          mesaje = stare.messages;

          const plan = JSON.stringify(stare.todos ?? []);
          if (plan !== planAnterior) {
            planAnterior = plan;
            emite({ tip: "plan", todos: stare.todos ?? [] });
          }

          // demo5 scrie pe disc (FilesystemBackend), restul in state (StateBackend).
          const fisiere = demo === "demo5" ? fisiereDePeDisc(REDACTIE) : fisiereDinState(stare.files);
          const cheie = JSON.stringify(fisiere);
          if (cheie !== fisiereAnterioare) {
            fisiereAnterioare = cheie;
            emite({ tip: "fisiere", fisiere });
          }
        }

        // Costul se calculeaza cu numele modelului din .env (ANTHROPIC_MODEL, OPENAI_MODEL...)
        // si preturile din lib/cost.ts. Model necunoscut sau local (Ollama): "n/a".
        const cost = costRulare(getActiveModelName(readProviderFromEnv()), mesaje);
        emite({ tip: "gata", raspuns: mesaje.at(-1)?.text ?? "", consum: consumDin(demo, mesaje), context: contextPePas(mesaje), cost });
      } catch (e) {
        emite({ tip: "eroare", mesaj: e instanceof Error ? e.message : String(e) });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive" },
  });
}
