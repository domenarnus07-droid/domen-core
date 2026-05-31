const express = require('express');
const path = require('path');
const fs = require('fs/promises');
const mongoose = require('mongoose');
const { Product, Wishlist, Rating, buildSoldTodayMap, invalidateSoldTodayCache, toPlainSizeStock, normalizeSizeStock, parseSizeStockInput, buildOldPriceVisibleUntil, MEN_SHOE_SIZES, WOMEN_SHOE_SIZES } = require('../db/models');
const { authMiddleware, adminOnly, resolveSessionUserId } = require('../middleware/auth');

const router = express.Router();

// Wrapper: ujame async napake in jih preda Express error handlerju.
const wrap = (fn) => (req, res, next) => fn(req, res, next).catch(next);

// ===== PUBLIC PRODUCT ROUTES =====

router.get('/api/products', wrap(async (req, res) => {
  const { category, subcategory, sort } = req.query;
  const filter = {};
  const safeCategory = String(category || '').trim();
  const safeSubcategory = String(subcategory || '').trim();
  if (safeCategory) filter.category = new RegExp(`^${safeCategory.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i');
  if (safeSubcategory) filter.subcategory = new RegExp(`^${safeSubcategory.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i');

  let sortBy = { createdAt: -1 };
  if (sort === 'price_asc') sortBy = { price: 1 };
  if (sort === 'price_desc') sortBy = { price: -1 };
  if (sort === 'newest') sortBy = { createdAt: -1 };
  if (sort === 'bestseller') sortBy = { soldCount: -1, createdAt: -1 };

  const products = await Product.find(filter).sort(sortBy);
  const ids = products.map((p) => String(p?._id || '')).filter(Boolean);
  const soldTodayMap = await buildSoldTodayMap(ids);
  const enriched = products.map((p) => {
    const plain = typeof p.toObject === 'function' ? p.toObject() : p;
    return { ...plain, soldToday: Number(soldTodayMap.get(String(plain?._id || '')) || 0) };
  });
  res.json(enriched);
}));

router.get('/api/products/best-sellers', wrap(async (req, res) => {
  const limit = Math.max(1, Math.min(12, Number(req.query.limit) || 4));
  const products = await Product.find().sort({ soldCount: -1, createdAt: -1 }).limit(limit);
  const enriched = products.map((product) => {
    const plain = typeof product.toObject === 'function' ? product.toObject() : product;
    const sizeStockMap = toPlainSizeStock(plain.sizeStock);
    const stockFromSizes = Object.values(sizeStockMap).reduce((acc, val) => acc + Number(val || 0), 0);
    const effectiveStock = stockFromSizes > 0 ? stockFromSizes : Math.max(0, Math.floor(Number(plain.stock || 0)));
    return { ...plain, effectiveStock, lowStock: effectiveStock > 0 && effectiveStock <= 4 };
  });
  res.json(enriched);
}));

router.get('/api/products/:id', wrap(async (req, res) => {
  const productId = String(req.params.id || '').trim();
  if (!mongoose.Types.ObjectId.isValid(productId)) return res.status(400).json({ error: 'Neveljaven ID izdelka.' });
  const product = await Product.findById(productId);
  if (!product) return res.status(404).json({ error: 'Izdelek ne obstaja.' });
  const soldTodayMap = await buildSoldTodayMap([productId]);
  const plain = typeof product.toObject === 'function' ? product.toObject() : product;
  return res.json({ ...plain, soldToday: Number(soldTodayMap.get(productId) || 0) });
}));

// ===== WISHLIST =====

router.get('/api/wishlist', authMiddleware, wrap(async (req, res) => {
  const userId = await resolveSessionUserId(req.session.user);
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  const docs = await Wishlist.find({ userId });
  res.json(docs.map((d) => d.productId));
}));

router.post('/api/wishlist/toggle', authMiddleware, wrap(async (req, res) => {
  const userId = await resolveSessionUserId(req.session.user);
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  const productId = String(req.body?.productId || '');
  if (!productId) return res.status(400).json({ error: 'Manjka productId.' });
  const existing = await Wishlist.findOne({ userId, productId });
  if (existing) {
    await Wishlist.deleteOne({ _id: existing._id });
    return res.json({ wished: false });
  }
  await Wishlist.create({ userId, productId });
  return res.json({ wished: true });
}));

// ===== RATINGS =====

router.get('/api/ratings/summary', wrap(async (req, res) => {
  const idsRaw = String(req.query.ids || '').trim();
  const ids = idsRaw ? idsRaw.split(',').map((id) => String(id).trim()).filter(Boolean) : [];
  const matchStage = ids.length ? { productId: { $in: ids } } : {};
  const grouped = await Rating.aggregate([
    { $match: matchStage },
    { $group: { _id: '$productId', avg: { $avg: '$stars' }, count: { $sum: 1 } } }
  ]);
  const summary = {};
  grouped.forEach((item) => {
    const key = String(item._id || '').trim();
    if (!key) return;
    summary[key] = { avg: Number((Number(item.avg || 0)).toFixed(1)), count: Number(item.count || 0) };
  });
  res.json(summary);
}));

router.get('/api/ratings/:productId', wrap(async (req, res) => {
  const productId = String(req.params.productId || '').trim();
  if (!productId) return res.status(400).json({ error: 'Manjka productId.' });
  const ratings = await Rating.find({ productId }).sort({ date: -1 }).limit(50).lean();
  res.json(ratings.map((r) => ({
    _id: String(r._id), stars: Number(r.stars || 0),
    comment: String(r.comment || ''), username: String(r.username || 'Gost'), date: r.date
  })));
}));

router.post('/api/ratings', wrap(async (req, res) => {
  const { stars, comment, productId } = req.body;
  if (!stars || !comment || !productId) return res.status(400).send('Manjkajo podatki.');
  try {
    const sessionUser = req.session?.user || null;
    let userId = '';
    let username = 'Gost';
    let email = '';
    if (sessionUser) {
      userId = await resolveSessionUserId(sessionUser) || '';
      username = sessionUser.username || 'Gost';
      email = sessionUser.email || '';
    }
    await new Rating({ productId: String(productId), stars, comment, userId, username, email }).save();
    const stat = await Rating.aggregate([
      { $match: { productId: String(productId) } },
      { $group: { _id: '$productId', avg: { $avg: '$stars' }, count: { $sum: 1 } } }
    ]);
    const first = stat[0] || { avg: Number(stars) || 0, count: 1 };
    res.status(200).json({
      message: 'Ocena uspesno shranjena.',
      summary: { avg: Number((Number(first.avg || 0)).toFixed(1)), count: Number(first.count || 0) }
    });
  } catch (_err) {
    res.status(500).send('Napaka pri shranjevanju.');
  }
}));

// ===== ADMIN PRODUCT ROUTES =====

router.get('/api/admin/products', authMiddleware, adminOnly, async (_req, res) => {
  const products = await Product.find().sort({ createdAt: -1 });
  res.json(products);
});

router.post('/api/admin/products', authMiddleware, adminOnly, async (req, res) => {
  try {
    const { name, description, price, oldPrice, image, badge, subcategory, sizes, sizeStock, stock, soldCount, discountUntil } = req.body || {};
    const cleanName = String(name || '').trim();
    const cleanPrice = Number(price);
    if (!cleanName || Number.isNaN(cleanPrice) || cleanPrice <= 0) return res.status(400).json({ error: 'Name in price sta obvezna.' });

    const parsedOldPrice = (oldPrice === '' || oldPrice === null || oldPrice === undefined) ? null : Number(oldPrice);
    const validOldPrice = Number.isFinite(parsedOldPrice) && parsedOldPrice > 0 ? parsedOldPrice : null;
    let normalizedPrice = cleanPrice;
    let normalizedOldPrice = validOldPrice;
    if (Number.isFinite(validOldPrice)) {
      if (validOldPrice > cleanPrice) { normalizedPrice = cleanPrice; normalizedOldPrice = validOldPrice; }
      else if (validOldPrice < cleanPrice) { normalizedPrice = validOldPrice; normalizedOldPrice = cleanPrice; }
      else { normalizedOldPrice = null; }
    }

    const hay = `${cleanName} ${String(description || '')}`.toLowerCase();
    const isWomen = hay.includes('zensk');
    const autoSizes = isWomen ? [...WOMEN_SHOE_SIZES] : [...MEN_SHOE_SIZES];
    const cleanSizes = Array.isArray(sizes) ? sizes.map((s) => String(s).trim()).filter(Boolean) : String(sizes || '').split(',').map((s) => s.trim()).filter(Boolean);
    const finalSizes = cleanSizes.length ? cleanSizes : autoSizes;
    const parsedSizeStock = parseSizeStockInput(sizeStock);
    const normalizedSizeStock = normalizeSizeStock(parsedSizeStock || {}, finalSizes, Number(stock) > 0 ? Number(stock) : 20);
    const totalStock = Object.values(normalizedSizeStock).reduce((acc, val) => acc + Number(val || 0), 0);

    const created = await Product.create({
      name: cleanName, description: String(description || '').trim(),
      price: normalizedPrice, oldPrice: normalizedOldPrice,
      oldPriceVisibleUntil: normalizedOldPrice ? buildOldPriceVisibleUntil() : null,
      image: String(image || '').trim(), badge: String(badge || '').trim(),
      category: 'Cevlji', subcategory: String(subcategory || 'Nike').trim() || 'Nike',
      sizes: finalSizes, sizeStock: normalizedSizeStock, stock: totalStock,
      soldCount: Number(soldCount) >= 0 ? Number(soldCount) : 0,
      discountUntil: discountUntil ? new Date(discountUntil) : null
    });
    return res.status(201).json(created);
  } catch (_err) {
    return res.status(500).json({ error: 'Napaka pri dodajanju izdelka.' });
  }
});

router.put('/api/admin/products/:id', authMiddleware, adminOnly, async (req, res) => {
  try {
    const productId = String(req.params.id || '').trim();
    if (!mongoose.Types.ObjectId.isValid(productId)) return res.status(400).json({ error: 'Neveljaven ID izdelka.' });
    const payload = req.body || {};
    const existingProduct = await Product.findById(productId);
    if (!existingProduct) return res.status(404).json({ error: 'Izdelek ne obstaja.' });
    const update = {};

    if (Object.prototype.hasOwnProperty.call(payload, 'name')) {
      const cleanName = String(payload.name || '').trim();
      if (!cleanName) return res.status(400).json({ error: 'Name je obvezen.' });
      update.name = cleanName;
    }
    if (Object.prototype.hasOwnProperty.call(payload, 'description')) update.description = String(payload.description || '').trim();
    if (Object.prototype.hasOwnProperty.call(payload, 'price')) {
      const cleanPrice = Number(payload.price);
      if (Number.isNaN(cleanPrice) || cleanPrice <= 0) return res.status(400).json({ error: 'Price mora biti vecji od 0.' });
      update.price = cleanPrice;
    }
    if (Object.prototype.hasOwnProperty.call(payload, 'oldPrice')) {
      update.oldPrice = (payload.oldPrice === '' || payload.oldPrice === null || payload.oldPrice === undefined) ? null : (Number.isNaN(Number(payload.oldPrice)) ? null : Number(payload.oldPrice));
    }
    if (Object.prototype.hasOwnProperty.call(payload, 'image')) update.image = String(payload.image || '').trim();
    if (Object.prototype.hasOwnProperty.call(payload, 'badge')) update.badge = String(payload.badge || '').trim();
    if (Object.prototype.hasOwnProperty.call(payload, 'subcategory')) update.subcategory = String(payload.subcategory || '').trim();
    if (Object.prototype.hasOwnProperty.call(payload, 'sizes')) {
      update.sizes = Array.isArray(payload.sizes)
        ? payload.sizes.map((s) => String(s).trim()).filter(Boolean)
        : String(payload.sizes || '').split(',').map((s) => s.trim()).filter(Boolean);
    }
    if (Object.prototype.hasOwnProperty.call(payload, 'sizeStock')) {
      const parsed = parseSizeStockInput(payload.sizeStock);
      if (parsed) update.sizeStock = parsed;
    }
    if (Object.prototype.hasOwnProperty.call(payload, 'stock')) {
      const parsedStock = Number(payload.stock);
      update.stock = Number.isNaN(parsedStock) || parsedStock < 0 ? 0 : Math.floor(parsedStock);
    }
    if (Object.prototype.hasOwnProperty.call(payload, 'soldCount')) {
      const parsed = Number(payload.soldCount);
      update.soldCount = Number.isNaN(parsed) || parsed < 0 ? 0 : Math.floor(parsed);
    }
    if (Object.prototype.hasOwnProperty.call(payload, 'discountUntil')) update.discountUntil = payload.discountUntil ? new Date(payload.discountUntil) : null;

    const hasPriceInPayload = Object.prototype.hasOwnProperty.call(payload, 'price');
    const hasOldPriceInPayload = Object.prototype.hasOwnProperty.call(payload, 'oldPrice');
    if (hasPriceInPayload || hasOldPriceInPayload) {
      const nextPrice = Number(hasPriceInPayload ? update.price : (existingProduct.price || 0));
      const nextOld = Number(hasOldPriceInPayload ? update.oldPrice : existingProduct.oldPrice);
      const oldIsValid = Number.isFinite(nextOld) && nextOld > 0;
      if (!Number.isFinite(nextPrice) || nextPrice <= 0) return res.status(400).json({ error: 'Price mora biti vecji od 0.' });
      if (!oldIsValid) { update.price = nextPrice; update.oldPrice = null; update.oldPriceVisibleUntil = null; }
      else if (hasOldPriceInPayload) {
        if (nextOld > nextPrice) { update.price = nextPrice; update.oldPrice = nextOld; update.oldPriceVisibleUntil = buildOldPriceVisibleUntil(); }
        else if (nextOld < nextPrice) { update.price = nextOld; update.oldPrice = nextPrice; update.oldPriceVisibleUntil = buildOldPriceVisibleUntil(); }
        else { update.price = nextPrice; update.oldPrice = null; update.oldPriceVisibleUntil = null; }
      } else {
        update.price = nextPrice;
        update.oldPrice = nextOld > nextPrice ? nextOld : null;
        update.oldPriceVisibleUntil = nextOld > nextPrice ? buildOldPriceVisibleUntil() : null;
      }
    }

    const finalSizesForStock = Object.prototype.hasOwnProperty.call(update, 'sizes') ? update.sizes : (Array.isArray(existingProduct.sizes) ? existingProduct.sizes : []);
    const hasSizeStockInPayload = Object.prototype.hasOwnProperty.call(payload, 'sizeStock');
    const hasStockInPayload = Object.prototype.hasOwnProperty.call(payload, 'stock');
    const explicitSizeStock = Object.prototype.hasOwnProperty.call(update, 'sizeStock') ? update.sizeStock : (hasStockInPayload && !hasSizeStockInPayload ? {} : (existingProduct.sizeStock || {}));
    const fallbackStock = Object.prototype.hasOwnProperty.call(update, 'stock') ? update.stock : Number(existingProduct.stock || 0);
    const normalizedSizeStock = normalizeSizeStock(explicitSizeStock, finalSizesForStock, fallbackStock);
    update.sizeStock = normalizedSizeStock;
    update.stock = Object.values(normalizedSizeStock).reduce((acc, val) => acc + Number(val || 0), 0);
    update.category = 'Cevlji';

    const updated = await Product.findByIdAndUpdate(productId, { $set: update }, { new: true });
    return res.json(updated);
  } catch (_err) {
    return res.status(500).json({ error: 'Napaka pri posodabljanju izdelka.' });
  }
});

router.delete('/api/admin/products/:id', authMiddleware, adminOnly, async (req, res) => {
  try {
    const productId = String(req.params.id || '').trim();
    if (!mongoose.Types.ObjectId.isValid(productId)) return res.status(400).json({ error: 'Neveljaven ID izdelka.' });
    const deleted = await Product.findByIdAndDelete(productId);
    if (!deleted) return res.status(404).json({ error: 'Izdelek ne obstaja.' });
    return res.json({ success: true });
  } catch (_err) {
    return res.status(500).json({ error: 'Napaka pri brisanju izdelka.' });
  }
});

router.post('/api/admin/upload-product-image', authMiddleware, adminOnly, async (req, res) => {
  try {
    const { productId, dataUrl, fileName } = req.body || {};
    if (!productId || !dataUrl) return res.status(400).json({ error: 'Manjkajo podatki.' });
    const match = String(dataUrl).match(/^data:image\/(png|jpeg|jpg|webp|gif);base64,(.+)$/);
    if (!match) return res.status(400).json({ error: 'Napacen format slike.' });
    const ext = match[1] === 'jpeg' ? 'jpg' : match[1];
    const buffer = Buffer.from(match[2], 'base64');
    if (buffer.length > 5 * 1024 * 1024) return res.status(400).json({ error: 'Slika je prevelika (max 5MB).' });
    const baseName = String(fileName || 'slika').replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9-_]/g, '-').slice(0, 40) || 'slika';
    const storedName = `${Date.now()}-${baseName}.${ext}`;
    const uploadDir = path.join(__dirname, '..', 'public', 'uploads');
    await fs.mkdir(uploadDir, { recursive: true });
    await fs.writeFile(path.join(uploadDir, storedName), buffer);
    const updated = await Product.findByIdAndUpdate(productId, { $set: { image: `uploads/${storedName}` } }, { new: true });
    if (!updated) return res.status(404).json({ error: 'Izdelek ne obstaja.' });
    return res.json({ success: true, product: updated });
  } catch (_err) {
    return res.status(500).json({ error: 'Napaka pri nalaganju slike.' });
  }
});

module.exports = router;
