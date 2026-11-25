"use client";

// app/blog/page.tsx
//
// ===========================================================================
// PAGINA: cinci agenti, fiecare cu o piesa in plus
// ===========================================================================
//
// Alegi demo-ul, apesi «Porneste» si urmaresti, live:
//   - pasii: ce cheama modelul; middleware-ul apare cu gri;
//   - planul (write_todos), din demo3;
//   - fisierele scrise de agent, din demo4 (in state) si demo5 (pe disc);
//   - la final: raspunsul, apelurile de model, contextul la fiecare pas si costul.
//
// Citirea SSE e aceeasi ca in Lab 1, 11, 13 si 14.

import { useState } from "react";
import { DEMOURI, type Demo } from "@/lib/blog/demouri";
import type { Consum, Context, Cost } from "@/lib/blog/consum";
import type { Fisier } from "@/lib/blog/fisiere";
import type { Eveniment, Todo } from "@/app/api/blog/route";

// Subiectul implicit: sursele din lib/blog/surse.ts sunt despre aceasta lansare.
const SUBIECT_IMPLICIT = "Lansarea rapoartelor programate in TaskFlow";

const SIMBOL: Record<Todo["status"], string> = { pending: "[ ]", in_progress: "[~]", completed: "[x]" };

export default function PaginaBlog() {
  const [demo, setDemo] = useState<Demo>("demo1");
  const [subiect, setSubiect] = useState(SUBIECT_IMPLICIT);
  const [pasi, setPasi] = useState<{ text: string; middleware: boolean }[]>([]);
  const [plan, setPlan] = useState<Todo[]>([]);
  const [fisiere, setFisiere] = useState<Fisier[]>([]);
  const [deschis, setDeschis] = useState<string | null>(null);
  const [raspuns, setRaspuns] = useState("");
  const [consum, setConsum] = useState<Consum | null>(null);
  const [context, setContext] = useState<Context | null>(null);
  const [cost, setCost] = useState<Cost | null>(null);
  const [eroare, setEroare] = useState<string | null>(null);
  const [ocupat, setOcupat] = useState(false);

  function aplica(ev: Eveniment) {
    if (ev.tip === "pas") setPasi((p) => [...p, { text: ev.text, middleware: ev.middleware }]);
    if (ev.tip === "plan") setPlan(ev.todos);
    if (ev.tip === "fisiere") setFisiere(ev.fisiere);
    if (ev.tip === "gata") {
      setRaspuns(ev.raspuns);
      setConsum(ev.consum);
      setContext(ev.context);
      setCost(ev.cost);
    }
    if (ev.tip === "eroare") setEroare(ev.mesaj);
  }

  async function porneste() {
    setPasi([]);
    setPlan([]);
    setFisiere([]);
    setDeschis(null);
    setRaspuns("");
    setConsum(null);
    setContext(null);
    setCost(null);
    setEroare(null);
    setOcupat(true);
    try {
      const res = await fetch("/api/blog", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ demo, subiect }) });
      if (!res.ok || !res.body) {
        setEroare(`HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let rest = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        rest += decoder.decode(value, { stream: true });
        const bucati = rest.split("\n\n");
        rest = bucati.pop() ?? "";
        for (const b of bucati) if (b.startsWith("data: ")) aplica(JSON.parse(b.slice(6)) as Eveniment);
      }
    } catch (e) {
      setEroare(e instanceof Error ? e.message : String(e));
    } finally {
      setOcupat(false);
    }
  }

  const maxContext = Math.max(1, ...(context?.tokeniPePas ?? [1]));
  const fisierDeschis = fisiere.find((f) => f.cale === deschis);

  return (
    <main className="mx-auto max-w-6xl p-6 space-y-5 text-sm">
      <h1 className="text-2xl font-bold">Lab 15: harness și Deep Agent</h1>

      <section className="space-y-2">
        <div className="flex flex-wrap gap-2">
          {(Object.keys(DEMOURI) as Demo[]).map((d) => (
            <button key={d} onClick={() => setDemo(d)} disabled={ocupat}
              className={`rounded border px-3 py-1 ${demo === d ? "bg-black text-white" : "hover:bg-gray-100"}`}>
              {DEMOURI[d].titlu}
            </button>
          ))}
        </div>
        <p className="text-gray-600">Piesa nouă: {DEMOURI[demo].adauga}</p>
        {demo === "demo1" ? (
          <p className="rounded border bg-gray-50 p-2">Sarcina e fixă: trei articole (clienți, vânzări, limitări), în aceeași conversație.</p>
        ) : (
          <input value={subiect} onChange={(e) => setSubiect(e.target.value)} className="w-full rounded border p-2" />
        )}
        <button onClick={porneste} disabled={ocupat || subiect.trim().length < 3} className="rounded bg-black px-4 py-2 text-white disabled:opacity-40">
          {ocupat ? "Lucrează..." : "Pornește"}
        </button>
      </section>

      <section className="grid grid-cols-3 gap-4">
        <div>
          <h2 className="font-semibold">Pași</h2>
          <ol className="mt-1 list-decimal space-y-1 pl-5">
            {pasi.map((p, i) => <li key={i} className={p.middleware ? "text-gray-400" : ""}>{p.text}</li>)}
          </ol>
        </div>

        <div className="space-y-4">
          <div>
            <h2 className="font-semibold">Plan (write_todos)</h2>
            {plan.length === 0 ? <p className="text-gray-400">fără plan</p> : (
              <ul className="mt-1 space-y-1 font-mono">
                {plan.map((t, i) => <li key={i} className={t.status === "in_progress" ? "font-bold" : ""}>{SIMBOL[t.status]} {t.content}</li>)}
              </ul>
            )}
          </div>
          <div>
            <h2 className="font-semibold">Fișiere</h2>
            {fisiere.length === 0 ? <p className="text-gray-400">niciun fișier</p> : (
              <ul className="mt-1 space-y-1 font-mono">
                {fisiere.map((f) => (
                  <li key={f.cale}>
                    <button onClick={() => setDeschis(deschis === f.cale ? null : f.cale)} className="underline">{f.cale}</button>
                  </li>
                ))}
              </ul>
            )}
            {fisierDeschis && <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap rounded border bg-gray-50 p-2">{fisierDeschis.text}</pre>}
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <h2 className="font-semibold">Răspunsul final</h2>
            <p className="min-h-24 whitespace-pre-wrap rounded border p-3">{raspuns}</p>
          </div>
          {cost && (
            <div>
              <h2 className="font-semibold">Cost</h2>
              {cost.dolari === 0 ? (
                <p className="text-gray-600">n/a: modelul {cost.model} nu e în lib/cost.ts (sau e local) ori providerul nu raportează tokeni.</p>
              ) : (
                <p>
                  <b>${cost.dolari.toFixed(6)}</b> cu {cost.model}: {cost.tokeniInput} tokeni input, {cost.tokeniOutput} output.
                  <br />
                  <span className="text-gray-600">
                    Prompt caching: {cost.tokeniCacheCititi} tokeni citiți din cache, {cost.tokeniCacheScrisi} scriși în cache.
                  </span>
                  <br />
                  <span className="text-gray-600">{Math.round(cost.procentInput * 100)}% din cost vine din input, adică din context.</span>
                </p>
              )}
            </div>
          )}
          {consum && context && (
            <div>
              <h2 className="font-semibold">Contextul la fiecare apel de model</h2>
              <p className="text-gray-600">
                {Object.values(consum)[0].apeluri} apeluri de model.
                {context.estimat ? " Tokeni estimați (caractere / 4), fără descrierile tools." : " Tokeni de intrare raportați de provider."}
              </p>
              <ul className="mt-1 space-y-1">
                {context.tokeniPePas.map((t, i) => (
                  <li key={i} className="flex items-center gap-2">
                    <span className="w-6 text-right">{i + 1}</span>
                    <span className="h-3 bg-gray-700" style={{ width: `${Math.max(2, (t / maxContext) * 160)}px` }} />
                    <span>{t}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </section>

      {eroare && <p className="rounded bg-red-50 p-2 text-red-700">{eroare}</p>}
    </main>
  );
}
