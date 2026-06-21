const express = require('express');
const mongoose = require('mongoose');
const { Order, Product, Coupon, Cart, normalizeSizeKey, toPlainSizeStock, resolveSizeKeyInStock, invalidateSoldTodayCache } = require('../db/models');
const { authMiddleware, resolveSessionUserId } = require('../middleware/auth');

const router = express.Router();
const wrap = (fn) => (req, res, next) => fn(req, res, next).catch(next);

const KUPEC_NAME_RE = /^[A-Za-zČčŠšŽžĆćĐđ\-\s'.]{2,60}$/;
const KUPEC_PHONE_RE = /^\+?[0-9\s()\/-]{8,20}$/;
const KUPEC_EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const ALLOWED_SHIPPING = new Set(['posta', 'prednostna', 'osebno']);
const ALLOWED_PAYMENT = new Set(['povzetje', 'kartica', 'leanpay']);

function validateKupec(kup) {
  if (!KUPEC_NAME_RE.test(String(kup.ime || '').trim())) return 'Vnesi veljavno ime.';
  if (!KUPEC_NAME_RE.test(String(kup.priimek || '').trim())) return 'Vnesi veljaven priimek.';
  if (!/^.{4,100}$/.test(String(kup.ulica || '').trim())) return 'Vnesi veljavno ulico in hisno stevilko.';
  if (!/^\d{4}$/.test(String(kup.posta || '').trim())) return 'Postna stevilka mora imeti 4 stevilke.';
  if (!KUPEC_NAME_RE.test(String(kup.kraj || '').trim())) return 'Vnesi veljaven kraj.';
  const phoneRaw = String(kup.telefon || '').trim();
  const phoneDigits = phoneRaw.replace(/[^\d]/g, '');
  if (!KUPEC_PHONE_RE.test(phoneRaw) || phoneDigits.length < 8 || phoneDigits.length > 15) return 'Vnesi veljavno telefonsko stevilko.';
  if (!KUPEC_EMAIL_RE.test(String(kup.email || '').trim())) return 'Vnesi veljaven e-postni naslov.';
  if (!ALLOWED_SHIPPING.has(String(kup.dostava || '').trim())) return 'Izberi veljaven nacin dostave.';
  if (!ALLOWED_PAYMENT.has(String(kup.placilo || '').trim())) return 'Izberi veljaven nacin placila.';
  return null;
}

router.post('/api/order', authMiddleware, wrap(async (req, res) => {
  try {
    const { kupec, izdelki, couponCode } = req.body;
    if (!kupec || !Array.isArray(izdelki) || !izdelki.length) return res.status(400).send('Podatki niso popolni.');

    const validErr = validateKupec(kupec);
    if (validErr) return res.status(400).json({ error: validErr });

    const userId = await resolveSessionUserId(req.session.user);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    // Korak 1: zberi vse productId-je in jih fetchaj V ENEM klicu
    const validIds = [...new Set(
      izdelki.map((i) => i.productId).filter((id) => id && mongoose.Types.ObjectId.isValid(id))
    )];
    const byIdMap = new Map();
    if (validIds.length) {
      const fetched = await Product.find({ _id: { $in: validIds } }).lean();
      fetched.forEach((p) => byIdMap.set(String(p._id), p));
    }

    // Razreši ime → ID za elemente brez veljavnega productId (en poizvedba na unikaten naziv)
    const unresolvedNames = [...new Set(
      izdelki.filter((i) => !byIdMap.has(String(i.productId || '')))
              .map((i) => String(i.ime || '').trim()).filter(Boolean)
    )];
    if (unresolvedNames.length) {
      const byName = await Product.find({ name: { $in: unresolvedNames } }).sort({ createdAt: -1 }).lean();
      byName.forEach((p) => { if (!byIdMap.has(String(p._id))) byIdMap.set(p.name, p); });
    }

    // Zgradi Map: compoundKey → qty
    const productSizeQty = new Map();
    for (const item of izdelki) {
      const qty = Math.max(1, Math.floor(Number(item?.kolicina || 1)));
      const product = byIdMap.get(String(item.productId || '')) || byIdMap.get(String(item.ime || '').trim());
      if (!product) continue;
      const key = `${String(product._id)}::${String(item.size || '').trim()}`;
      productSizeQty.set(key, (productSizeQty.get(key) || 0) + qty);
    }

    // Korak 2: preveri zalogo (produkti so že v byIdMap)
    for (const [compoundKey, qty] of productSizeQty.entries()) {
      const [productId, sizeRaw = ''] = compoundKey.split('::');
      const product = byIdMap.get(productId);
      if (!product) return res.status(400).json({ error: 'Eden izmed izdelkov ni vec na zalogi.' });
      const mapObj = toPlainSizeStock(product.sizeStock);
      const resolvedKey = resolveSizeKeyInStock(mapObj, normalizeSizeKey(sizeRaw));
      if (resolvedKey) {
        if (Number(mapObj[resolvedKey] || 0) < qty) return res.status(400).json({ error: `Velikost ${sizeRaw || resolvedKey} ni vec na zalogi.` });
      } else if (Number(product.stock || 0) < qty) {
        return res.status(400).json({ error: 'Eden izmed izdelkov ni vec na zalogi.' });
      }
    }

    // Korak 3: posodobi zalogo — paralelno z Promise.all
    await Promise.all([...productSizeQty.entries()].map(async ([compoundKey, qty]) => {
      const [productId, sizeRaw = ''] = compoundKey.split('::');
      const product = byIdMap.get(productId);
      if (!product) return;
      const mapObj = toPlainSizeStock(product.sizeStock);
      const resolvedKey = resolveSizeKeyInStock(mapObj, normalizeSizeKey(sizeRaw));
      let nextStock;
      if (resolvedKey) {
        mapObj[resolvedKey] = Math.max(0, Math.floor(Number(mapObj[resolvedKey] || 0) - qty));
        nextStock = Object.values(mapObj).reduce((s, v) => s + Number(v || 0), 0);
      } else {
        nextStock = Math.max(0, Math.floor(Number(product.stock || 0) - qty));
      }
      await Product.updateOne({ _id: productId }, { $set: { sizeStock: mapObj, stock: nextStock }, $inc: { soldCount: qty } });
    }));

    const itemsTotal = izdelki.reduce((s, i) => s + Number(i.cena || 0) * Math.max(1, Math.floor(Number(i?.kolicina || 1))), 0);
    const discountAmount = Number(izdelki.reduce((s, i) => {
      if (!(i.hasDiscount === true || i.hasDiscount === '1')) return s;
      const diff = Number(i.oldCena || 0) - Number(i.cena || 0);
      return diff > 0 ? s + diff * Math.max(1, Math.floor(Number(i?.kolicina || 1))) : s;
    }, 0).toFixed(2));

    const dodatki = (String(kupec.placilo || '') === 'povzetje' ? 3 : 0) + (String(kupec.dostava || '') === 'prednostna' ? 4 : 0);

    let couponDiscountAmount = 0;
    let appliedCoupon = null;
    if (couponCode) {
      const cleanCode = String(couponCode).trim().toUpperCase();
      const coupon = await Coupon.findOne({ code: cleanCode, active: true });
      if (coupon && (!coupon.expiresAt || coupon.expiresAt > new Date()) && (coupon.maxUses === 0 || coupon.usedCount < coupon.maxUses)) {
        if (!await Order.exists({ userId, couponCode: cleanCode })) {
          couponDiscountAmount = Number(((itemsTotal * coupon.discount) / 100).toFixed(2));
          appliedCoupon = coupon;
        }
      }
    }

    const finalTotal = Number(Math.max(0, itemsTotal + dodatki - couponDiscountAmount).toFixed(2));
    await new Order({ userId, kupec, izdelki, itemsTotal: Number(itemsTotal.toFixed(2)), discountAmount, couponCode: appliedCoupon?.code || '', couponDiscount: couponDiscountAmount, finalTotal, status: 'Oddano' }).save();
    if (appliedCoupon) await Coupon.updateOne({ _id: appliedCoupon._id }, { $inc: { usedCount: 1 } });
    // Po uspešnem naročilu izprazni strežniško košarico (sicer se izdelki vrnejo).
    await Cart.findOneAndUpdate({ userId }, { items: [] }, { upsert: true });
    invalidateSoldTodayCache();

    res.status(200).json({ message: 'Narocilo je bilo uspesno oddano.', discountAmount, couponDiscount: couponDiscountAmount, finalTotal });
  } catch (_err) {
    res.status(500).send('Napaka pri obdelavi narocila.');
  }
}));

router.post('/api/coupons/validate', authMiddleware, wrap(async (req, res) => {
  try {
    const code = String(req.body.code || '').trim().toUpperCase();
    if (!code) return res.status(400).json({ error: 'Vnesi kodo.' });
    const coupon = await Coupon.findOne({ code });
    if (!coupon) return res.status(404).json({ error: 'Koda ni veljavna.' });
    if (!coupon.active) return res.status(400).json({ error: 'Koda ni aktivna.' });
    if (coupon.expiresAt && coupon.expiresAt < new Date()) return res.status(400).json({ error: 'Koda je potekla.' });
    if (coupon.maxUses > 0 && coupon.usedCount >= coupon.maxUses) return res.status(400).json({ error: 'Koda je bila ze prevec uporabljena.' });
    const userId = await resolveSessionUserId(req.session.user);
    if (userId && await Order.exists({ userId, couponCode: code })) return res.status(400).json({ error: 'To kodo si ze uporabil.' });
    res.json({ ok: true, discount: coupon.discount, code: coupon.code });
  } catch (_err) {
    res.status(500).json({ error: 'Napaka.' });
  }
}));

router.get('/api/my-orders', authMiddleware, wrap(async (req, res) => {
  const userId = await resolveSessionUserId(req.session.user);
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  const orders = await Order.find({ userId }).sort({ datum: -1 }).lean();
  res.json(orders.map((o) => ({ ...o, status: String(o.status || 'Oddano') })));
}));

module.exports = router;
