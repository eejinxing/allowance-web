# Allowance (web)

A budgeting web app that works on a phone. It turns your income, fixed bills and savings into a daily allowance, tracks what you spend, and helps you pay back an overspend with cheaper swaps (the bus instead of the train, bread at home instead of a café breakfast).

There is no account, no server and no build step. Your data stays in your browser. An Android version of the same app exists, and the JSON backups work in both.

## Use it

Open the site, or on a computer serve this folder and open it in a browser:

```bash
node serve.mjs . 8080
```

Then open `http://localhost:8080/`. On an iPhone, open the address in Safari and use Share, then Add to Home Screen.

## Check it

```bash
node --test tests/engine.test.mjs
```

## Good to know

- Offline use needs HTTPS (GitHub Pages, Netlify and similar hosts give you that).
- Data is saved in the browser, with a second copy that restores it if the main copy is cleared. Clearing all website data removes both, so export a JSON backup now and then (Settings, Export JSON).
- The Home Screen app and Safari keep separate data on iPhone. Pick one place to enter your budget.
