// lib/blog/demouri.ts
//
// Tabelul demo-urilor, folosit de ruta si de pagina.
//
// CAPCANA: tabelul sta intr-un fisier separat, fara importuri. Pagina e
// "use client"; daca l-ar importa din agenti.ts, Next ar trage deepagents si
// langchain in codul trimis browserului.

export const DEMOURI = {
  demo1: { titlu: "1. Fără harness", adauga: "createAgent, trei articole într-o conversație" },
  demo2: { titlu: "2. Deep Agent minimal", adauga: "createDeepAgent" },
  demo3: { titlu: "3. + planificare", adauga: "write_todos" },
  demo4: { titlu: "4. + fișiere", adauga: "filesystem virtual (StateBackend)" },
  demo5: { titlu: "5. + memory", adauga: "AGENTS.md, fișiere pe disc (FilesystemBackend)" },
} as const;

export type Demo = keyof typeof DEMOURI;
