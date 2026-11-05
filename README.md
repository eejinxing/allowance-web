# Allowance (web / iPhone)

A web app version of Allowance. No build step: serve this folder over HTTP(S) and open `index.html`.

- Local test: `node serve.mjs .` style static server, or any static host.
- iPhone: open the URL in Safari -> Share -> Add to Home Screen.
- Offline caching needs HTTPS (e.g. Netlify, Vercel, GitHub Pages).
- Data is stored on the device (localStorage), with a second copy in IndexedDB that restores it if the main copy is cleared, and a request for persistent storage. Neither survives "clear website data", so keep a file backup too.
- Settings -> Export/Import JSON is compatible with the Android app backups. On iPhone, Export opens the share sheet (choose Save to Files).
- iPhone: the Home Screen app and Safari keep separate data, so pick one place to enter your budget.
