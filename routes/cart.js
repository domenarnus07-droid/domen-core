const express = require('express');
const { Cart } = require('../db/models');
const { authMiddleware, resolveSessionUserId } = require('../middleware/auth');

const router = express.Router();
const wrap = (fn) => (req, res, next) => fn(req, res, next).catch(next);

// GET /api/cart — vrne košarico prijavljenega uporabnika
router.get('/api/cart', authMiddleware, wrap(async (req, res) => {
  const userId = await resolveSessionUserId(req.session.user);
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  const cart = await Cart.findOne({ userId }).lean();
  res.json(cart ? cart.items : []);
}));

// POST /api/cart/sync — zamenja celotno košarico (ob prijavi iz localStorage)
router.post('/api/cart/sync', authMiddleware, wrap(async (req, res) => {
  const userId = await resolveSessionUserId(req.session.user);
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  const items = Array.isArray(req.body?.items) ? req.body.items : [];
  const cleaned = items.map((item) => ({
    productId: String(item?.productId || '').trim(),
    ime: String(item?.ime || '').trim(),
    cena: Math.max(0, Number(item?.cena || 0)),
    oldCena: Math.max(0, Number(item?.oldCena || 0)),
    hasDiscount: Boolean(item?.hasDiscount),
    image: String(item?.image || '').trim(),
    size: String(item?.size || '').trim(),
    kolicina: Math.max(1, Math.floor(Number(item?.kolicina || 1))),
  })).filter((item) => item.productId);
  await Cart.findOneAndUpdate({ userId }, { items: cleaned }, { upsert: true, new: true });
  res.json({ ok: true });
}));

// DELETE /api/cart — izprazni košarico
router.delete('/api/cart', authMiddleware, wrap(async (req, res) => {
  const userId = await resolveSessionUserId(req.session.user);
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  await Cart.findOneAndUpdate({ userId }, { items: [] }, { upsert: true });
  res.json({ ok: true });
}));

module.exports = router;
