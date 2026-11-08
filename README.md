# Allowance (web)

A budgeting web app that works on a phone. It turns your income, fixed bills and savings into a daily allowance, tracks what you spend, and helps you pay back an overspend with cheaper swaps (the bus instead of the train, bread at home instead of a café breakfast).

There is no account, no server and no build step. Your data stays in your browser. An Android version of the same app exists, and the JSON backups work in both.

## The budget assistant

Open the AI tab and talk to it in plain English or 中文, type or use the microphone. It costs nothing, needs no API key and has no usage limits: nothing is sent to any online AI service. There are three layers, and each one is a fallback for the one above it:

1. **Ollama on your computer** (`js/llm.js`), optional and the best: in Settings, *Connect to Ollama* uses the models you already run with [Ollama](https://ollama.com) (`qwen2.5:3b` works well; about 0.6 s per sentence on a 4 GB GPU). Add a vision model (`ollama pull qwen2.5vl:3b`, 3.2 GB) and the camera button reads **receipt photos**: shop, date (DD/MM/YYYY is read correctly), the total paid (not the cash or change lines), and the items. Reading is slow on a small graphics card (2 to 4 minutes measured on a 4 GB laptop GPU; much faster on a bigger one), so the app frees the text model's memory first and brings it back afterwards. Reachable from a page on the same computer; a phone would also need `OLLAMA_HOST=0.0.0.0` and an http page.
2. **A small model in the browser**, optional: *Download and run in this browser* fetches Qwen2.5 1.5B (about 1 GB, once) and runs it through WebGPU with [WebLLM](https://github.com/mlc-ai/web-llm) (loaded from jsDelivr, version pinned). It's for phones, and can't read photos.
3. **Built-in rules** (`js/nlu.js`): always on, instant, offline. They understand the sentence shapes below and say so when they don't.

The model only *reads*: it fills in a fixed form (what you want, the item, the category). **Amounts and dates are decided by the rules, not the model**: a price must be written in your own words, and a day further back than yesterday only counts if you said so. A wrong guess can mislabel an item but cannot invent money. A receipt is the one case with no sentence to check against, so a photo is never saved on its own: it opens the normal entry sheet, filled in, for you to check. If the model is off, still loading, too slow or answers nonsense, the rules answer instead.

**Memory** (`js/memory.js`): this is the retrieval part, like RAG, over your own history. Before answering, the assistant looks up past entries that look like what you typed. It uses them to pick a category ("巧克力" was Food last time), to say "you usually pay about RM 4 for this" next to a purchase check, and as context for the model. It is a plain word match rather than embeddings, which is exact and instant for a few hundred entries and needs no extra model.

| You say | It does |
|---|---|
| `Spent RM 3 on coffee` · `我今天花了3块买咖啡` · `昨天打车花了18块` | Records the expense (category and date worked out from the words) and shows what is left today, with an Undo button |
| `Sneakers RM 120` · `Can I afford sneakers RM 120?` · `我想买耳机 200块` | Checks it against your budget and shows the pay-back chart |
| `How much is left today?` · `今天还剩多少` | Shows today's leftover |
| `How much did I spend on food this month?` · `这周花了多少` | Adds up your spending |
| `Save for a Japan trip RM 5000` · `Add AirPods RM 999 to my wish list` | Adds a goal or a wish |
| `undo` · `撤销` | Takes back the last thing the assistant recorded |
| The camera button, with a vision model connected | Reads a receipt photo (shop, date, total, items) and opens a filled-in entry for you to check and save |

Amounts are never guessed: if there is no readable price, nothing is recorded.

## How accurate is it? (measured, with the limits)

`node eval/run.mjs` scores the assistant on labelled sentences (`eval/cases.mjs`): rules only, or `--llm` for rules plus the real model on Ollama. It reports precision and recall per kind of action, and three numbers about safety: **write precision** (of the records it would save, how many are right in amount and day), **write recall** (of the real records, how many it found) and **false-action rate** (sentences that need nothing, like "I walked 3 km", where it did something anyway = the hallucinated actions).

With the model on, two readers must agree before anything is saved: the rules and the model (`combine` in `js/llm.js`). With the model off, the rules alone decide (their own numbers are in the table below). Amounts, days, periods and categories come from the words themselves, never from the model; the model decides *what kind of request it is*. Its only free text is small talk, which was checked on 71 do-nothing sentences: no invented amounts and no claimed actions.

What the numbers honestly say (rules only, same first-run rule for every set: score once, then fix, then write a new set):

| First run on sentences it had never seen | macro-F1 | write precision | write recall | false actions |
|---|---|---|---|---|
| Held-out, round 1, before any fix | 77% | 88% | 71% | 64% |
| FRESH, before its fixes | 95% | 100% | 91% | 17% |
| FRESH2, before its fixes | 92% | 93% | 87% | 7% |
| **FRESH3 (sealed), rules only** | 95% | 100% | 100% | 14% |
| **FRESH3 (sealed), rules + model** | **100%** | **100%** | **100%** | **0%** |

- **Overfitting** was real: the first held-out round fell 18 points below the development set (95% vs 77%), mostly because any bare number was read as a price ("I got 100% on my exam" became a RM 100 expense). Those are fixed by principles (what may follow a number), not by patching sentences, and re-checked on sets written before the fixes.
- **Underfitting** was real too: Malay, spelled-out numbers ("twenty ringgit"), past tenses like "ate" and "was", and "what did I spend yesterday" were missed, and are now covered. Known gaps that remain: a year ("in 2019") or a phone-style number alone can still raise a harmless "can I buy it?" card (never a record), and Chinese food words like 包子 are not categorised.
- **Limits of this evidence:** the sentences were written by the same person who wrote the rules, not collected from real use; 50 sentences with 13 records can't prove a 0% error rate (zero errors in 13 only says the true rate is probably under roughly a quarter); the in-browser WebLLM model was never evaluated; receipts were tried on one synthetic receipt only, which is why a receipt photo is never saved without your check. Real use is the next test: the sets in `eval/` are where to add whatever it gets wrong.

## Use it

Open the site, or on a computer serve this folder and open it in a browser:

```bash
node serve.mjs . 8080
```

Then open `http://localhost:8080/`. On an iPhone, open the address in Safari and use Share, then Add to Home Screen.

## Check it

```bash
node --test tests/engine.test.mjs tests/nlu.test.mjs tests/llm.test.mjs tests/memory.test.mjs
```

## Good to know

- Offline use needs HTTPS (GitHub Pages, Netlify and similar hosts give you that).
- Data is saved in the browser, with a second copy that restores it if the main copy is cleared. Clearing all website data removes both, so export a JSON backup now and then (Settings, Export JSON).
- The Home Screen app and Safari keep separate data on iPhone. Pick one place to enter your budget.
