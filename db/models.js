const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const MEN_SHOE_SIZES = ['40', '41', '42', '43', '44', '45', '46', '47', '48'];
const WOMEN_SHOE_SIZES = ['36', '37', '38', '39', '40', '41', '42'];
const ADMIN_EMAIL = 'domen.arnus@gmail.com';
const ADMIN_PASSWORD = 'domen123';
const ADMIN_USERNAME = 'admin';
const OLD_PRICE_VISIBLE_MS = 60 * 24 * 60 * 60 * 1000;

function buildDefaultSizeStock(sizes, gender = 'men') {
  const menTemplate = { '40': 5, '41': 5, '42': 3, '43': 4, '44': 4, '45': 3, '46': 2, '47': 1, '48': 0 };
  const womenTemplate = { '36': 4, '37': 5, '38': 5, '39': 4, '40': 2, '41': 2, '42': 0 };
  const template = gender === 'women' ? womenTemplate : menTemplate;
  const base = {};
  const cleanSizes = Array.isArray(sizes) ? sizes.map((s) => String(s).trim()).filter(Boolean) : [];
  for (const size of cleanSizes) {
    const v = Number(template[size]);
    base[size] = Number.isFinite(v) && v >= 0 ? v : 2;
  }
  return base;
}

function isLegacyFlatSizeStock(sizeStock, sizes) {
  const cleanSizes = Array.isArray(sizes) ? sizes.map((s) => String(s).trim()).filter(Boolean) : [];
  if (!cleanSizes.length || !sizeStock || typeof sizeStock !== 'object') return true;
  const values = cleanSizes.map((s) => Number(sizeStock[s] ?? 0));
  const unique = new Set(values);
  if (unique.size <= 1) return true;
  const has42 = Object.prototype.hasOwnProperty.call(sizeStock, '42') && Number(sizeStock['42']) === 2;
  const has48 = Object.prototype.hasOwnProperty.call(sizeStock, '48') && Number(sizeStock['48']) === 0;
  const mostlyFours = values.filter((v) => v === 4).length >= Math.max(1, cleanSizes.length - 3);
  return mostlyFours && (has42 || has48);
}

function normalizeSizeStock(sizeStock, sizes, fallbackStock = 20) {
  const cleanSizes = Array.isArray(sizes) ? sizes.map((s) => String(s).trim()).filter(Boolean) : [];
  const source = sizeStock && typeof sizeStock === 'object' ? sizeStock : {};
  const out = {};
  for (const size of cleanSizes) {
    const raw = Number(source[size]);
    out[size] = Number.isFinite(raw) && raw >= 0 ? Math.floor(raw) : 0;
  }
  const sum = Object.values(out).reduce((acc, val) => acc + Number(val || 0), 0);
  if (sum <= 0 && Number(fallbackStock) > 0 && cleanSizes.length) {
    const each = Math.floor(Number(fallbackStock) / cleanSizes.length);
    let rem = Math.floor(Number(fallbackStock) % cleanSizes.length);
    for (const size of cleanSizes) {
      out[size] = each + (rem > 0 ? 1 : 0);
      if (rem > 0) rem -= 1;
    }
  }
  return out;
}

function parseSizeStockInput(input) {
  if (!input) return null;
  if (typeof input === 'object' && !Array.isArray(input)) {
    const out = {};
    for (const [key, val] of Object.entries(input)) {
      const cleanKey = String(key || '').trim();
      if (!cleanKey) continue;
      const n = Number(val);
      out[cleanKey] = Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0;
    }
    return out;
  }
  const text = String(input || '').trim();
  if (!text) return null;
  const out = {};
  for (const part of text.split(',')) {
    const [k, v] = String(part || '').split(':');
    const key = String(k || '').trim();
    const n = Number(String(v || '').trim());
    if (!key || Number.isNaN(n) || n < 0) continue;
    out[key] = Math.floor(n);
  }
  return Object.keys(out).length ? out : null;
}

function toPlainSizeStock(mapLike) {
  if (!mapLike) return {};
  if (mapLike instanceof Map) return Object.fromEntries(mapLike.entries());
  if (typeof mapLike.toObject === 'function') return mapLike.toObject();
  if (typeof mapLike === 'object') return { ...mapLike };
  return {};
}

function normalizeSizeKey(size) {
  return String(size || '').trim().replace(',', '.');
}

function resolveSizeKeyInStock(sizeStockMap, requestedSize) {
  const mapObj = sizeStockMap && typeof sizeStockMap === 'object' ? sizeStockMap : {};
  const normalizedRequested = normalizeSizeKey(requestedSize);
  if (!normalizedRequested) return null;
  if (Object.prototype.hasOwnProperty.call(mapObj, normalizedRequested)) return normalizedRequested;
  for (const key of Object.keys(mapObj)) {
    if (normalizeSizeKey(key) === normalizedRequested) return key;
  }
  return null;
}

function buildOldPriceVisibleUntil(fromDate = new Date()) {
  const base = fromDate instanceof Date ? fromDate : new Date(fromDate);
  const time = base.getTime();
  return new Date((Number.isFinite(time) ? time : Date.now()) + OLD_PRICE_VISIBLE_MS);
}

// ===== MODELI =====

const User = mongoose.model('User', new mongoose.Schema({
  username: String,
  email: String,
  password: String,
  role: { type: String, enum: ['user', 'admin'], default: 'user' },
  avatar: { type: String, default: '' },
  phone: { type: String, default: '' },
  address: { type: String, default: '' },
  defaultShipping: { type: String, enum: ['posta', 'prednostna', 'osebno'], default: 'posta' },
  defaultPayment: { type: String, enum: ['povzetje', 'kartica', 'leanpay'], default: 'povzetje' },
  resetToken: { type: String, default: null },
  resetTokenExpires: { type: Date, default: null }
}));

const Message = mongoose.model('Message', new mongoose.Schema({
  username: String,
  message: String,
  timestamp: { type: Date, default: Date.now }
}));

const Product = mongoose.model('Product', new mongoose.Schema({
  name: { type: String, required: true },
  description: { type: String, default: '' },
  price: { type: Number, required: true, index: true },
  oldPrice: { type: Number, default: null },
  oldPriceVisibleUntil: { type: Date, default: null },
  image: { type: String, default: '' },
  badge: { type: String, default: '' },
  category: { type: String, default: 'Cevlji', index: true },
  subcategory: { type: String, default: 'Nike', index: true },
  sizes: { type: [String], default: [] },
  sizeStock: { type: Map, of: Number, default: {} },
  stock: { type: Number, default: 20 },
  soldCount: { type: Number, default: 0, index: true },
  discountUntil: { type: Date, default: null }
}, {
  timestamps: true,
  toJSON: { flattenMaps: true },
  toObject: { flattenMaps: true }
}));

const Wishlist = mongoose.model('Wishlist', new mongoose.Schema({
  userId: { type: String, required: true, index: true },
  productId: { type: String, required: true, index: true }
}, { timestamps: true }));

const AiChatLog = mongoose.model('AiChatLog', new mongoose.Schema({
  userId: { type: String, required: true, index: true },
  username: { type: String, default: '' },
  email: { type: String, default: '' },
  userMessage: { type: String, required: true },
  assistantMessage: { type: String, required: true },
  provider: { type: String, default: 'fallback' }
}, { timestamps: true }));

const FunnelEvent = mongoose.model('FunnelEvent', new mongoose.Schema({
  userId: { type: String, index: true, default: '' },
  username: { type: String, default: '' },
  stage: { type: String, required: true, index: true },
  page: { type: String, default: '' },
  meta: { type: Object, default: {} }
}, { timestamps: true }));

const Coupon = mongoose.model('Coupon', new mongoose.Schema({
  code: { type: String, required: true, unique: true, uppercase: true, trim: true },
  discount: { type: Number, required: true, min: 1, max: 100 },
  maxUses: { type: Number, default: 0 },
  usedCount: { type: Number, default: 0 },
  active: { type: Boolean, default: true },
  expiresAt: { type: Date, default: null }
}, { timestamps: true }));

const Order = mongoose.model('Order', new mongoose.Schema({
  userId: { type: String, required: true },
  kupec: {
    ime: String, priimek: String, ulica: String, posta: String,
    kraj: String, email: String, telefon: String, dostava: String, placilo: String
  },
  izdelki: [Object],
  itemsTotal: { type: Number, default: 0 },
  discountAmount: { type: Number, default: 0 },
  couponCode: { type: String, default: '' },
  couponDiscount: { type: Number, default: 0 },
  finalTotal: { type: Number, default: 0 },
  status: { type: String, enum: ['Oddano', 'Potrjeno', 'Poslano', 'Dostavljeno'], default: 'Oddano' },
  datum: { type: Date, default: Date.now }
}));

const Rating = mongoose.model('Rating', new mongoose.Schema({
  productId: { type: String, index: true, default: '' },
  stars: Number,
  comment: String,
  userId: { type: String, default: '' },
  username: { type: String, default: 'Gost' },
  email: { type: String, default: '' },
  date: { type: Date, default: Date.now }
}));

const CartItemSchema = new mongoose.Schema({
  productId: { type: String, required: true },
  ime: { type: String, default: '' },
  cena: { type: Number, default: 0 },
  oldCena: { type: Number, default: 0 },
  hasDiscount: { type: Boolean, default: false },
  image: { type: String, default: '' },
  size: { type: String, default: '' },
  kolicina: { type: Number, default: 1, min: 1 }
}, { _id: false });

const Cart = mongoose.model('Cart', new mongoose.Schema({
  userId: { type: String, required: true, unique: true, index: true },
  items: { type: [CartItemSchema], default: [] }
}, { timestamps: true }));

// ===== SEED DATA =====

const DEFAULT_PRODUCTS = [
  { name: 'Nike Dunk Low', description: 'Moski cevlji.', price: 119.99, oldPrice: null, oldPriceVisibleUntil: null, image: 'photos/1.png', badge: 'Novo', category: 'Cevlji', subcategory: 'Nike', sizes: [...MEN_SHOE_SIZES], sizeStock: buildDefaultSizeStock(MEN_SHOE_SIZES, 'men'), stock: 32, soldCount: 52, discountUntil: null },
  { name: 'Nike Dunk Low Zenski', description: 'Zenski cevlji.', price: 99.99, oldPrice: 129.99, oldPriceVisibleUntil: buildOldPriceVisibleUntil(), image: 'photos/6.png', badge: 'Znizano', category: 'Cevlji', subcategory: 'Nike', sizes: [...WOMEN_SHOE_SIZES], sizeStock: buildDefaultSizeStock(WOMEN_SHOE_SIZES, 'women'), stock: 28, soldCount: 71, discountUntil: new Date(Date.now() + 1000 * 60 * 60 * 24 * 7) },
  { name: 'Nike Dunk Low', description: 'Moski cevlji.', price: 103.99, oldPrice: 119.99, oldPriceVisibleUntil: buildOldPriceVisibleUntil(), image: 'photos/5.png', badge: 'Znizano', category: 'Cevlji', subcategory: 'Nike', sizes: [...MEN_SHOE_SIZES], sizeStock: buildDefaultSizeStock(MEN_SHOE_SIZES, 'men'), stock: 20, soldCount: 39, discountUntil: new Date(Date.now() + 1000 * 60 * 60 * 24 * 5) },
  { name: 'Nike Dunk Low Retro', description: 'Moski cevlji.', price: 199.99, oldPrice: 229.99, oldPriceVisibleUntil: buildOldPriceVisibleUntil(), image: 'photos/4.png', badge: 'Znizano', category: 'Cevlji', subcategory: 'Nike', sizes: [...MEN_SHOE_SIZES], sizeStock: buildDefaultSizeStock(MEN_SHOE_SIZES, 'men'), stock: 14, soldCount: 25, discountUntil: new Date(Date.now() + 1000 * 60 * 60 * 24 * 3) },
  { name: 'Nike Dunk Low', description: 'Moski cevlji.', price: 119.99, oldPrice: null, oldPriceVisibleUntil: null, image: 'photos/3.png', badge: '', category: 'Cevlji', subcategory: 'Nike', sizes: [...MEN_SHOE_SIZES], sizeStock: buildDefaultSizeStock(MEN_SHOE_SIZES, 'men'), stock: 19, soldCount: 18, discountUntil: null },
  { name: 'Nike Dunk Low', description: 'Zenski cevlji.', price: 129.99, oldPrice: null, oldPriceVisibleUntil: null, image: 'photos/2.png', badge: '', category: 'Cevlji', subcategory: 'Nike', sizes: [...WOMEN_SHOE_SIZES], sizeStock: buildDefaultSizeStock(WOMEN_SHOE_SIZES, 'women'), stock: 26, soldCount: 34, discountUntil: null },
  { name: 'Nike Dunk Low', description: 'Moski cevlji.', price: 119.99, oldPrice: null, oldPriceVisibleUntil: null, image: 'photos/1.png', badge: '', category: 'Cevlji', subcategory: 'Nike', sizes: [...MEN_SHOE_SIZES], sizeStock: buildDefaultSizeStock(MEN_SHOE_SIZES, 'men'), stock: 24, soldCount: 29, discountUntil: null },
  { name: 'Nike Dunk Low', description: 'Zenski cevlji.', price: 129.99, oldPrice: null, oldPriceVisibleUntil: null, image: 'photos/4.png', badge: '', category: 'Cevlji', subcategory: 'Nike', sizes: [...WOMEN_SHOE_SIZES], sizeStock: buildDefaultSizeStock(WOMEN_SHOE_SIZES, 'women'), stock: 16, soldCount: 21, discountUntil: null }
];

// ===== UTILITY FUNCTIONS =====

// clearExpiredOldPrices teče po timerju — NE ob vsaki API zahtevi.
let _clearExpiredRunning = false;
async function clearExpiredOldPrices() {
  if (_clearExpiredRunning) return;
  _clearExpiredRunning = true;
  try {
    await Product.updateMany(
      { oldPrice: { $gt: 0 }, oldPriceVisibleUntil: { $ne: null, $lte: new Date() } },
      { $set: { oldPrice: null, oldPriceVisibleUntil: null, discountUntil: null } }
    );
  } finally {
    _clearExpiredRunning = false;
  }
}

// Zaženi timer: vsake 10 minut preveri potekle popuste.
function startExpiredPriceTimer() {
  clearExpiredOldPrices().catch(() => {});
  setInterval(() => clearExpiredOldPrices().catch(() => {}), 10 * 60 * 1000);
}

// buildSoldTodayMap cache — TTL 60 sekund.
let _soldTodayCache = null;
let _soldTodayCacheAt = 0;
const SOLD_TODAY_TTL = 60 * 1000;

async function buildSoldTodayMap(productIds = []) {
  const uniqueIds = [...new Set((Array.isArray(productIds) ? productIds : []).map((id) => String(id || '').trim()).filter(Boolean))];
  if (!uniqueIds.length) return new Map();

  const now = Date.now();
  if (_soldTodayCache && now - _soldTodayCacheAt < SOLD_TODAY_TTL) {
    const out = new Map();
    uniqueIds.forEach((id) => { if (_soldTodayCache.has(id)) out.set(id, _soldTodayCache.get(id)); });
    return out;
  }

  const dayStart = new Date();
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(dayStart);
  dayEnd.setDate(dayEnd.getDate() + 1);
  const orders = await Order.find({ datum: { $gte: dayStart, $lt: dayEnd } }).select('izdelki').lean();

  const full = new Map();
  for (const order of (orders || [])) {
    for (const item of (Array.isArray(order?.izdelki) ? order.izdelki : [])) {
      const pid = String(item?.productId || '').trim();
      if (!pid) continue;
      full.set(pid, (full.get(pid) || 0) + Math.max(1, Math.floor(Number(item?.kolicina || 1))));
    }
  }
  _soldTodayCache = full;
  _soldTodayCacheAt = now;

  const out = new Map();
  uniqueIds.forEach((id) => { if (full.has(id)) out.set(id, full.get(id)); });
  return out;
}

function invalidateSoldTodayCache() {
  _soldTodayCache = null;
}

// ===== SEED FUNCTIONS =====

async function ensureAdminUser() {
  const hashedPassword = await bcrypt.hash(ADMIN_PASSWORD, 10);
  await User.findOneAndUpdate(
    { email: ADMIN_EMAIL },
    { username: ADMIN_USERNAME, email: ADMIN_EMAIL, password: hashedPassword, role: 'admin' },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
}

async function ensureDefaultProducts() {
  for (const item of DEFAULT_PRODUCTS) {
    await Product.updateOne({ name: item.name, image: item.image }, { $setOnInsert: item }, { upsert: true });
  }
}

async function ensureProductMetadata() {
  await Product.updateMany({ category: { $exists: false } }, { $set: { category: 'Cevlji' } });
  await Product.updateMany({ subcategory: { $exists: false } }, { $set: { subcategory: 'Nike' } });
  await Product.updateMany({ stock: { $exists: false } }, { $set: { stock: 20 } });
  await Product.updateMany({ soldCount: { $exists: false } }, { $set: { soldCount: 0 } });
  await Product.updateMany({ discountUntil: { $exists: false } }, { $set: { discountUntil: null } });
  await Product.updateMany(
    { oldPriceVisibleUntil: { $exists: false } },
    [{ $set: { oldPriceVisibleUntil: { $cond: [{ $gt: [{ $ifNull: ['$oldPrice', 0] }, 0] }, buildOldPriceVisibleUntil(), null] } } }]
  );

  const productsWithoutSizes = await Product.find({ category: 'Cevlji', $or: [{ sizes: { $exists: false } }, { sizes: { $size: 0 } }] }).select('_id name description');
  for (const p of productsWithoutSizes) {
    const hay = `${p.name || ''} ${p.description || ''}`.toLowerCase();
    await Product.updateOne({ _id: p._id }, { $set: { sizes: hay.includes('zensk') ? [...WOMEN_SHOE_SIZES] : [...MEN_SHOE_SIZES] } });
  }

  const allProducts = await Product.find().select('_id name description sizes sizeStock stock soldCount');
  for (const product of allProducts) {
    const rawSizes = Array.isArray(product.sizes) ? product.sizes.map((s) => String(s).trim()).filter(Boolean) : [];
    const hay = `${product.name || ''} ${product.description || ''}`.toLowerCase();
    const isWomen = hay.includes('zensk');
    const cleanSizes = rawSizes.filter((s) => !String(s).includes('.5') && !String(s).includes(',5'));
    const sizes = cleanSizes.length ? cleanSizes : (isWomen ? [...WOMEN_SHOE_SIZES] : [...MEN_SHOE_SIZES]);
    const currentSizeStock = toPlainSizeStock(product.sizeStock);
    const cleanedCurrentSizeStock = Object.fromEntries(
      Object.entries(currentSizeStock).filter(([key]) => {
        const k = String(key || '').trim();
        return k && !k.includes('.5') && !k.includes(',5');
      })
    );
    const hasAnySizeStock = Object.keys(cleanedCurrentSizeStock).length > 0;
    const normalized = hasAnySizeStock
      ? normalizeSizeStock(cleanedCurrentSizeStock, sizes, Number(product.stock || 0))
      : buildDefaultSizeStock(sizes, isWomen ? 'women' : 'men');
    const shouldRebuild = isLegacyFlatSizeStock(normalized, sizes);
    const finalMap = shouldRebuild ? buildDefaultSizeStock(sizes, isWomen ? 'women' : 'men') : normalized;
    const boostedMap = {};
    const minimumPerSize = 6;
    for (const size of sizes) {
      const amount = Number.isFinite(Number(finalMap[size] || 0)) ? Math.max(0, Math.floor(Number(finalMap[size] || 0))) : 0;
      const sizeNumber = Number.parseFloat(String(size));
      const isLargeSize = isWomen ? Number.isFinite(sizeNumber) && sizeNumber >= 41 : Number.isFinite(sizeNumber) && sizeNumber >= 46;
      boostedMap[size] = Math.min(isLargeSize ? 4 : Infinity, Math.max(isLargeSize ? 3 : minimumPerSize, amount));
    }
    const soldCount = Math.max(0, Math.floor(Number(product.soldCount || 0)));
    if (soldCount >= 60) {
      const hotSizes = isWomen ? ['38', '39', '40'] : ['42', '43', '44'];
      hotSizes.forEach((s, index) => {
        if (!Object.prototype.hasOwnProperty.call(boostedMap, s)) return;
        const cap = index === 0 && soldCount >= 80 ? 1 : 2;
        boostedMap[s] = Math.max(1, Math.min(Number(boostedMap[s] || 0), cap));
      });
    }
    const total = Object.values(boostedMap).reduce((acc, val) => acc + Number(val || 0), 0);
    await Product.updateOne({ _id: product._id }, { $set: { sizes, sizeStock: boostedMap, stock: total } });
  }

  await Product.updateMany({ category: { $ne: 'Cevlji' } }, { $set: { category: 'Cevlji' } });
  await clearExpiredOldPrices();

  const legacyValues = ['Superge', 'Kratke majice', 'Kratke hlace', 'Dolge hlace', 'Pulovri', ''];
  const needsBrand = await Product.find({ $or: [{ subcategory: { $in: legacyValues } }, { subcategory: { $exists: false } }] }).select('_id name description subcategory');
  for (const item of needsBrand) {
    const hay = `${item.name || ''} ${item.description || ''}`.toLowerCase();
    let brand = 'Nike';
    if (hay.includes('adidas')) brand = 'Adidas';
    else if (hay.includes('jordan')) brand = 'Jordan';
    else if (hay.includes('asics')) brand = 'Asics';
    await Product.updateOne({ _id: item._id }, { $set: { subcategory: brand } });
  }
}

Order.updateMany({ discountPercent: { $exists: true } }, { $unset: { discountPercent: '' } }).catch(() => {});

module.exports = {
  User, Message, Product, Wishlist, AiChatLog, FunnelEvent, Coupon, Order, Rating, Cart,
  MEN_SHOE_SIZES, WOMEN_SHOE_SIZES, ADMIN_EMAIL, ADMIN_PASSWORD, ADMIN_USERNAME,
  buildDefaultSizeStock, normalizeSizeStock, parseSizeStockInput, toPlainSizeStock,
  normalizeSizeKey, resolveSizeKeyInStock, buildOldPriceVisibleUntil,
  clearExpiredOldPrices, buildSoldTodayMap, invalidateSoldTodayCache, startExpiredPriceTimer,
  ensureAdminUser, ensureDefaultProducts, ensureProductMetadata
};
