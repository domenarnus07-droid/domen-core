const express = require('express');
const mongoose = require('mongoose');
const { User, Order, Coupon, Rating, Wishlist, AiChatLog } = require('../db/models');
const { authMiddleware, adminOnly } = require('../middleware/auth');

const router = express.Router();

router.get('/api/admin/users', authMiddleware, adminOnly, async (_req, res) => {
  try {
    const users = await User.find().select('username email role avatar password').sort({ username: 1 }).lean();
    return res.json(users.map((u) => ({ ...u, passwordPlain: null, passwordMasked: u.password ? '********' : '', hasPassword: Boolean(u.password) })));
  } catch (_err) {
    return res.status(500).json({ error: 'Napaka pri nalaganju uporabnikov.' });
  }
});

router.delete('/api/admin/users/:id', authMiddleware, adminOnly, async (req, res) => {
  try {
    const userId = String(req.params.id || '').trim();
    if (!mongoose.Types.ObjectId.isValid(userId)) return res.status(400).json({ error: 'Neveljaven ID uporabnika.' });
    if (String(req.session.user?.id || '') === userId) return res.status(400).json({ error: 'Trenutno prijavljenega admina ni mogoc izbrisati.' });
    const targetUser = await User.findById(userId).select('role').lean();
    if (!targetUser) return res.status(404).json({ error: 'Uporabnik ne obstaja.' });
    if (String(targetUser.role || '') === 'admin') return res.status(400).json({ error: 'Admin uporabnika ni mogoc izbrisati.' });
    await User.deleteOne({ _id: userId });
    await Wishlist.deleteMany({ userId: String(userId) });
    await AiChatLog.deleteMany({ userId: String(userId) });
    return res.json({ success: true });
  } catch (_err) {
    return res.status(500).json({ error: 'Napaka pri brisanju uporabnika.' });
  }
});

router.get('/api/admin/orders', authMiddleware, adminOnly, async (_req, res) => {
  const orders = await Order.find().sort({ datum: -1 }).lean();
  const userIds = [...new Set(orders.map((o) => String(o.userId || '')).filter((id) => mongoose.Types.ObjectId.isValid(id)))];
  const users = await User.find({ _id: { $in: userIds } }).select('username email').lean();
  const userMap = new Map(users.map((u) => [String(u._id), u]));
  const enriched = orders.map((order) => {
    const account = userMap.get(String(order.userId || ''));
    return { ...order, status: String(order.status || 'Oddano'), account: account ? { username: account.username || '', email: account.email || '' } : { username: '', email: '' } };
  });
  res.json(enriched);
});

router.put('/api/admin/orders/:id/status', authMiddleware, adminOnly, async (req, res) => {
  try {
    const orderId = String(req.params.id || '').trim();
    if (!mongoose.Types.ObjectId.isValid(orderId)) return res.status(400).json({ error: 'Neveljaven ID narocila.' });
    const nextStatus = String(req.body?.status || '').trim();
    if (!['Oddano', 'Potrjeno', 'Poslano', 'Dostavljeno'].includes(nextStatus)) return res.status(400).json({ error: 'Neveljaven status narocila.' });
    const updated = await Order.findByIdAndUpdate(orderId, { $set: { status: nextStatus } }, { new: true }).lean();
    if (!updated) return res.status(404).json({ error: 'Narocilo ne obstaja.' });
    return res.json({ success: true, orderId: String(updated._id), status: String(updated.status || nextStatus) });
  } catch (_err) {
    return res.status(500).json({ error: 'Napaka pri posodobitvi statusa.' });
  }
});

router.get('/api/admin/coupons', authMiddleware, adminOnly, async (_req, res) => {
  const coupons = await Coupon.find().sort({ createdAt: -1 }).lean();
  res.json(coupons);
});

router.post('/api/admin/coupons', authMiddleware, adminOnly, async (req, res) => {
  try {
    const { code, discount, maxUses, expiresAt } = req.body;
    const cleanCode = String(code || '').trim().toUpperCase();
    const discountNum = Number(discount);
    if (!cleanCode || cleanCode.length < 2 || cleanCode.length > 30) return res.status(400).json({ error: 'Koda mora biti med 2 in 30 znakov.' });
    if (!Number.isFinite(discountNum) || discountNum < 1 || discountNum > 100) return res.status(400).json({ error: 'Popust mora biti med 1 in 100%.' });
    if (await Coupon.findOne({ code: cleanCode })) return res.status(400).json({ error: 'Koda ze obstaja.' });
    const coupon = new Coupon({ code: cleanCode, discount: discountNum, maxUses: Number(maxUses || 0), expiresAt: expiresAt ? new Date(expiresAt) : null });
    await coupon.save();
    res.status(201).json(coupon);
  } catch (_err) {
    res.status(500).json({ error: 'Napaka.' });
  }
});

router.delete('/api/admin/coupons/:id', authMiddleware, adminOnly, async (req, res) => {
  try {
    await Coupon.findByIdAndDelete(req.params.id);
    res.json({ ok: true });
  } catch (_err) {
    res.status(500).json({ error: 'Napaka.' });
  }
});

router.patch('/api/admin/coupons/:id/toggle', authMiddleware, adminOnly, async (req, res) => {
  try {
    const coupon = await Coupon.findById(req.params.id);
    if (!coupon) return res.status(404).json({ error: 'Kupon ni najden.' });
    coupon.active = !coupon.active;
    await coupon.save();
    res.json({ ok: true, active: coupon.active });
  } catch (_err) {
    res.status(500).json({ error: 'Napaka.' });
  }
});

router.get('/api/admin/ratings', authMiddleware, adminOnly, async (_req, res) => {
  const ratings = await Rating.find().sort({ date: -1 }).lean();
  res.json(ratings.map((r) => ({ ...r, username: r.username || 'Gost', email: r.email || '' })));
});

router.get('/api/admin/ai-history', authMiddleware, adminOnly, async (_req, res) => {
  try {
    const rows = await AiChatLog.find().select('username email userMessage assistantMessage provider createdAt').sort({ createdAt: -1 }).limit(300).lean();
    return res.json(rows);
  } catch (_err) {
    return res.json([]);
  }
});

module.exports = router;
