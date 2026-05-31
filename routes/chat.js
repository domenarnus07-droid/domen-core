const express = require('express');
const path = require('path');
const { Message, AiChatLog, FunnelEvent, Product } = require('../db/models');
const { authMiddleware, resolveSessionUserId } = require('../middleware/auth');

const router = express.Router();
const wrap = (fn) => (req, res, next) => fn(req, res, next).catch(next);

// ===== CHAT PAGE =====

router.get('/chat.html', authMiddleware, (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'chat.html'));
});

router.get('/api/messages', authMiddleware, wrap(async (req, res) => {
  const messages = await Message.find().sort({ timestamp: 1 });
  res.json(messages);
}));

router.post('/api/messages', authMiddleware, wrap(async (req, res) => {
  const { message } = req.body;
  if (!message) return res.status(400).send('Sporocilo ne sme biti prazno');
  await new Message({ username: req.session.user.username, message }).save();
  res.status(201).send('Sporocilo shranjeno');
}));

// ===== AI CHAT =====

function normalizeAiText(value) {
  return String(value || '').trim().replace(/\s+/g, ' ').slice(0, 1200);
}

function normalizeAiHistory(value) {
  if (!Array.isArray(value)) return [];
  const out = [];
  for (const item of value.slice(-10)) {
    if (!item || typeof item !== 'object') continue;
    const role = String(item.role || '').toLowerCase();
    const content = normalizeAiText(item.content || '');
    const validRole = role === 'assistant' ? 'assistant' : role === 'user' ? 'user' : '';
    if (!validRole || !content) continue;
    out.push({ role: validRole, content });
  }
  return out;
}

function isStoreRelatedQuestion(message, products = []) {
  const text = normalizeAiText(message).toLowerCase();
  if (!text) return false;
  const keywords = ['dostav', 'placil', 'kartic', 'narocil', 'status', 'vrac', 'reklamac'];
  if (keywords.some((k) => text.includes(k))) return true;
  return products.some((p) => text.includes(String(p.name || '').toLowerCase()));
}

function getFixedAiReply(message, products = []) {
  const text = normalizeAiText(message).toLowerCase();
  const has = (k) => text.includes(k);
  if (!isStoreRelatedQuestion(text, products)) return 'Odgovarjam samo na vprasanja o dostavi, placilu s kartico, statusu narocila in vracilih.';
  if (has('dostav')) return 'Dostava: na dom, prednostna dostava (+4 EUR) ali osebni prevzem.';
  if (has('placil') || has('kartic') || has('povzet') || has('leanpay')) return 'Spletno placilo s kartico: vnesi ime na kartici, stevilko kartice, veljavnost in CVC.';
  if (has('vrac') || has('reklamac')) return 'Za vracilo ali reklamacijo odpri Podpora > Kontakt in poslji stevilko narocila.';
  if (has('narocil') || has('status') || has('oddano') || has('poslano') || has('dostavljeno')) return 'Status narocila preveri v My Orders: Oddano -> Potrjeno -> Poslano -> Dostavljeno.';
  return 'Lahko pomagam pri: dostavi, placilu s kartico, statusu narocila in vracilih.';
}

async function fetchOpenAiReply(message, products = [], history = []) {
  const fixedOnly = String(process.env.AI_FIXED_ONLY || '1').trim() !== '0';
  if (fixedOnly) return null;
  const apiKey = String(process.env.OPENAI_API_KEY || '').trim();
  if (!apiKey) return null;
  const model = String(process.env.OPENAI_MODEL || 'gpt-4o-mini').trim();
  const catalog = products.slice(0, 8).map((p) => `- ${String(p.name || '')} | ${String(p.subcategory || '')} | ${Number(p.price || 0).toFixed(2)} EUR`).join('\n');
  const system = ['Ti si AI pomocnik za spletno trgovino Domen Core.', 'Odgovarjaj kratko, konkretno in v slovenscini.', 'Odgovarjas samo o Domen Core spletni strani, izdelkih in nakupu na tej strani.', catalog ? `Kratek katalog:\n${catalog}` : ''].filter(Boolean).join('\n');
  const input = [{ role: 'system', content: system }];
  for (const turn of normalizeAiHistory(history)) input.push({ role: turn.role, content: turn.content });
  input.push({ role: 'user', content: normalizeAiText(message) });
  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model, input, temperature: 0.4 })
  });
  if (!response.ok) return null;
  const data = await response.json().catch(() => ({}));
  const text = normalizeAiText(data.output_text || '');
  return text || null;
}

router.post('/api/ai-chat', authMiddleware, wrap(async (req, res) => {
  try {
    const message = normalizeAiText(req.body?.message || '');
    const history = normalizeAiHistory(req.body?.history);
    if (!message) return res.status(400).json({ error: 'Vprasanje je prazno.' });
    const products = [];
    const isRelated = isStoreRelatedQuestion(message, products);
    const aiReply = isRelated ? await fetchOpenAiReply(message, products, history) : null;
    const reply = aiReply || getFixedAiReply(message, products);
    const provider = aiReply ? 'openai' : 'fallback';
    const userId = await resolveSessionUserId(req.session.user);
    if (userId) {
      try {
        await AiChatLog.create({ userId: String(userId), username: String(req.session.user?.username || ''), email: String(req.session.user?.email || ''), userMessage: message, assistantMessage: reply, provider });
      } catch (_err) {}
    }
    return res.json({ reply });
  } catch (_err) {
    return res.json({ reply: getFixedAiReply(req.body?.message || '', []) });
  }
}));

router.get('/api/ai-history', authMiddleware, wrap(async (req, res) => {
  try {
    const userId = await resolveSessionUserId(req.session.user);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    const rows = await AiChatLog.find({ userId: String(userId) }).select('userMessage assistantMessage provider createdAt').sort({ createdAt: 1 }).limit(120).lean();
    return res.json(rows);
  } catch (_err) {
    return res.json([]);
  }
}));

router.get('/api/ai-chat/status', authMiddleware, (req, res) => {
  const fixedOnly = String(process.env.AI_FIXED_ONLY || '1').trim() !== '0';
  const hasOpenAi = Boolean(String(process.env.OPENAI_API_KEY || '').trim());
  return res.json({ online: true, provider: fixedOnly ? 'fallback' : (hasOpenAi ? 'openai' : 'fallback') });
});

// ===== ANALYTICS =====

router.post('/api/analytics/funnel', authMiddleware, wrap(async (req, res) => {
  try {
    const stage = String(req.body?.stage || '').trim();
    const page = String(req.body?.page || '').trim();
    const meta = req.body?.meta && typeof req.body.meta === 'object' ? req.body.meta : {};
    if (!stage) return res.status(400).json({ error: 'Stage je obvezen.' });
    const userId = await resolveSessionUserId(req.session.user);
    await FunnelEvent.create({ userId: String(userId || ''), username: String(req.session.user?.username || ''), stage, page, meta });
    return res.json({ ok: true });
  } catch (_err) {
    return res.status(500).json({ error: 'Napaka pri belezenju funnel dogodka.' });
  }
}));

// ===== SOCKET.IO SETUP =====

function initSocket(io, sessionMiddleware) {
  io.use((socket, next) => sessionMiddleware(socket.request, {}, next));
  io.on('connection', (socket) => {
    const session = socket.request.session;
    if (!session.user) { socket.disconnect(); return; }
    socket.on('chat message', async (msg) => {
      const newMessage = new Message({ username: session.user.username, message: msg });
      await newMessage.save();
      io.emit('chat message', { username: session.user.username, message: msg, timestamp: newMessage.timestamp });
    });
  });
}

module.exports = { router, initSocket };
