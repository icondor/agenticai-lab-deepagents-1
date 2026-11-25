// verificare/masoara-harness.ts
//
// ===========================================================================
// CAT COSTA HARNESS-UL, INAINTE CA AGENTUL SA FACA CEVA UTIL
// ===========================================================================
//
// Rulare:  pnpm masoara      (offline, fara chei, fara cost)
//
// La FIECARE apel de model, pe langa conversatie, se trimit doua lucruri fixe:
//   1. descrierile tools-urilor (nume, descriere, schema parametrilor);
//   2. system prompt-ul (al nostru + ce adauga middleware-ul: planul, memory).
// Le masuram pentru fiecare demo, cu un model fals care doar le inregistreaza.
//
// Cum masuram:
//   - descrierile tools-urilor in formatul OpenAI (convertToOpenAITool);
//     Anthropic si Gemini folosesc formate putin diferite, deci cifrele sunt
//     aproximative pentru ei;
//   - tokeni ~ caractere / 4. Un tokenizer real da alte cifre (textul romanesc
//     fara diacritice si JSON-ul se impart altfel), dar ORDINUL de marime si
//     PROPORTIILE dintre demo-uri sunt corecte. Cifrele exacte le dau
//     providerii, in usage_metadata, la rularea cu model real.

import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { AIMessageChunk, type BaseMessage } from "@langchain/core/messages";
import type { ChatResult } from "@langchain/core/outputs";
import { convertToOpenAITool } from "@langchain/core/utils/function_calling";
import type { StructuredToolInterface } from "@langchain/core/tools";
import path from "node:path";
import {
  creeazaAgentFaraHarness,
  creeazaDeepMinimal,
  creeazaDeepCuPlan,
  creeazaDeepCuNotite,
  creeazaDeepCuMemorie,
} from "../lib/blog/agenti";
import { calculateCost, formatCost } from "../lib/cost";

/** Model fals: inregistreaza tools-urile si system prompt-ul, apoi raspunde direct. */
class ModelInregistrator extends BaseChatModel {
  caractereTools = 0;
  numarTools = 0;
  caractereSistem = 0;
  _llmType() {
    return "inregistrator";
  }
  bindTools(tools: StructuredToolInterface[]) {
    this.numarTools = tools.length;
    this.caractereTools = tools.reduce((s, t) => s + JSON.stringify(convertToOpenAITool(t)).length, 0);
    return this;
  }
  async _generate(mesaje: BaseMessage[]): Promise<ChatResult> {
    this.caractereSistem = mesaje.find((m) => m.getType() === "system")?.text.length ?? 0;
    const mesaj = new AIMessageChunk({ content: "gata" });
    return { generations: [{ text: "gata", message: mesaj }] };
  }
}

const DEMOURI: [string, (m: BaseChatModel) => { invoke: (i: { messages: { role: string; content: string }[] }) => Promise<unknown> }][] = [
  ["demo1 fara harness", creeazaAgentFaraHarness],
  ["demo2 deep minimal", creeazaDeepMinimal],
  ["demo3 + plan", creeazaDeepCuPlan],
  ["demo4 + fisiere", creeazaDeepCuNotite],
  ["demo5 + memory", (m) => creeazaDeepCuMemorie(m, path.join(process.cwd(), "redactie"))],
];

const tok = (caractere: number) => Math.round(caractere / 4);
const col = (s: string | number, n: number) => String(s).padStart(n);

async function main() {
  console.log("\nCe se trimite la FIECARE apel de model, inainte de conversatie (tokeni ~ caractere / 4)\n");
  console.log(`${"demo".padEnd(20)}${col("tools", 7)}${col("tok tools", 11)}${col("tok system", 12)}${col("tok fix/apel", 14)}${col("haiku-4-5", 12)}${col("haiku-5-5", 12)}`);
  for (const [nume, creeaza] of DEMOURI) {
    const model = new ModelInregistrator({});
    await creeaza(model).invoke({ messages: [{ role: "user", content: "x" }] });
    const fix = tok(model.caractereTools) + tok(model.caractereSistem);
    console.log(
      `${nume.padEnd(20)}${col(model.numarTools, 7)}${col(tok(model.caractereTools), 11)}${col(tok(model.caractereSistem), 12)}${col(fix, 14)}` +
        `${col(formatCost(calculateCost("claude-haiku-4-5", fix, 0)), 12)}${col(formatCost(calculateCost("claude-haiku-5-5", fix, 0)), 12)}`,
    );
  }
  console.log("\nUltimele doua coloane: costul partii fixe, pentru UN apel, doar input.");
  console.log("Un articol in demo4 sau demo5 are ~7 apeluri: partea fixa se plateste de ~7 ori.\n");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
