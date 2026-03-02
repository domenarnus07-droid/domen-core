const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const path = require('path');
const fs = require('fs/promises');
const crypto = require('crypto');
const http = require('http');
const { Server } = require('socket.io');
const setupAdmin = require('./admin');

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const publicDir = path.join(__dirname, 'public');
const ADMIN_EMAIL = 'domen.arnus@gmail.com';
const ADMIN_PASSWORD = 'domen123';
const ADMIN_USERNAME = 'admin';
const MEN_SHOE_SIZES = ['40', '40.5', '41', '41.5', '42', '42.5', '43', '43.5', '44', '44.5', '45', '45.5', '46', '46.5', '47', '47.5', '48'];
const WOMEN_SHOE_SIZES = ['36', '36.5', '37', '37.5', '38', '38.5', '39', '39.5', '40', '40.5', '41', '41.5', '42'];
// Funkcija buildDefaultSizeStock skrbi za pomemben del logike aplikacije.
function buildDefaultSizeStock(sizes, gender = 'men') {
  const menTemplate = {
    '40': 5, '40.5': 4, '41': 5, '41.5': 4, '42': 2, '42.5': 3,
    '43': 4, '43.5': 3, '44': 4, '44.5': 3, '45': 3, '45.5': 2,
    '46': 2, '46.5': 2, '47': 1, '47.5': 1, '48': 0
  };
  const womenTemplate = {
    '36': 4, '36.5': 4, '37': 5, '37.5': 5, '38': 5, '38.5': 4,
    '39': 4, '39.5': 3, '40': 2, '40.5': 2, '41': 2, '41.5': 1, '42': 0
  };
  const template = gender === 'women' ? womenTemplate : menTemplate;
  const base = {};
  const cleanSizes = Array.isArray(sizes) ? sizes.map((s) => String(s).trim()).filter(Boolean) : [];
  for (const size of cleanSizes) {
    const v = Number(template[size]);
    base[size] = Number.isFinite(v) && v >= 0 ? v : 2;
  }
  return base;
}
// Funkcija isLegacyFlatSizeStock skrbi za pomemben del logike aplikacije.
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
// Funkcija normalizeSizeStock skrbi za pomemben del logike aplikacije.
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
// Funkcija parseSizeStockInput skrbi za pomemben del logike aplikacije.
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
// Funkcija toPlainSizeStock skrbi za pomemben del logike aplikacije.
function toPlainSizeStock(mapLike) {
  if (!mapLike) return {};
  if (mapLike instanceof Map) return Object.fromEntries(mapLike.entries());
  if (typeof mapLike.toObject === 'function') return mapLike.toObject();
  if (typeof mapLike === 'object') return { ...mapLike };
  return {};
}
const DEFAULT_PRODUCTS = [
  { name: 'Nike Dunk Low', description: 'Moski cevlji.', price: 119.99, oldPrice: null, image: 'photos/dunks.png', badge: 'Novo', category: 'Cevlji', subcategory: 'Nike', sizes: [...MEN_SHOE_SIZES], sizeStock: buildDefaultSizeStock(MEN_SHOE_SIZES, 'men'), stock: 32, soldCount: 52, discountUntil: null },
  { name: 'Nike Dunk Low Zenski', description: 'Zenski cevlji.', price: 99.99, oldPrice: 129.99, image: 'photos/6.png', badge: 'Znizano', category: 'Cevlji', subcategory: 'Nike', sizes: [...WOMEN_SHOE_SIZES], sizeStock: buildDefaultSizeStock(WOMEN_SHOE_SIZES, 'women'), stock: 28, soldCount: 71, discountUntil: new Date(Date.now() + 1000 * 60 * 60 * 24 * 7) },
  { name: 'Nike Dunk Low', description: 'Moski cevlji.', price: 103.99, oldPrice: 119.99, image: 'photos/5.png', badge: 'Znizano', category: 'Cevlji', subcategory: 'Nike', sizes: [...MEN_SHOE_SIZES], sizeStock: buildDefaultSizeStock(MEN_SHOE_SIZES, 'men'), stock: 20, soldCount: 39, discountUntil: new Date(Date.now() + 1000 * 60 * 60 * 24 * 5) },
  { name: 'Nike Dunk Low Retro', description: 'Moski cevlji.', price: 199.99, oldPrice: 229.99, image: 'photos/4.png', badge: 'Znizano', category: 'Cevlji', subcategory: 'Nike', sizes: [...MEN_SHOE_SIZES], sizeStock: buildDefaultSizeStock(MEN_SHOE_SIZES, 'men'), stock: 14, soldCount: 25, discountUntil: new Date(Date.now() + 1000 * 60 * 60 * 24 * 3) },
  { name: 'Nike Dunk Low', description: 'Moski cevlji.', price: 119.99, oldPrice: null, image: 'photos/3.png', badge: '', category: 'Cevlji', subcategory: 'Nike', sizes: [...MEN_SHOE_SIZES], sizeStock: buildDefaultSizeStock(MEN_SHOE_SIZES, 'men'), stock: 19, soldCount: 18, discountUntil: null },
  { name: 'Nike Dunk Low', description: 'Zenski cevlji.', price: 129.99, oldPrice: null, image: 'photos/2.png', badge: '', category: 'Cevlji', subcategory: 'Nike', sizes: [...WOMEN_SHOE_SIZES], sizeStock: buildDefaultSizeStock(WOMEN_SHOE_SIZES, 'women'), stock: 26, soldCount: 34, discountUntil: null },
  { name: 'Nike Dunk Low', description: 'Moski cevlji.', price: 119.99, oldPrice: null, image: 'photos/1.png', badge: '', category: 'Cevlji', subcategory: 'Nike', sizes: [...MEN_SHOE_SIZES], sizeStock: buildDefaultSizeStock(MEN_SHOE_SIZES, 'men'), stock: 24, soldCount: 29, discountUntil: null },
  { name: 'Nike Dunk Low', description: 'Zenski cevlji.', price: 129.99, oldPrice: null, image: 'photos/4.png', badge: '', category: 'Cevlji', subcategory: 'Nike', sizes: [...WOMEN_SHOE_SIZES], sizeStock: buildDefaultSizeStock(WOMEN_SHOE_SIZES, 'women'), stock: 16, soldCount: 21, discountUntil: null }
];
// âś… MongoDB povezava (Atlas URL)
mongoose.connect('mongodb+srv://domenarnus07:Domen12730@cluster0.do2brlj.mongodb.net/myapp?retryWrites=true&w=majority&appName=Cluster0')
  .then(async () => {
    await ensureAdminUser();
    await ensureDefaultProducts();
    await ensureProductMetadata();
  })
  .catch(() => {});
//model za uporabnike
const User = mongoose.model('User', new mongoose.Schema({
  username: String,
  email: String,
  password: String,
  role: { type: String, enum: ['user', 'admin'], default: 'user' },
  avatar: { type: String, default: '' },
  resetToken: { type: String, default: null },
  resetTokenExpires: { type: Date, default: null }
}));

//model za sporoÄŤila v klepetu
const Message = mongoose.model('Message', new mongoose.Schema({
  username: String,
  message: String,
  timestamp: { type: Date, default: Date.now }
}));

const Product = mongoose.model('Product', new mongoose.Schema({
  name: { type: String, required: true },
  description: { type: String, default: '' },
  price: { type: Number, required: true },
  oldPrice: { type: Number, default: null },
  image: { type: String, default: '' },
  badge: { type: String, default: '' },
  category: { type: String, default: 'Cevlji' },
  subcategory: { type: String, default: 'Nike' },
  sizes: { type: [String], default: [] },
  sizeStock: { type: Map, of: Number, default: {} },
  stock: { type: Number, default: 20 },
  soldCount: { type: Number, default: 0 },
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

// Splošni middleware
app.use(express.urlencoded({ extended: true }));
app.use(express.json({ limit: '8mb' }));
app.use(express.static(publicDir, { index: false }));
const sessionMiddleware = session({
  secret: 'skrivnost',
  resave: false,
  saveUninitialized: false
});
app.use(sessionMiddleware);

// Middleware za zaščito strani
// Funkcija authMiddleware skrbi za pomemben del logike aplikacije.
function authMiddleware(req, res, next) {
  if (req.session.user) {
    next();
  } else {
    if (req.path.startsWith('/api/')) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    res.redirect('/prijava.html');
  }
}

// Funkcija adminOnly skrbi za pomemben del logike aplikacije.
function adminOnly(req, res, next) {
  if (req.session.user?.role === 'admin') {
    return next();
  }
  return res.status(403).json({ error: 'Admin only' });
}

async function resolveSessionUserId(sessionUser) {
  if (sessionUser?.id) return sessionUser.id;
  if (!sessionUser) return null;
  const user = await User.findOne({
    $or: [{ email: sessionUser.email || '' }, { username: sessionUser.username || '' }]
  });
  return user ? String(user._id) : null;
}

async function ensureAdminUser() {
  const hashedPassword = await bcrypt.hash(ADMIN_PASSWORD, 10);
  await User.findOneAndUpdate(
    { email: ADMIN_EMAIL },
    {
      username: ADMIN_USERNAME,
      email: ADMIN_EMAIL,
      password: hashedPassword,
      role: 'admin'
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
}

async function ensureDefaultProducts() {
  let inserted = 0;
  for (const item of DEFAULT_PRODUCTS) {
    const result = await Product.updateOne(
      { name: item.name, image: item.image },
      { $setOnInsert: item },
      { upsert: true }
    );
    if (result.upsertedCount > 0) inserted += 1;
  }
}

async function ensureProductMetadata() {
  await Product.updateMany(
    { category: { $exists: false } },
    { $set: { category: 'Cevlji' } }
  );
  await Product.updateMany(
    { subcategory: { $exists: false } },
    { $set: { subcategory: 'Nike' } }
  );
  await Product.updateMany(
    { stock: { $exists: false } },
    { $set: { stock: 20 } }
  );
  await Product.updateMany(
    { soldCount: { $exists: false } },
    { $set: { soldCount: 0 } }
  );
  await Product.updateMany(
    { discountUntil: { $exists: false } },
    { $set: { discountUntil: null } }
  );
  const productsWithoutSizes = await Product.find({
    category: 'Cevlji',
    $or: [{ sizes: { $exists: false } }, { sizes: { $size: 0 } }]
  }).select('_id name description');
  for (const p of productsWithoutSizes) {
    const hay = `${p.name || ''} ${p.description || ''}`.toLowerCase();
    const isWomen = hay.includes('zensk');
    await Product.updateOne(
      { _id: p._id },
      { $set: { sizes: isWomen ? [...WOMEN_SHOE_SIZES] : [...MEN_SHOE_SIZES] } }
    );
  }
  const allProducts = await Product.find().select('_id name description sizes sizeStock stock');
  for (const product of allProducts) {
    const sizes = Array.isArray(product.sizes) ? product.sizes.map((s) => String(s).trim()).filter(Boolean) : [];
    const hay = `${product.name || ''} ${product.description || ''}`.toLowerCase();
    const isWomen = hay.includes('zensk');
    const currentSizeStock = toPlainSizeStock(product.sizeStock);
    const hasAnySizeStock = Object.keys(currentSizeStock).length > 0;
    const normalized = hasAnySizeStock
      ? normalizeSizeStock(currentSizeStock, sizes, Number(product.stock || 0))
      : buildDefaultSizeStock(sizes, isWomen ? 'women' : 'men');
    const shouldRebuild = isLegacyFlatSizeStock(normalized, sizes);
    const finalMap = shouldRebuild
      ? buildDefaultSizeStock(sizes, isWomen ? 'women' : 'men')
      : normalized;
    const total = Object.values(finalMap).reduce((acc, val) => acc + Number(val || 0), 0);
    await Product.updateOne(
      { _id: product._id },
      { $set: { sizeStock: finalMap, stock: total } }
    );
  }
  await Product.updateMany(
    { category: { $ne: 'Cevlji' } },
    { $set: { category: 'Cevlji' } }
  );

  // Normalize old subcategory values to brand values used in filters.
  const legacyValues = ['Superge', 'Kratke majice', 'Kratke hlace', 'Dolge hlace', 'Pulovri', ''];
  const needsBrand = await Product.find({
    $or: [
      { subcategory: { $in: legacyValues } },
      { subcategory: { $exists: false } }
    ]
  }).select('_id name description subcategory');

  for (const item of needsBrand) {
    const hay = `${item.name || ''} ${item.description || ''}`.toLowerCase();
    let brand = 'Nike';
    if (hay.includes('adidas')) brand = 'Adidas';
    else if (hay.includes('jordan')) brand = 'Jordan';
    else if (hay.includes('asics')) brand = 'Asics';

    await Product.updateOne({ _id: item._id }, { $set: { subcategory: brand } });
  }
}

// Registracija
app.post('/register', async (req, res) => {
  const username = String(req.body?.username || '').trim();
  const email = String(req.body?.email || '').trim().toLowerCase();
  const password = String(req.body?.password || '');
  const usernamePattern = /^[a-zA-Z0-9_]{3,24}$/;
  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  const strongPasswordPattern = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z\d]).{8,}$/;

  if (!username || !email || !password) {
    return res.status(400).send('Vsa polja morajo biti izpolnjena.');
  }
  if (!usernamePattern.test(username)) {
    return res.status(400).send('Uporabnisko ime naj ima 3-24 znakov (crke, stevilke, _).');
  }
  if (!emailPattern.test(email)) {
    return res.status(400).send('Vnesi veljaven email naslov.');
  }
  if (!strongPasswordPattern.test(password)) {
    return res.status(400).send('Geslo mora imeti vsaj 8 znakov ter veliko, malo crko, stevilko in poseben znak.');
  }

  if (email === ADMIN_EMAIL) {
    return res.status(400).send('Ta e-posta ni dovoljena za registracijo.');
  }

  const safeUsername = username.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const safeEmail = email.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const existingUsername = await User.findOne({ username: new RegExp(`^${safeUsername}$`, 'i') });
  if (existingUsername) {
    return res.status(400).send('Uporabnisko ime ze obstaja.');
  }

  const existingEmail = await User.findOne({ email: new RegExp(`^${safeEmail}$`, 'i') });
  if (existingEmail) {
    return res.status(400).send('E-posta je ze registrirana.');
  }

  const hashedPassword = await bcrypt.hash(password, 10);
  const newUser = new User({ username, email, password: hashedPassword, role: 'user' });
  await newUser.save();

  res.status(200).send('Registracija uspesna');
});
// Prijava
app.post('/login', async (req, res) => {
  const { username, password } = req.body;
  const identifier = (username || '').trim();

  const user = await User.findOne({
    $or: [{ username: identifier }, { email: identifier }]
  });
  if (!user) {
    return res.status(400).send('Uporabnik ne obstaja');
  }

  const isMatch = await bcrypt.compare(password, user.password);
  if (!isMatch) {
    return res.status(400).send('Napačno geslo.');
  }

  const role = user.role || (user.email === ADMIN_EMAIL ? 'admin' : 'user');
  req.session.user = {
    id: String(user._id),
    username: user.username,
    email: user.email,
    role
  };

  res.status(200).send('Prijava uspešna');
});


// Odjava
app.get('/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/prijava.html');
  });
});

// Vrni trenutno prijavljenega uporabnika
app.get('/api/user', (req, res) => {
  if (!req.session.user) {
    return res.json({ user: null });
  }
  User.findById(req.session.user.id)
    .then((user) => {
      if (!user) return res.json({ user: null });
      return res.json({
        user: {
          id: String(user._id),
          username: user.username,
          email: user.email,
          role: user.role,
          avatar: user.avatar || ''
        }
      });
    })
    .catch(() => res.json({ user: req.session.user || null }));
});

app.get('/api/products', async (req, res) => {
  const { category, subcategory, sort } = req.query;
  const filter = {};
  const safeCategory = String(category || '').trim();
  const safeSubcategory = String(subcategory || '').trim();
  if (safeCategory) {
    const escapedCategory = safeCategory.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    filter.category = new RegExp(`^${escapedCategory}$`, 'i');
  }
  if (safeSubcategory) {
    const escapedSubcategory = safeSubcategory.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    filter.subcategory = new RegExp(`^${escapedSubcategory}$`, 'i');
  }

  let sortBy = { createdAt: -1 };
  if (sort === 'price_asc') sortBy = { price: 1 };
  if (sort === 'price_desc') sortBy = { price: -1 };
  if (sort === 'newest') sortBy = { createdAt: -1 };
  if (sort === 'bestseller') sortBy = { soldCount: -1, createdAt: -1 };

  const products = await Product.find(filter).sort(sortBy);
  res.json(products);
});

app.get('/api/products/best-sellers', async (req, res) => {
  const limit = Math.max(1, Math.min(12, Number(req.query.limit) || 4));
  const products = await Product.find()
    .sort({ soldCount: -1, createdAt: -1 })
    .limit(limit);
  const enriched = products.map((product) => {
    const plain = typeof product.toObject === 'function' ? product.toObject() : product;
    const sizeStockMap = toPlainSizeStock(plain.sizeStock);
    const stockFromSizes = Object.values(sizeStockMap).reduce((acc, val) => acc + Number(val || 0), 0);
    const effectiveStock = stockFromSizes > 0 ? stockFromSizes : Math.max(0, Math.floor(Number(plain.stock || 0)));
    return {
      ...plain,
      effectiveStock,
      lowStock: effectiveStock > 0 && effectiveStock <= 4
    };
  });
  res.json(enriched);
});

app.get('/api/products/:id', async (req, res) => {
  const productId = String(req.params.id || '').trim();
  if (!mongoose.Types.ObjectId.isValid(productId)) {
    return res.status(400).json({ error: 'Neveljaven ID izdelka.' });
  }
  const product = await Product.findById(productId);
  if (!product) {
    return res.status(404).json({ error: 'Izdelek ne obstaja.' });
  }
  return res.json(product);
});

app.get('/api/wishlist', authMiddleware, async (req, res) => {
  const userId = await resolveSessionUserId(req.session.user);
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  const docs = await Wishlist.find({ userId });
  res.json(docs.map((d) => d.productId));
});

app.post('/api/wishlist/toggle', authMiddleware, async (req, res) => {
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
});

app.get('/admin/upload', authMiddleware, adminOnly, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin-upload.html'));
});

app.get('/api/admin/products', authMiddleware, adminOnly, async (_req, res) => {
  const products = await Product.find().sort({ createdAt: -1 });
  res.json(products);
});

app.get('/api/admin/users', authMiddleware, adminOnly, async (_req, res) => {
  try {
    const users = await User.find()
      .select('username email role avatar password')
      .sort({ username: 1, email: 1 })
      .lean();

    return res.json(users.map((u) => ({
      ...u,
      // Zaradi varnosti ne izpisujemo cistega gesla.
      passwordPlain: null,
      passwordMasked: u.password ? '********' : '',
      hasPassword: Boolean(u.password)
    })));
  } catch (_err) {
    return res.status(500).json({ error: 'Napaka pri nalaganju uporabnikov.' });
  }
});

app.delete('/api/admin/users/:id', authMiddleware, adminOnly, async (req, res) => {
  try {
    const userId = String(req.params.id || '').trim();
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ error: 'Neveljaven ID uporabnika.' });
    }
    if (String(req.session.user?.id || '') === userId) {
      return res.status(400).json({ error: 'Trenutno prijavljenega admina ni mogoče izbrisati.' });
    }

    const targetUser = await User.findById(userId).select('role').lean();
    if (!targetUser) {
      return res.status(404).json({ error: 'Uporabnik ne obstaja.' });
    }
    if (String(targetUser.role || '') === 'admin') {
      return res.status(400).json({ error: 'Admin uporabnika ni mogoče izbrisati.' });
    }

    await User.deleteOne({ _id: userId });
    await Wishlist.deleteMany({ userId: String(userId) });
    return res.json({ success: true });
  } catch (_err) {
    return res.status(500).json({ error: 'Napaka pri brisanju uporabnika.' });
  }
});

app.post('/api/admin/products', authMiddleware, adminOnly, async (req, res) => {
  try {
    const {
      name,
      description,
      price,
      oldPrice,
      image,
      badge,
      category,
      subcategory,
      sizes,
      sizeStock,
      stock,
      soldCount,
      discountUntil
    } = req.body || {};

    const cleanName = String(name || '').trim();
    const cleanPrice = Number(price);
    if (!cleanName || Number.isNaN(cleanPrice) || cleanPrice <= 0) {
      return res.status(400).json({ error: 'Name in price sta obvezna.' });
    }

    const parsedOldPrice = oldPrice === '' || oldPrice === null || oldPrice === undefined
      ? null
      : Number(oldPrice);
    const validOldPrice = Number.isFinite(parsedOldPrice) && parsedOldPrice > 0 ? parsedOldPrice : null;
    let normalizedPrice = cleanPrice;
    let normalizedOldPrice = validOldPrice;
    if (Number.isFinite(validOldPrice)) {
      if (validOldPrice > cleanPrice) {
        normalizedPrice = cleanPrice;
        normalizedOldPrice = validOldPrice;
      } else if (validOldPrice < cleanPrice) {
        // Če admin vnese zamenjani vrednosti, ju normaliziramo na akcijsko + redno ceno.
        normalizedPrice = validOldPrice;
        normalizedOldPrice = cleanPrice;
      } else {
        normalizedOldPrice = null;
      }
    }

    const cleanSizes = Array.isArray(sizes)
      ? sizes.map((s) => String(s).trim()).filter(Boolean)
      : String(sizes || '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);

    const cleanCategory = 'Cevlji';
    const hay = `${cleanName} ${String(description || '')}`.toLowerCase();
    const isWomen = hay.includes('zensk');
    const autoSizes = cleanCategory === 'Cevlji'
      ? (isWomen ? [...WOMEN_SHOE_SIZES] : [...MEN_SHOE_SIZES])
      : ['S', 'M', 'L', 'XL'];
    const finalSizes = cleanSizes.length ? cleanSizes : autoSizes;
    const parsedSizeStock = parseSizeStockInput(sizeStock);
    const normalizedSizeStock = normalizeSizeStock(parsedSizeStock || {}, finalSizes, Number(stock) > 0 ? Number(stock) : 20);
    const totalStock = Object.values(normalizedSizeStock).reduce((acc, val) => acc + Number(val || 0), 0);

    const created = await Product.create({
      name: cleanName,
      description: String(description || '').trim(),
      price: normalizedPrice,
      oldPrice: normalizedOldPrice,
      image: String(image || '').trim(),
      badge: String(badge || '').trim(),
      category: cleanCategory,
      subcategory: String(subcategory || 'Nike').trim() || 'Nike',
      sizes: finalSizes,
      sizeStock: normalizedSizeStock,
      stock: totalStock,
      soldCount: Number(soldCount) >= 0 ? Number(soldCount) : 0,
      discountUntil: discountUntil ? new Date(discountUntil) : null
    });

    return res.status(201).json(created);
  } catch (_err) {
    return res.status(500).json({ error: 'Napaka pri dodajanju izdelka.' });
  }
});

app.put('/api/admin/products/:id', authMiddleware, adminOnly, async (req, res) => {
  try {
    const productId = String(req.params.id || '').trim();
    if (!mongoose.Types.ObjectId.isValid(productId)) {
      return res.status(400).json({ error: 'Neveljaven ID izdelka.' });
    }

    const payload = req.body || {};
    const existingProduct = await Product.findById(productId);
    if (!existingProduct) {
      return res.status(404).json({ error: 'Izdelek ne obstaja.' });
    }
    const update = {};

    if (Object.prototype.hasOwnProperty.call(payload, 'name')) {
      const cleanName = String(payload.name || '').trim();
      if (!cleanName) return res.status(400).json({ error: 'Name je obvezen.' });
      update.name = cleanName;
    }
    if (Object.prototype.hasOwnProperty.call(payload, 'description')) {
      update.description = String(payload.description || '').trim();
    }
    if (Object.prototype.hasOwnProperty.call(payload, 'price')) {
      const cleanPrice = Number(payload.price);
      if (Number.isNaN(cleanPrice) || cleanPrice <= 0) {
        return res.status(400).json({ error: 'Price mora biti vecji od 0.' });
      }
      update.price = cleanPrice;
    }
    if (Object.prototype.hasOwnProperty.call(payload, 'oldPrice')) {
      if (payload.oldPrice === '' || payload.oldPrice === null || payload.oldPrice === undefined) {
        update.oldPrice = null;
      } else {
        const parsedOldPrice = Number(payload.oldPrice);
        update.oldPrice = Number.isNaN(parsedOldPrice) ? null : parsedOldPrice;
      }
    }
    if (Object.prototype.hasOwnProperty.call(payload, 'image')) {
      update.image = String(payload.image || '').trim();
    }
    if (Object.prototype.hasOwnProperty.call(payload, 'badge')) {
      update.badge = String(payload.badge || '').trim();
    }
    if (Object.prototype.hasOwnProperty.call(payload, 'category')) {
      update.category = 'Cevlji';
    }
    if (Object.prototype.hasOwnProperty.call(payload, 'subcategory')) {
      update.subcategory = String(payload.subcategory || '').trim();
    }
    if (Object.prototype.hasOwnProperty.call(payload, 'sizes')) {
      const cleanSizes = Array.isArray(payload.sizes)
        ? payload.sizes.map((s) => String(s).trim()).filter(Boolean)
        : String(payload.sizes || '')
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean);
      update.sizes = cleanSizes;
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
      const parsedSoldCount = Number(payload.soldCount);
      update.soldCount = Number.isNaN(parsedSoldCount) || parsedSoldCount < 0 ? 0 : Math.floor(parsedSoldCount);
    }
    if (Object.prototype.hasOwnProperty.call(payload, 'discountUntil')) {
      update.discountUntil = payload.discountUntil ? new Date(payload.discountUntil) : null;
    }

    const hasPriceInPayload = Object.prototype.hasOwnProperty.call(payload, 'price');
    const hasOldPriceInPayload = Object.prototype.hasOwnProperty.call(payload, 'oldPrice');
    if (hasPriceInPayload || hasOldPriceInPayload) {
      const nextPriceRaw = hasPriceInPayload ? update.price : Number(existingProduct.price || 0);
      const nextOldRaw = hasOldPriceInPayload ? update.oldPrice : existingProduct.oldPrice;

      let nextPrice = Number(nextPriceRaw);
      let nextOld = Number(nextOldRaw);
      const oldIsValid = Number.isFinite(nextOld) && nextOld > 0;
      if (!Number.isFinite(nextPrice) || nextPrice <= 0) {
        return res.status(400).json({ error: 'Price mora biti vecji od 0.' });
      }

      if (!oldIsValid) {
        update.price = nextPrice;
        update.oldPrice = null;
      } else if (hasOldPriceInPayload) {
        // Explicit oldPrice edit: normalize swapped values automatically.
        if (nextOld > nextPrice) {
          update.price = nextPrice;
          update.oldPrice = nextOld;
        } else if (nextOld < nextPrice) {
          update.price = nextOld;
          update.oldPrice = nextPrice;
        } else {
          update.price = nextPrice;
          update.oldPrice = null;
        }
      } else {
        // Only price changed: keep existing oldPrice only if it stays above new price.
        update.price = nextPrice;
        update.oldPrice = nextOld > nextPrice ? nextOld : null;
      }
    }
    const finalSizesForStock = Object.prototype.hasOwnProperty.call(update, 'sizes')
      ? update.sizes
      : (Array.isArray(existingProduct.sizes) ? existingProduct.sizes : []);
    const hasStockInPayload = Object.prototype.hasOwnProperty.call(payload, 'stock');
    const hasSizeStockInPayload = Object.prototype.hasOwnProperty.call(payload, 'sizeStock');
    const explicitSizeStock = Object.prototype.hasOwnProperty.call(update, 'sizeStock')
      ? update.sizeStock
      : (hasStockInPayload && !hasSizeStockInPayload ? {} : (existingProduct.sizeStock || {}));
    const fallbackStock = Object.prototype.hasOwnProperty.call(update, 'stock')
      ? update.stock
      : Number(existingProduct.stock || 0);
    const normalizedSizeStock = normalizeSizeStock(explicitSizeStock, finalSizesForStock, fallbackStock);
    update.sizeStock = normalizedSizeStock;
    update.stock = Object.values(normalizedSizeStock).reduce((acc, val) => acc + Number(val || 0), 0);

    const updated = await Product.findByIdAndUpdate(
      productId,
      { $set: update },
      { new: true }
    );

    return res.json(updated);
  } catch (_err) {
    return res.status(500).json({ error: 'Napaka pri posodabljanju izdelka.' });
  }
});

app.delete('/api/admin/products/:id', authMiddleware, adminOnly, async (req, res) => {
  try {
    const productId = String(req.params.id || '').trim();
    if (!mongoose.Types.ObjectId.isValid(productId)) {
      return res.status(400).json({ error: 'Neveljaven ID izdelka.' });
    }
    const deleted = await Product.findByIdAndDelete(productId);
    if (!deleted) {
      return res.status(404).json({ error: 'Izdelek ne obstaja.' });
    }
    return res.json({ success: true });
  } catch (_err) {
    return res.status(500).json({ error: 'Napaka pri brisanju izdelka.' });
  }
});

app.post('/api/admin/upload-product-image', authMiddleware, adminOnly, async (req, res) => {
  try {
    const { productId, dataUrl, fileName } = req.body || {};
    if (!productId || !dataUrl) {
      return res.status(400).json({ error: 'Manjkajo podatki.' });
    }

    const match = String(dataUrl).match(/^data:image\/(png|jpeg|jpg|webp|gif);base64,(.+)$/);
    if (!match) {
      return res.status(400).json({ error: 'Napacen format slike.' });
    }

    const ext = match[1] === 'jpeg' ? 'jpg' : match[1];
    const base64 = match[2];
    const buffer = Buffer.from(base64, 'base64');
    if (buffer.length > 5 * 1024 * 1024) {
      return res.status(400).json({ error: 'Slika je prevelika (max 5MB).' });
    }

    const baseName = String(fileName || 'slika')
      .replace(/\.[^.]+$/, '')
      .replace(/[^a-zA-Z0-9-_]/g, '-')
      .slice(0, 40) || 'slika';
    const storedName = `${Date.now()}-${baseName}.${ext}`;
    const uploadDir = path.join(__dirname, 'public', 'uploads');
    await fs.mkdir(uploadDir, { recursive: true });
    await fs.writeFile(path.join(uploadDir, storedName), buffer);

    const imagePath = `uploads/${storedName}`;
    const updated = await Product.findByIdAndUpdate(
      productId,
      { $set: { image: imagePath } },
      { new: true }
    );

    if (!updated) {
      return res.status(404).json({ error: 'Izdelek ne obstaja.' });
    }

    return res.json({ success: true, product: updated });
  } catch (_err) {
    return res.status(500).json({ error: 'Napaka pri nalaganju slike.' });
  }
});

// Nalaganje sporoÄŤil za klepet
app.get('/api/messages', authMiddleware, async (req, res) => {
  const messages = await Message.find().sort({ timestamp: 1 });
  res.json(messages);
});

// Pošlji novo sporočilo
app.post('/api/messages', authMiddleware, async (req, res) => {
  const { message } = req.body;
  if (!message) return res.status(400).send('SporoÄŤilo ne sme biti prazno');

  const newMessage = new Message({
    username: req.session.user.username,
    message
  });

  await newMessage.save();
  res.status(201).send('SporoÄŤilo shranjeno');
});

// Funkcija normalizeAiText skrbi za pomemben del logike aplikacije.
function normalizeAiText(value) {
  return String(value || '').trim().replace(/\s+/g, ' ').slice(0, 1200);
}

// Funkcija normalizeAiHistory skrbi za pomemben del logike aplikacije.
function normalizeAiHistory(value) {
  if (!Array.isArray(value)) return [];
  const out = [];
  for (const item of value.slice(-10)) {
    if (!item || typeof item !== 'object') continue;
    const roleRaw = String(item.role || '').toLowerCase();
    const role = roleRaw === 'assistant' ? 'assistant' : roleRaw === 'user' ? 'user' : '';
    const content = normalizeAiText(item.content || '');
    if (!role || !content) continue;
    out.push({ role, content });
  }
  return out;
}

// Funkcija fallbackAiReply skrbi za pomemben del logike aplikacije.
function fallbackAiReply(message, products = []) {
  const text = normalizeAiText(message).toLowerCase();
  // Funkcija has skrbi za pomemben del logike aplikacije.
  const has = (k) => text.includes(k);

  if (has('dostav')) {
    return 'Dostava: na dom, prednostna (+4 EUR) ali osebni prevzem. Koncna cena se samodejno preracuna v kosarici.';
  }
  if (has('placil') || has('kartic') || has('povzet')) {
    return 'Placilo: po povzetju (+3 EUR), spletno placilo s kartico ali obrocno (Leanpay). Pri kartici preveri: ime, stevilka, veljavnost in CVC.';
  }
  if (has('vrac') || has('reklamac')) {
    return 'Za vracilo ali reklamacijo odpri Podpora > Kontakt in poslji stevilko narocila. Pomagamo ti hitro in konkretno.';
  }
  if (has('narocil') || has('status')) {
    return 'Status narocila preveris v My Orders: Oddano -> Potrjeno -> Poslano -> Dostavljeno.';
  }

  const found = products.find((p) => text.includes(String(p.name || '').toLowerCase()));
  if (found) {
    const price = Number(found.price || 0).toFixed(2);
    const stock = Math.max(0, Math.floor(Number(found.stock || 0)));
    return `${found.name}: cena ${price} EUR, zaloga ${stock}. Za tocno velikost odpri izdelek in preveri razpolozljivost po stevilkah.`;
  }

  return 'Sem AI pomocnik Domen Core. Vprasas me lahko o dostavi, placilu, statusu narocila, vracilih ali modelih cevljev.';
}

async function fetchOpenAiReply(message, products = [], history = []) {
  const apiKey = String(process.env.OPENAI_API_KEY || '').trim();
  if (!apiKey) return null;

  const model = String(process.env.OPENAI_MODEL || 'gpt-4o-mini').trim();
  const catalog = products.slice(0, 8).map((p) => (
    `- ${String(p.name || '')} | ${String(p.subcategory || '')} | ${Number(p.price || 0).toFixed(2)} EUR | stock ${Math.max(0, Math.floor(Number(p.stock || 0)))}`
  )).join('\n');

  const system = [
    'Ti si AI pomocnik za spletno trgovino Domen Core.',
    'Odgovarjaj kratko, konkretno in v slovenscini.',
    'Nikoli ne izmisljuj dejstev.',
    'Ce uporabnik sprasuje o statusu narocila, ga usmeri na My Orders.',
    'Ce ne ves tocnega podatka, povej kaj naj uporabnik naredi naprej.',
    catalog ? `Kratek katalog:\n${catalog}` : ''
  ].filter(Boolean).join('\n');

  const input = [{ role: 'system', content: system }];
  for (const turn of normalizeAiHistory(history)) {
    input.push({ role: turn.role, content: turn.content });
  }
  input.push({ role: 'user', content: normalizeAiText(message) });

  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      input,
      temperature: 0.4
    })
  });

  if (!response.ok) return null;
  const data = await response.json().catch(() => ({}));
  const text = normalizeAiText(data.output_text || '');
  return text || null;
}

app.post('/api/ai-chat', authMiddleware, async (req, res) => {
  try {
    const message = normalizeAiText(req.body?.message || '');
    const history = normalizeAiHistory(req.body?.history);
    if (!message) {
      return res.status(400).json({ error: 'Vprasanje je prazno.' });
    }

    const products = await Product.find()
      .select('name subcategory price stock')
      .sort({ soldCount: -1, createdAt: -1 })
      .limit(12)
      .lean();

    const aiReply = await fetchOpenAiReply(message, products, history);
    const reply = aiReply || fallbackAiReply(message, products);
    return res.json({ reply });
  } catch (_err) {
    return res.status(500).json({ error: 'AI pomocnik trenutno ni dosegljiv.' });
  }
});

app.get('/api/ai-chat/status', authMiddleware, (req, res) => {
  const hasOpenAi = Boolean(String(process.env.OPENAI_API_KEY || '').trim());
  return res.json({
    online: true,
    provider: hasOpenAi ? 'openai' : 'fallback'
  });
});

// Zaščiten dostop do domače strani in klepeta
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'home.html'));
});

app.get('/shop', (req, res) => {
  res.redirect('/index.html');
});

app.get('/profile.html', authMiddleware, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'profile.html'));
});

app.get('/api/profile', authMiddleware, async (req, res) => {
  const userId = await resolveSessionUserId(req.session.user);
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  const user = await User.findById(userId).select('username email avatar role');
  if (!user) return res.status(404).json({ error: 'Uporabnik ne obstaja.' });
  return res.json({
    id: String(user._id),
    username: user.username,
    email: user.email,
    role: user.role,
    avatar: user.avatar || ''
  });
});

app.post('/api/profile/avatar', authMiddleware, async (req, res) => {
  try {
    const userId = await resolveSessionUserId(req.session.user);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const { dataUrl, fileName } = req.body || {};
    if (!dataUrl) return res.status(400).json({ error: 'Manjka slika.' });
    const match = String(dataUrl).match(/^data:image\/(png|jpeg|jpg|webp|gif);base64,(.+)$/);
    if (!match) return res.status(400).json({ error: 'Napacen format slike.' });

    const ext = match[1] === 'jpeg' ? 'jpg' : match[1];
    const base64 = match[2];
    const buffer = Buffer.from(base64, 'base64');
    if (buffer.length > 3 * 1024 * 1024) {
      return res.status(400).json({ error: 'Avatar je prevelik (max 3MB).' });
    }

    const baseName = String(fileName || 'avatar')
      .replace(/\.[^.]+$/, '')
      .replace(/[^a-zA-Z0-9-_]/g, '-')
      .slice(0, 40) || 'avatar';
    const storedName = `${Date.now()}-${baseName}.${ext}`;
    const uploadDir = path.join(__dirname, 'public', 'uploads', 'avatars');
    await fs.mkdir(uploadDir, { recursive: true });
    await fs.writeFile(path.join(uploadDir, storedName), buffer);
    const avatarPath = `uploads/avatars/${storedName}`;

    const updated = await User.findByIdAndUpdate(
      userId,
      { $set: { avatar: avatarPath } },
      { new: true }
    ).select('username email role avatar');

    return res.json({
      id: String(updated._id),
      username: updated.username,
      email: updated.email,
      role: updated.role,
      avatar: updated.avatar || ''
    });
  } catch (_err) {
    return res.status(500).json({ error: 'Napaka pri nalaganju avatarja.' });
  }
});

app.post('/api/change-password', authMiddleware, async (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  if (!currentPassword || !newPassword || String(newPassword).length < 7) {
    return res.status(400).json({ error: 'Neveljavni podatki.' });
  }
  const userId = await resolveSessionUserId(req.session.user);
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  const user = await User.findById(userId);
  if (!user) return res.status(404).json({ error: 'Uporabnik ne obstaja.' });

  const isMatch = await bcrypt.compare(String(currentPassword), user.password);
  if (!isMatch) return res.status(400).json({ error: 'Trenutno geslo ni pravilno.' });

  user.password = await bcrypt.hash(String(newPassword), 10);
  await user.save();
  return res.json({ message: 'Geslo je uspesno spremenjeno.' });
});

app.get('/chat.html', authMiddleware, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'chat.html'));
});

// Dostop do prijave in registracije
app.get('/prijava.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'prijava.html'));
});

app.get('/registracija.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'registracija.html'));
});

app.use(express.static(publicDir, { index: false }));

// Socket.io povezava za klepet
io.use((socket, next) => {
  sessionMiddleware(socket.request, {}, next);
});

io.on('connection', (socket) => {
  const session = socket.request.session;
  if (!session.user) {
    socket.disconnect();
    return;
  }

  socket.on('chat message', async (msg) => {
    const newMessage = new Message({
      username: session.user.username,
      message: msg
    });
    await newMessage.save();

    io.emit('chat message', {
      username: session.user.username,
      message: msg,
      timestamp: newMessage.timestamp
    });
  });
});


const orderSchema = new mongoose.Schema({
  userId: { type: String, required: true },
  kupec: {
    ime: String,
    ulica: String,
    posta: String,
    kraj: String,
    email: String,
    telefon: String,
    dostava: String,
    placilo: String
    
    
  },
  izdelki: [Object],
  itemsTotal: { type: Number, default: 0 },
  discountPercent: { type: Number, default: 0 },
  discountAmount: { type: Number, default: 0 },
  finalTotal: { type: Number, default: 0 },
  status: {
    type: String,
    enum: ['Oddano', 'Potrjeno', 'Poslano', 'Dostavljeno'],
    default: 'Oddano'
  },
  datum: { type: Date, default: Date.now }
});

const Order = mongoose.model('Order', orderSchema);

app.post('/api/order', authMiddleware, async (req, res) => {
  try {
    const { kupec, izdelki } = req.body;
    if (!kupec || !izdelki || izdelki.length === 0) {
      return res.status(400).send("Podatki niso popolni.");
    }

    const namePattern = /^[A-Za-zČčŠšŽžĆćĐđ\-\s'.]{2,60}$/;
    const streetPattern = /^.{4,100}$/;
    const postPattern = /^\d{4}$/;
    const cityPattern = /^[A-Za-zČčŠšŽžĆćĐđ\-\s'.]{2,60}$/;
    const phonePattern = /^\+?[0-9\s()\/-]{8,20}$/;
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
    const allowedShipping = new Set(['posta', 'prednostna', 'osebno']);
    const allowedPayments = new Set(['povzetje', 'kartica', 'leanpay']);

    const kup = kupec || {};
    if (!namePattern.test(String(kup.ime || '').trim())) {
      return res.status(400).json({ error: 'Vnesi veljavno ime.' });
    }
    if (!namePattern.test(String(kup.priimek || '').trim())) {
      return res.status(400).json({ error: 'Vnesi veljaven priimek.' });
    }
    if (!streetPattern.test(String(kup.ulica || '').trim())) {
      return res.status(400).json({ error: 'Vnesi veljavno ulico in hišno številko.' });
    }
    if (!postPattern.test(String(kup.posta || '').trim())) {
      return res.status(400).json({ error: 'Poštna številka mora imeti 4 številke.' });
    }
    if (!cityPattern.test(String(kup.kraj || '').trim())) {
      return res.status(400).json({ error: 'Vnesi veljaven kraj.' });
    }
    const phoneRaw = String(kup.telefon || '').trim();
    const phoneDigits = phoneRaw.replace(/[^\d]/g, '');
    if (!phonePattern.test(phoneRaw) || phoneDigits.length < 8 || phoneDigits.length > 15) {
      return res.status(400).json({ error: 'Vnesi veljavno telefonsko številko.' });
    }
    if (!emailPattern.test(String(kup.email || '').trim())) {
      return res.status(400).json({ error: 'Vnesi veljaven e-poštni naslov.' });
    }
    if (!allowedShipping.has(String(kup.dostava || '').trim())) {
      return res.status(400).json({ error: 'Izberi veljaven način dostave.' });
    }
    if (!allowedPayments.has(String(kup.placilo || '').trim())) {
      return res.status(400).json({ error: 'Izberi veljaven način plačila.' });
    }

    const userId = await resolveSessionUserId(req.session.user);
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const productSizeQty = new Map();
    for (const item of izdelki) {
      const qty = Math.max(1, Math.floor(Number(item?.kolicina || 1)));
      let target = null;
      if (item.productId && mongoose.Types.ObjectId.isValid(item.productId)) {
        target = await Product.findById(item.productId);
      }
      if (!target && item.ime) {
        target = await Product.findOne({ name: item.ime }).sort({ createdAt: -1 });
      }
      if (target) {
        const sizeKey = String(item.size || '').trim();
        const key = `${String(target._id)}::${sizeKey}`;
        productSizeQty.set(key, (productSizeQty.get(key) || 0) + qty);
      }
    }

    for (const [compoundKey, qty] of productSizeQty.entries()) {
      const [productId, selectedSize = ''] = String(compoundKey).split('::');
      const product = await Product.findById(productId);
      if (!product) {
        return res.status(400).json({ error: 'Eden izmed izdelkov ni vec na zalogi.' });
      }
      const mapObj = toPlainSizeStock(product.sizeStock);
      if (selectedSize && Object.prototype.hasOwnProperty.call(mapObj, selectedSize)) {
        if (Number(mapObj[selectedSize] || 0) < qty) {
          return res.status(400).json({ error: `Velikost ${selectedSize} ni vec na zalogi.` });
        }
      } else if (Number(product.stock || 0) < qty) {
        return res.status(400).json({ error: 'Eden izmed izdelkov ni vec na zalogi.' });
      }
    }

    for (const [compoundKey, qty] of productSizeQty.entries()) {
      const [productId, selectedSize = ''] = String(compoundKey).split('::');
      const product = await Product.findById(productId);
      if (!product) continue;
      const mapObj = toPlainSizeStock(product.sizeStock);
      if (selectedSize && Object.prototype.hasOwnProperty.call(mapObj, selectedSize)) {
        mapObj[selectedSize] = Math.max(0, Math.floor(Number(mapObj[selectedSize] || 0) - qty));
      }
      const nextStock = Object.values(mapObj).reduce((acc, val) => acc + Number(val || 0), 0);
      const soldDelta = Number(qty || 0);
      await Product.updateOne(
        { _id: productId },
        { $set: { sizeStock: mapObj, stock: nextStock }, $inc: { soldCount: soldDelta } }
      );
    }

    const itemsTotal = izdelki.reduce((sum, item) => {
      const qty = Math.max(1, Math.floor(Number(item?.kolicina || 1)));
      return sum + (Number(item.cena || 0) * qty);
    }, 0);
    const baseDiscountAmount = izdelki.reduce((sum, item) => {
      const hasDiscount = item && (item.hasDiscount === true || item.hasDiscount === '1');
      const currentPrice = Number(item?.cena || 0);
      const oldPrice = Number(item?.oldCena || 0);
      const qty = Math.max(1, Math.floor(Number(item?.kolicina || 1)));
      if (!hasDiscount || !Number.isFinite(currentPrice) || !Number.isFinite(oldPrice) || oldPrice <= currentPrice) {
        return sum;
      }
      return sum + ((oldPrice - currentPrice) * qty);
    }, 0);
    let dodatki = 0;
    if (String(kup.placilo || '').trim() === 'povzetje') dodatki += 3;
    if (String(kup.dostava || '').trim() === 'prednostna') dodatki += 4;
    const discountPercent = 0;
    const discountAmount = Number(baseDiscountAmount.toFixed(2));
    const finalTotal = Number(Math.max(0, itemsTotal + dodatki).toFixed(2));

    const order = new Order({
      userId,
      kupec,
      izdelki,
      itemsTotal: Number(itemsTotal.toFixed(2)),
      discountPercent,
      discountAmount,
      finalTotal,
      status: 'Oddano'
    });
    await order.save();

    res.status(200).json({
      message: "Narocilo je bilo uspesno oddano.",
      discountPercent,
      discountAmount,
      finalTotal
    });
  } catch (err) {
    console.error(err);
    res.status(500).send('Napaka pri obdelavi naročila.');
  }
});

app.get('/api/my-orders', authMiddleware, async (req, res) => {
  const userId = await resolveSessionUserId(req.session.user);
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  const orders = await Order.find({ userId }).sort({ datum: -1 }).lean();
  res.json(orders.map((order) => ({
    ...order,
    status: String(order.status || 'Oddano')
  })));
});

app.get('/api/admin/orders', authMiddleware, adminOnly, async (_req, res) => {
  const orders = await Order.find().sort({ datum: -1 }).lean();
  const userIds = [...new Set(orders.map((o) => String(o.userId || '')).filter((id) => mongoose.Types.ObjectId.isValid(id)))];
  const users = await User.find({ _id: { $in: userIds } }).select('username email').lean();
  const userMap = new Map(users.map((u) => [String(u._id), u]));

  const enriched = orders.map((order) => {
    const account = userMap.get(String(order.userId || ''));
    return {
      ...order,
      status: String(order.status || 'Oddano'),
      account: account
        ? { username: account.username || '', email: account.email || '' }
        : { username: '', email: '' }
    };
  });

  res.json(enriched);
});

app.put('/api/admin/orders/:id/status', authMiddleware, adminOnly, async (req, res) => {
  try {
    const orderId = String(req.params.id || '').trim();
    const allowedStatuses = ['Oddano', 'Potrjeno', 'Poslano', 'Dostavljeno'];
    if (!mongoose.Types.ObjectId.isValid(orderId)) {
      return res.status(400).json({ error: 'Neveljaven ID narocila.' });
    }

    const nextStatus = String(req.body?.status || '').trim();
    if (!allowedStatuses.includes(nextStatus)) {
      return res.status(400).json({ error: 'Neveljaven status narocila.' });
    }

    const updated = await Order.findByIdAndUpdate(
      orderId,
      { $set: { status: nextStatus } },
      { new: true }
    ).lean();
    if (!updated) {
      return res.status(404).json({ error: 'Narocilo ne obstaja.' });
    }
    return res.json({
      success: true,
      orderId: String(updated._id),
      status: String(updated.status || nextStatus)
    });
  } catch (_err) {
    return res.status(500).json({ error: 'Napaka pri posodobitvi statusa.' });
  }
});

app.get('/api/admin/ratings', authMiddleware, adminOnly, async (_req, res) => {
  const ratings = await Rating.find().sort({ date: -1 }).lean();
  res.json(ratings.map((r) => ({
    ...r,
    username: r.username || 'Gost',
    email: r.email || ''
  })));
});

app.get('/api/ratings/summary', async (req, res) => {
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
    summary[key] = {
      avg: Number((Number(item.avg || 0)).toFixed(1)),
      count: Number(item.count || 0)
    };
  });
  res.json(summary);
});

app.post('/api/forgot-password', async (req, res) => {
  const email = String(req.body?.email || '').trim();
  if (!email) {
    return res.status(400).json({ error: 'Vnesi email.' });
  }

  const user = await User.findOne({ email: new RegExp(`^${email.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') });
  if (!user) {
    return res.json({ message: 'Ce email obstaja, je bil poslan reset link.' });
  }

  const token = crypto.randomBytes(24).toString('hex');
  user.resetToken = token;
  user.resetTokenExpires = new Date(Date.now() + 1000 * 60 * 30);
  await user.save();

  return res.json({
    message: 'Reset link je pripravljen.',
    resetLink: `/reset-password.html?token=${token}`
  });
});

app.post('/api/reset-password', async (req, res) => {
  const token = String(req.body?.token || '');
  const newPassword = String(req.body?.newPassword || '');
  if (!token || newPassword.length < 7) {
    return res.status(400).json({ error: 'Neveljavni podatki.' });
  }

  const user = await User.findOne({
    resetToken: token,
    resetTokenExpires: { $gt: new Date() }
  });

  if (!user) {
    return res.status(400).json({ error: 'Link je potekel ali ne obstaja.' });
  }

  user.password = await bcrypt.hash(newPassword, 10);
  user.resetToken = null;
  user.resetTokenExpires = null;
  await user.save();

  return res.json({ message: 'Geslo je uspesno zamenjano.' });
});
// model za ocene
const Rating = mongoose.model('Rating', new mongoose.Schema({
  productId: { type: String, index: true, default: '' },
  stars: Number,
  comment: String,
  userId: { type: String, default: '' },
  username: { type: String, default: 'Gost' },
  email: { type: String, default: '' },
  date: { type: Date, default: Date.now }
}));

setupAdmin(app, authMiddleware, { User, Message, Order, Rating, Product, Wishlist }).catch(() => {
  app.get('/admin', authMiddleware, (_req, res) => {
    res.status(500).send('Admin panel se ni pravilno nalozil.');
  });
});

// API endpoint za oddajo ocen
app.post('/api/ratings', async (req, res) => {
  const { stars, comment, productId } = req.body;
  if (!stars || !comment || !productId) {
    return res.status(400).send('Manjkajo podatki.');
  }

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

    const newRating = new Rating({
      productId: String(productId || ''),
      stars,
      comment,
      userId,
      username,
      email
    });
    await newRating.save();

    const stat = await Rating.aggregate([
      { $match: { productId: String(productId || '') } },
      { $group: { _id: '$productId', avg: { $avg: '$stars' }, count: { $sum: 1 } } }
    ]);
    const first = stat[0] || { avg: Number(stars) || 0, count: 1 };
    res.status(200).json({
      message: 'Ocena uspešno shranjena.',
      summary: {
        avg: Number((Number(first.avg || 0)).toFixed(1)),
        count: Number(first.count || 0)
      }
    });
  } catch (err) {
    console.error('Napaka pri shranjevanju ocene:', err);
    res.status(500).send('Napaka pri shranjevanju.');
  }
});

// Zagon strežnika
server.listen(3000, () => {
  const startedAt = new Date().toLocaleString('sl-SI');
  console.log('');
  console.log('========================================');
  console.log('  DOMEN CORE SERVER');
  console.log('========================================');
  console.log(`  Status: RUNNING`);
  console.log(`  URL:    http://localhost:3000`);
  console.log(`  Time:   ${startedAt}`);
  console.log('========================================');
  console.log('');
});






