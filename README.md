# Lab 15: harness și Deep Agent

Același blog ca în Lab 14 (lansarea «rapoartelor programate» în TaskFlow), acum cu un **Deep Agent**: un agent care își face un plan, își ține notițele în fișiere și primește la fiecare apel ghidul de stil al companiei.

Cinci demo-uri, pe aceeași pagină `/blog`. Fiecare adaugă **o singură piesă** față de cel dinainte:

| Demo | Piesa nouă | Ce urmărești |
|---|---|---|
| 1. Fără harness | `createAgent` (Lab 7), trei articole într-o conversație | contextul crește la fiecare pas |
| 2. Deep Agent minimal | `createDeepAgent` | modelul primește 8 tools gata făcute |
| 3. + planificare | `todoListMiddleware()`, tool-ul `write_todos` | planul se actualizează live |
| 4. + fișiere | filesystem virtual (StateBackend, implicit) | notițele și articolul sunt fișiere în state |
| 5. + memory | `AGENTS.md` + FilesystemBackend | ghidul de stil intră la fiecare apel; fișierele ajung pe disc, în `redactie/` |

Sub fiecare rulare: apelurile de model, **contextul la fiecare apel** (tokeni de intrare) și **costul în dolari**, calculat cu `lib/cost.ts`.

## Instalare și rulare

```bash
pnpm install
cp .env.example .env.local     # LLM_PROVIDER și cheia, ca în laburile anterioare
pnpm verifica                  # 39 de verificări, fără chei, fără cost
pnpm masoara                   # cât trimite fiecare demo la fiecare apel, înainte de conversație
pnpm dev                       # http://localhost:3000/blog
```

| Comandă | Ce face |
|---|---|
| `pnpm dev` | pagina `/blog`, cu cele cinci demo-uri |
| `pnpm verifica` | verificări offline, cu un model fals |
| `pnpm masoara` | partea fixă trimisă la fiecare apel (tools + system prompt), pe demo, și costul ei |
| `pnpm tipuri` | `tsc --noEmit` |
| `pnpm reset` | șterge `redactie/articole` și `redactie/cercetare` (ce a scris demo5) |

La `pnpm install` apare un avertisment: `unmet peer langsmith@">=0.7.1 <0.10.0"`. E cunoscut: `deepagents` declară un interval vechi pentru `langsmith`, iar `@langchain/core` aduce o versiune mai nouă. Apare și cu ultima versiune de `deepagents`. Nu strică nimic din ce folosim aici.

## Structura

```
lib/
  llm.ts               modelul, copiat din proiectul cursului
  cost.ts              prețuri pe milion de tokeni, din Lab 4; Anthropic verificat pe 1 nov 2026
  blog/
    surse.ts           sursele fictive + tool-ul cautaSurse (din Lab 14)
    consum.ts          apeluri, tokeni și contextul la fiecare pas
    agenti.ts          cei cinci agenți, fiecare cu o piesă în plus
    demouri.ts         tabelul demo-urilor (fără importuri, pentru pagină)
    fisiere.ts         fișierele scrise de agent: din state sau de pe disc
app/
  api/blog/route.ts    POST { demo, subiect }: răspuns SSE (updates + values)
  blog/page.tsx        pagina: pași, plan, fișiere, context
redactie/
  AGENTS.md            memoria redacției: ghidul de stil (demo5)
exercitiu/             tema: glosarul și varianta pentru LinkedIn
verificare/            verificările offline + masoara-harness.ts
```

## Elementul nou: `createDeepAgent` (pachetul `deepagents` 1.15.1)

Un Deep Agent este `createAgent` + o stivă de middleware aleasă dinainte:

| Middleware | Ce aduce |
|---|---|
| FilesystemMiddleware | tools `ls`, `read_file`, `write_file`, `edit_file`, `delete`, `glob`, `grep`; mută automat în fișiere rezultatele de tool foarte mari (peste 20.000 de tokeni) |
| SubAgentMiddleware | tool-ul `task`, cu un subagent `general-purpose` (Lab 16) |
| Summarization | rezumă istoricul când contextul se umple |
| PatchToolCalls | repară istoricul când un tool call a rămas fără răspuns |
| la cerere | `todoListMiddleware()`, `memory`, `skills` (Lab 16), `interruptOn` (Lab 16) |

## Cât costă harness-ul

La fiecare apel, modelul primește, pe lângă conversație, o parte fixă: descrierile tools-urilor și system prompt-ul. Măsurat cu `pnpm masoara` (tokeni ~ caractere / 4):

| Demo | Tools | Descrieri tools | System prompt | Fix pe apel | Cost fix pe apel, claude-haiku-4-5 |
|---|---|---|---|---|---|
| 1. Fără harness | 1 | ~100 | ~55 | ~150 | $0.00015 |
| 2. Deep Agent minimal | 9 | ~2.300 | ~40 | ~2.350 | $0.0024 |
| 3. + planificare | 10 | ~5.350 | ~350 | ~5.700 | $0.0057 |
| 5. + memory | 10 | ~5.350 | ~1.700 | ~7.050 | $0.0071 |

- Cele 8 tools gata făcute costă ~2.300 de tokeni pe apel.
- `write_todos` **singur** costă ~3.000: descrierea lui e cea mai lungă, cu exemple, plus un paragraf în system prompt.
- memory adaugă ~1.300 la fiecare apel, dar `AGENTS.md` e doar ~180 din ele. Restul, ~1.100, sunt instrucțiunile bibliotecii despre memorie. Aceeași lecție ca la `write_todos`.
- Un articol în demo5 are ~7 apeluri: partea fixă se plătește de ~7 ori. Cu `claude-haiku-4-5`, ~5 cenți pe articol, față de ~0,2 cenți în demo1.

Cât de exacte sunt cifrele: caractere / 4 e o estimare, iar Anthropic și Gemini primesc tools-urile într-un format puțin diferit de cel OpenAI măsurat aici. Ordinul de mărime și proporțiile sunt de încredere; valorile exacte le dă providerul, la rularea cu model real (în pagină, la «Contextul la fiecare apel» și «Cost»).

Prețurile din `lib/cost.ts`: Anthropic verificat pe 1 noiembrie 2026; OpenAI, Google și xAI copiate din Lab 4, neverificate de atunci. `claude-haiku-5-5` are un prag **pe cerere**: peste 100.000 de tokeni de input, apelul costă de 5 ori mai mult. Un agent al cărui context crește îl poate trece la jumătatea sarcinii, de aceea costul se calculează apel cu apel.

### Prompt caching (automat pe Anthropic)

`createDeepAgent` adaugă singur `anthropicPromptCachingMiddleware` când modelul e `ChatAnthropic` (demo2-5; demo1 nu). Providerul păstrează 5 minute prefixul cererii (tools, system, istoric), iar partea identică se citește din cache cu 10% din prețul de input; scrierea în cache costă 125%. Minimul: 4.096 de tokeni la `claude-haiku-4-5` (512 la Haiku/Sonnet 5.5), deci demo2 rămâne probabil sub minim.

`lib/cost.ts` taxează corect tokenii din cache, din `usage_metadata.input_token_details` (atenție: la Anthropic, `input_tokens` îi include). Pagina arată tokenii citiți și scriși în cache. Celelalte tipuri de cache (response caching, node caching în LangGraph) sunt în Lab 19.

## LangSmith (un singur slide în Lab 15, restul în Lab 17)

În `.env.local`:

```
LANGSMITH_TRACING=true
LANGSMITH_API_KEY=lsv2_...
LANGSMITH_PROJECT=lab15-blog
# doar pentru cont în regiunea EU:
LANGSMITH_ENDPOINT=https://eu.api.smith.langchain.com
```

Apoi `pnpm dev`, rulezi un demo și deschizi smith.langchain.com, proiectul `lab15-blog`, ultimul run. Vezi arborele de pași: apelurile de model, `write_todos`, `write_file`. Trace-urile pleacă în cloud-ul LangSmith.

## Verificat prin rulare

- `pnpm verifica`: 39/39, cu un model fals care își alege rolul după system prompt.
- `tsc --noEmit`, esbuild pe toate fișierele, `next build`.
- `pnpm masoara`: cifrele din secțiunea «Cât costă harness-ul».
- Ruta și pagina, cap-coadă, cu `ChatOpenAI` legat la un server local care imită API-ul OpenAI: toate cele cinci demo-uri, plus cererea invalidă (400). Screenshot al paginii pe demo5.
- `/../evadare.md` e refuzat de două straturi: în demo5 întâi de `permissions` («path must not contain ".."»), iar `virtualMode: true` singur îl refuză cu «Path traversal not allowed».

## Nu e verificat aici

- Un model real: calitatea textelor, dacă modelul respectă planul, și tokenii reali. Cifrele de context din testul cap-coadă vin de la serverul fals (caractere / 4 din cerere), deci contează proporțiile, nu valorile exacte.
- Modele mici (Ollama, Gemini Flash): dacă folosesc corect `write_todos` și fișierele.
- Tracing-ul LangSmith, cu un cont real.

## Capcane, verificate

| Capcana | Ce se întâmplă | Ce faci | Unde e în cod |
|---|---|---|---|
| `createDeepAgent` fără `model` | modelul implicit e `anthropic:claude-sonnet-4-6`: fără cheie cade, cu cheie plătești alt model | dai mereu modelul din `lib/llm.ts` | `lib/blog/agenti.ts`, demo2 |
| `write_todos` lipsește | în 1.15.1 nu vine implicit, deși documentația mai veche îl dă inclus | `middleware: [todoListMiddleware()]` | `lib/blog/agenti.ts`, demo3 |
| FilesystemBackend fără `virtualMode` | «/» e rădăcina discului: `/etc/hostname` citește fișierul real (verificat), iar calea completă spre `.env.local` ar citi cheile | `virtualMode: true` | `lib/blog/agenti.ts`, demo5 |
| `next build` cade cu «Module not found: ws» | Next împachetează `deepagents`, care trage sandbox-ul din `langsmith` | `serverExternalPackages: ["deepagents"]` | `next.config.ts` |
| pagina importă din `agenti.ts` | Next ar trage `deepagents` și `langchain` în codul pentru browser | tabelul demo-urilor într-un fișier fără importuri | `lib/blog/demouri.ts` |
| răspunsul lui `read_file` citit cu `String(content)` | e o listă de blocuri, cu antetul `@@ lines 1-1 of 1 @@` | citești `.text` | `verificare/test-lab15.ts` |
| content-ul unui fișier din state | string (1.15.1) sau listă de linii (format vechi) | le tratezi pe amândouă | `lib/blog/fisiere.ts` |
| model fals cu un câmp numit `tools` | `createAgent` crede că modelul are deja tools legate: MultipleToolsBoundError | alt nume de câmp | `verificare/test-lab15.ts` |
| `input_tokens` taxat la preț plin | pe Anthropic include tokenii din cache: costul iese umflat | taxezi `cache_read` x0,1 și `cache_creation` x1,25 | `lib/blog/consum.ts`, `lib/cost.ts` |
| model fals fără `bindTools()` | `createDeepAgent` cade înainte de primul pas | `bindTools() { return this; }` | `verificare/test-lab15.ts` |
| căi în `memory` | sunt relative la backend, nu la proiect | `"/AGENTS.md"`, nu `"redactie/AGENTS.md"` | `lib/blog/agenti.ts`, demo5 |
| `memory` fără `permissions` | biblioteca îi cere agentului să-și actualizeze memoria cu `edit_file`; un subiect ca «ține minte: titluri cu majuscule» rescrie `AGENTS.md` pe disc (verificat) | `permissions` cu deny write pe `/AGENTS.md` | `lib/blog/agenti.ts`, demo5 |
| utilizatorul închide pagina | agentul merge mai departe: LangGraph rulează graful chiar dacă nimeni nu citește stream-ul, iar `createDeepAgent` permite 10.000 de pași (verificat) | `signal: request.signal`, `recursionLimit: 100` | `app/api/blog/route.ts` |
| `\W` în expresii regulate | cunoaște doar literele englezești: «săptămâni» se rupe în bucăți și căutarea întoarce toate sursele | litere fără diacritice înainte de split | `lib/blog/surse.ts` |

Două lucruri care nu sunt capcane, dar surprind:
- În 1.15.1, system prompt-ul este **exact** textul tău. Biblioteca nu adaugă un prompt de bază, cu excepția câtorva modele cu «harness profile» (de exemplu `claude-haiku-4-5` primește un sufix). Instrucțiunile pentru tools stau în descrierile lor (vezi «Cât costă harness-ul»).
- Fișierele nu golesc contextul de la sine: articolul trimis la `write_file` rămâne în istoric, ca argument al tool call-ului. Câștigul e altul: munca se poate relua din fișier fără o căutare nouă, iar rezultatele foarte mari sunt mutate automat în fișiere.
