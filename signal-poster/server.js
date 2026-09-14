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

// Map your frontend's "channel" values to a bot token + chat ID pair.
// Chat IDs for channels/groups usually look like -1001234567890
const CHANNELS = {
  trading_floor: {
    botToken: process.env.TELEGRAM_BOT_TOKEN,
    chatId: process.env.TELEGRAM_CHAT_ID,
  },
  foundryfx_floor: {
    botToken: process.env.TELEGRAM_BOT_TOKEN_2,
    chatId: process.env.TELEGRAM_CHAT_ID_2,
  },
};

// Keeps track of posted signals so the form can show TP boxes and mark
// them as hit. This resets if the server restarts (that's fine for now).
let activeSignals = [];

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

    // Check password
    if (!sig.password || sig.password !== process.env.APP_PASSWORD) {
      return res.status(401).json({ error: "Incorrect password" });
    }

    // Basic validation
    if (!sig.entry || !sig.sl || !sig.tps || sig.tps.length === 0) {
      return res.status(400).json({ error: "Missing required fields (entry, SL, TP1)" });
    }

    const channelConfig = CHANNELS[sig.channel];
    if (!channelConfig || !channelConfig.chatId) {
      return res.status(400).json({ error: "Unknown channel" });
    }
    if (!channelConfig.botToken) {
      return res.status(500).json({ error: "Server missing bot token for this channel" });
    }

    const text = formatSignalMessage(sig);

    const tgRes = await fetch(`https://api.telegram.org/bot${channelConfig.botToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: channelConfig.chatId,
        text,
        parse_mode: "Markdown",
      }),
    });

    const tgData = await tgRes.json();

    if (!tgData.ok) {
      return res.status(500).json({ error: tgData.description || "Telegram API error" });
    }

    // Remember this signal so we can show TP boxes and mark hits later
    const signalRecord = {
      id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      channel: sig.channel,
      direction: sig.direction,
      pair: sig.pair,
      entry: sig.entry,
      sl: sig.sl,
      tps: sig.tps,
      hits: sig.tps.map(() => false),
      messageId: tgData.result.message_id,
      createdAt: Date.now(),
    };
    activeSignals.unshift(signalRecord);

    res.json({ success: true, signal: signalRecord });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Returns all currently tracked signals, newest first
app.get("/api/signals", (req, res) => {
  res.json({ signals: activeSignals });
});

// Marks a specific TP as hit and posts a reply in the original Telegram thread
app.post("/api/mark-tp", async (req, res) => {
  try {
    const { password, signalId, tpIndex } = req.body;

    if (!password || password !== process.env.APP_PASSWORD) {
      return res.status(401).json({ error: "Incorrect password" });
    }

    const signal = activeSignals.find((s) => s.id === signalId);
    if (!signal) {
      return res.status(404).json({ error: "Signal not found (server may have restarted)" });
    }
    if (signal.hits[tpIndex]) {
      return res.status(400).json({ error: "That TP is already marked" });
    }

    const channelConfig = CHANNELS[signal.channel];
    if (!channelConfig) {
      return res.status(400).json({ error: "Unknown channel for this signal" });
    }

    const text = `🎯 TP${tpIndex + 1} HIT for ${signal.direction} ${signal.pair} ✅`;

    const tgRes = await fetch(`https://api.telegram.org/bot${channelConfig.botToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: channelConfig.chatId,
        text,
        reply_to_message_id: signal.messageId,
      }),
    });

    const tgData = await tgRes.json();
    if (!tgData.ok) {
      return res.status(500).json({ error: tgData.description || "Telegram API error" });
    }

    signal.hits[tpIndex] = true;
    res.json({ success: true, signal });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Marks the stop loss as hit: posts a reply in Telegram, then removes the signal
app.post("/api/mark-sl", async (req, res) => {
  try {
    const { password, signalId } = req.body;

    if (!password || password !== process.env.APP_PASSWORD) {
      return res.status(401).json({ error: "Incorrect password" });
    }

    const signal = activeSignals.find((s) => s.id === signalId);
    if (!signal) {
      return res.status(404).json({ error: "Signal not found (server may have restarted)" });
    }

    const channelConfig = CHANNELS[signal.channel];
    if (!channelConfig) {
      return res.status(400).json({ error: "Unknown channel for this signal" });
    }

    const text = `❌ STOP LOSS HIT for ${signal.direction} ${signal.pair} ❌`;

    const tgRes = await fetch(`https://api.telegram.org/bot${channelConfig.botToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: channelConfig.chatId,
        text,
        reply_to_message_id: signal.messageId,
      }),
    });

    const tgData = await tgRes.json();
    if (!tgData.ok) {
      return res.status(500).json({ error: tgData.description || "Telegram API error" });
    }

    activeSignals = activeSignals.filter((s) => s.id !== signalId);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Removes a signal from the tracked list (doesn't delete anything from Telegram)
app.post("/api/remove-signal", (req, res) => {
  const { password, signalId } = req.body;
  if (!password || password !== process.env.APP_PASSWORD) {
    return res.status(401).json({ error: "Incorrect password" });
  }
  activeSignals = activeSignals.filter((s) => s.id !== signalId);
  res.json({ success: true });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
