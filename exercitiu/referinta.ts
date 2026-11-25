// exercitiu/referinta.ts
//
// ===========================================================================
// REZOLVAREA TEMEI LAB 15: glosarul si varianta pentru LinkedIn
// ===========================================================================
//
// Uitati-va aici abia dupa ce ati incercat singuri (enuntul: Tema-Lab15.txt).
//
// Pornim de la creeazaDeepCuMemorie din lib/blog/agenti.ts si schimbam
// trei lucruri, marcate cu TODO 1, 2, 3.

import { todoListMiddleware } from "langchain";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { createDeepAgent, FilesystemBackend } from "deepagents";
import { cautaSurse } from "../lib/blog/surse";
import { PROMPT_REDACTOR, PROMPT_NOTITE } from "../lib/blog/agenti";

// TODO 3: planul are un pas in plus.
const PROMPT_PLAN_CU_LINKEDIN =
  "Inainte de orice, faci un plan cu write_todos: cercetare, scriere, recitire, varianta LinkedIn. " +
  "Dupa fiecare pas actualizezi planul: pasul terminat devine completed, urmatorul in_progress.";

// TODO 2: pasul nou. Important: «nu mai cauti in surse». Notitele sunt deja
// in /cercetare/note.md; asta e castigul filesystem-ului: munca facuta o data
// se refoloseste, fara apeluri noi.
const PROMPT_LINKEDIN =
  "Dupa articol, scrii o varianta pentru LinkedIn in /articole/linkedin.md: cel mult trei fraze, " +
  "scrisa din /articole/articol.md si /cercetare/note.md. Pentru ea NU mai cauti in surse.";

export function creeazaDeepCuLinkedIn(model: BaseChatModel, radacina: string) {
  return createDeepAgent({
    model,
    tools: [cautaSurse],
    systemPrompt: `${PROMPT_REDACTOR}\n\n${PROMPT_PLAN_CU_LINKEDIN}\n\n${PROMPT_NOTITE}\n\n${PROMPT_LINKEDIN}`,
    middleware: [todoListMiddleware()],
    backend: new FilesystemBackend({ rootDir: radacina, virtualMode: true }),
    // TODO 1: al doilea fisier de memory. Ordinea conteaza doar la afisare:
    // ambele intra in system prompt, la fiecare apel.
    memory: ["/AGENTS.md", "/GLOSAR.md"],
    // Ca in demo5: memoria o scrie echipa, nu agentul.
    permissions: [{ operations: ["write"], paths: ["/AGENTS.md", "/GLOSAR.md"], mode: "deny" }],
  });
}
