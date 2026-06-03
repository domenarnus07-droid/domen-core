const express = require('express');
const session = require('express-session');
const mongoose = require('mongoose');
const path = require('path');
const http = require('http');
const helmet = require('helmet');
const { Server } = require('socket.io');
const setupAdmin = require('./admin');

const { ensureAdminUser, ensureDefaultProducts, ensureProductMetadata, startExpiredPriceTimer } = require('./db/models');
const authRoutes = require('./routes/auth');
const profileRoutes = require('./routes/profile');
const productRoutes = require('./routes/products');
const orderRoutes = require('./routes/orders');
const adminRoutes = require('./routes/admin');
const cartRoutes = require('./routes/cart');
const { router: chatRouter, initSocket } = require('./routes/chat');

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const publicDir = path.join(__dirname, 'public');

mongoose.connect('mongodb+srv://domenarnus07:Domen12730@cluster0.do2brlj.mongodb.net/myapp?retryWrites=true&w=majority&appName=Cluster0')
  .then(async () => {
    await ensureAdminUser();
    await ensureDefaultProducts();
    await ensureProductMetadata();
    startExpiredPriceTimer();
  })
  .catch((err) => { console.error('MongoDB povezava ni uspela:', err.message); });

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:', 'blob:'],
      connectSrc: ["'self'", 'wss:', 'ws:'],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      frameSrc: ["'none'"],
    },
  },
  crossOriginEmbedderPolicy: false,
}));
app.use(express.urlencoded({ extended: true }));
app.use(express.json({ limit: '8mb' }));
app.use(express.static(publicDir, { index: false }));

const sessionMiddleware = session({ secret: 'skrivnost', resave: false, saveUninitialized: false });
app.use(sessionMiddleware);

// Routes
app.use(authRoutes);
app.use(profileRoutes);
app.use(productRoutes);
app.use(orderRoutes);
app.use(adminRoutes);
app.use(cartRoutes);
app.use(chatRouter);

// Static page routes
app.get('/', (req, res) => res.sendFile(path.join(publicDir, 'home.html')));
app.get('/shop', (req, res) => res.redirect('/index.html'));
app.get('/prijava.html', (req, res) => res.sendFile(path.join(publicDir, 'prijava.html')));
app.get('/registracija.html', (req, res) => res.sendFile(path.join(publicDir, 'registracija.html')));
app.get('/admin/upload', (req, res) => res.sendFile(path.join(publicDir, 'admin-upload.html')));

// Admin panel
const { User, Message, Order, Rating, Product, Wishlist } = require('./db/models');
setupAdmin(app, require('./middleware/auth').authMiddleware, { User, Message, Order, Rating, Product, Wishlist }).catch(() => {
  app.get('/admin', (_req, res) => res.status(500).send('Admin panel se ni pravilno nalozil.'));
});

// 404 handler
app.use((_req, res) => {
  res.status(404).sendFile(path.join(publicDir, '404.html'));
});

// Centralni error handler za vse async route napake.
app.use((err, _req, res, _next) => {
  res.status(500).json({ error: 'Notranja napaka streznika.' });
});

// Socket.io
initSocket(io, sessionMiddleware);

server.listen(3000, () => {
  const startedAt = new Date().toLocaleString('sl-SI');
  console.log('');
  console.log('========================================');
  console.log('  DOMEN CORE SERVER');
  console.log('========================================');
  console.log('  Status: RUNNING');
  console.log('  URL:    http://localhost:3000');
  console.log(`  Time:   ${startedAt}`);
  console.log('========================================');
  console.log('');
});
