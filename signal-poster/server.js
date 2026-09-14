// server.js
// A minimal Node/Express backend that receives signal data from the
// frontend form and posts it to a Telegram channel/group via a bot.
//
// SETUP:
// 1. npm init -y
// 2. npm install express cors dotenv node-fetch@2
// 3. Create a .env file (see .env.example) with your bot token + chat id
// 4. node server.js
//
// This keeps your Telegram bot token OFF the frontend — the browser
// never sees it, only this server does.

require("dotenv").config();
const express = require("express");
const cors = require("cors");
const fetch = require("node-fetch");

const app = express();
app.use(cors());
app.use(express.json());

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

// Map your frontend's "channel" values to real Telegram chat IDs.
// Chat IDs for channels usually look like -1001234567890
const CHANNEL_MAP = {
  trading_floor: process.env.TELEGRAM_CHAT_ID,
};

function formatSignalMessage(sig) {
  const circle = sig.direction === "BUY" ? "🟢" : "🔴";
  const tpLines = sig.tps
    .map((tp, i) => `🎯 TP${i + 1}: ${tp}`)
    .join("\n");

  let msg = `${circle}${circle} *${sig.direction} ${sig.pair}* ${circle}${circle}\n`;
  msg += `Entry: ${sig.entry}\n\n`;
  if (tpLines) msg += `${tpLines}\n`;
  msg += `\n❌ SL: ${sig.sl}`;
  if (sig.notes) msg += `\n\n📝 ${sig.notes}`;
  msg += `\n\n⚠️ Manage your risk carefully.`;
  return msg;
}

app.post("/api/post-signal", async (req, res) => {
  try {
    const sig = req.body;

    // Basic validation
    if (!sig.entry || !sig.sl || !sig.tps || sig.tps.length === 0) {
      return res.status(400).json({ error: "Missing required fields (entry, SL, TP1)" });
    }

    const chatId = CHANNEL_MAP[sig.channel];
    if (!chatId) {
      return res.status(400).json({ error: "Unknown channel" });
    }
    if (!BOT_TOKEN) {
      return res.status(500).json({ error: "Server missing TELEGRAM_BOT_TOKEN" });
    }

    const text = formatSignalMessage(sig);

    const tgRes = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: "Markdown",
      }),
    });

    const tgData = await tgRes.json();

    if (!tgData.ok) {
      return res.status(500).json({ error: tgData.description || "Telegram API error" });
    }

    res.json({ success: true, message_id: tgData.result.message_id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
