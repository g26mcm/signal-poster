# Signal Poster → Telegram

A minimal working example: fill out a form in the browser, hit "Post Signal",
and it lands in your Telegram channel/group instantly.

## How it works

```
index.html (form)  --POST-->  server.js (Express)  --API call-->  Telegram
```

The bot token lives only on the server — never in the browser — so it can't
be stolen by anyone viewing your page source.

## 1. Create your Telegram bot

1. Open Telegram, message **[@BotFather](https://t.me/BotFather)**
2. Send `/newbot`, follow the prompts, give it a name and username
3. BotFather gives you a **token** like `123456789:ABCdef...` — save it

## 2. Add the bot to your channel/group

1. Open your channel/group → Manage → Administrators → Add Admin
2. Add your bot, give it permission to post messages

## 3. Get your chat ID

Easiest way:
1. Post any message in the channel
2. Visit this URL in your browser (with your real token):
   `https://api.telegram.org/bot<YOUR_TOKEN>/getUpdates`
3. Look for `"chat":{"id": -1001234567890, ...}` in the response — that's your chat ID
   (channel/group IDs are negative numbers)

If `getUpdates` comes back empty, forward any message from the channel to
[@getidsbot](https://t.me/getidsbot) instead — it'll reply with the chat ID directly.

## 4. Configure the backend

```bash
cd signal-poster
npm install
cp .env.example .env
# edit .env and paste in your real TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID
```

## 5. Run it

```bash
node server.js
```

Then open `index.html` in your browser (just double-click it, or serve it
with any static server). Fill out the form, hit **Post Signal** — it should
appear in your Telegram channel within a second.

## Deploying for real use

Right now this runs locally. To make it live on the internet:

- **Backend**: deploy `server.js` to Railway, Render, Fly.io, or a small VPS.
  Set the environment variables (`TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`) in
  that platform's dashboard — never commit `.env` to git.
- **Frontend**: deploy `index.html` anywhere static — Vercel, Netlify,
  Cloudflare Pages, or even the same server. Update the `API_URL` constant
  near the bottom of `index.html` to point at your live backend URL instead
  of `localhost:3000`.
- **Multiple channels**: add more entries to `CHANNEL_MAP` in `server.js`
  and matching `<option>` tags in the `#channel` dropdown in `index.html`.
- **Auth**: add a simple password/login check before letting anyone hit
  `/api/post-signal` — right now anyone with the URL could post. Even a
  shared secret header is enough for a small team.
- **Chart image attachment**: swap `sendMessage` for `sendPhoto` in
  `server.js`, sending the image as multipart form data with a caption.
- **Auto-manage / TP tracking**: this needs a price feed (e.g. a forex/crypto
  API) polled on a schedule (cron job) that checks open signals against
  live prices and calls `sendMessage` again with a "TP1 hit ✅" follow-up.
  That's a meaningfully bigger project — happy to help design it whenever
  you're ready.

## Files

- `index.html` — the form UI
- `server.js` — the backend that talks to Telegram
- `.env.example` — template for your secrets (copy to `.env`)
- `package.json` — dependencies
