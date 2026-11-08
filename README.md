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

## Use it

Open the site, or on a computer serve this folder and open it in a browser:

```bash
node serve.mjs . 8080
```

Then open `http://localhost:8080/`. On an iPhone, open the address in Safari and use Share, then Add to Home Screen.

## Check it

```bash
node --test tests/engine.test.mjs tests/nlu.test.mjs tests/llm.test.mjs
```

## Good to know

- Offline use needs HTTPS (GitHub Pages, Netlify and similar hosts give you that).
- Data is saved in the browser, with a second copy that restores it if the main copy is cleared. Clearing all website data removes both, so export a JSON backup now and then (Settings, Export JSON).
- The Home Screen app and Safari keep separate data on iPhone. Pick one place to enter your budget.
