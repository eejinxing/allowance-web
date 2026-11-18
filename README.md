# Allowance Web

Allowance is a mobile-friendly budgeting app that turns your income, fixed bills, and savings into a daily spending allowance. See what you can spend today and how a purchase would affect the rest of the month.

## Features

- **Daily allowance** shows what you have left to spend after bills, savings, and recorded expenses.
- **Planning calendar** lets you set a spending amount for a future day or mark it as a no-spend day.
- **Spending history and charts** show where your money went by category.
- **Wallets and savings goals** track balances and progress toward planned purchases.
- **Purchase checks** show how a purchase would affect upcoming days and help you plan how to recover from overspending.
- **Receipt scanning** reads the total from a photo on your device. Review the amount and date before saving the expense.

## Budget assistant

Type a request in everyday language or use the microphone. The transcript appears in the text box for review before you send it. Voice input uses the browser's speech service, which may send audio to its provider and require an internet connection.

| Example | Result |
| --- | --- |
| `Spent RM 3 on coffee` | Records the expense and shows today's remaining allowance. |
| `Can I afford sneakers for RM 120?` | Shows how the purchase would affect your budget. |
| `How much did I spend on food this month?` | Adds up food expenses for the month. |
| `Save for a Japan trip RM 5000` | Adds a savings goal. |
| `Undo` | Reverses the last expense recorded in the current conversation. |

## Run locally

From the repository root, run the following command with Node.js.

```sh
node serve.mjs . 8080
```

Open [http://localhost:8080/](http://localhost:8080/) in your browser. The app requires no build step or account.

## Data and offline use

Your budget records are stored in your browser. In Settings, use **Export JSON backup** to keep a copy and **Restore JSON backup** to load it. The Android edition supports the same backup format.

When the site is served over HTTPS, visit it once while online to enable offline access. On iPhone, open it in Safari and choose **Share → Add to Home Screen**. Safari and the Home Screen app store their data separately.

## Tests

Run the test suite and the budget assistant's evaluation cases from the repository root.

```sh
node --test
node eval/run.mjs
```
