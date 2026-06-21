const express = require('express');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const rateLimit = require('express-rate-limit');
const { User, ADMIN_EMAIL } = require('../db/models');
const { authMiddleware, resolveSessionUserId } = require('../middleware/auth');

const EMAIL_USER = 'domen.arnus07@gmail.com';
const EMAIL_PASS = '';
const EMAIL_FROM = 'Domen Core <domen.arnus07@gmail.com>';
// URL aplikacije (za povezave v e-pošti, npr. ponastavitev gesla).
// Na Renderju nastavi APP_URL; sicer privzeto produkcijski URL.
const APP_URL = process.env.APP_URL || 'https://domen-core.onrender.com';

const mailer = nodemailer.createTransport({
  service: 'gmail',
  auth: { user: EMAIL_USER, pass: EMAIL_PASS },
});

async function sendResetEmail(toEmail, resetLink) {
  if (!EMAIL_PASS) {
    console.warn('[reset-password] EMAIL_PASS ni nastavljen — link:', resetLink);
    return;
  }
  await mailer.sendMail({
    from: EMAIL_FROM,
    to: toEmail,
    subject: 'Domen Core — ponastavitev gesla',
    text: `Klikni na spodnjo povezavo za ponastavitev gesla (veljavna 30 minut):\n\n${resetLink}\n\nČe nisi zahteval/-a ponastavitve, ignoriraj ta email.`,
    html: `<p>Klikni na spodnjo povezavo za ponastavitev gesla <strong>(veljavna 30 minut)</strong>:</p><p><a href="${resetLink}">${resetLink}</a></p><p style="color:#888;font-size:12px;">Če nisi zahteval/-a ponastavitve, ignoriraj ta email.</p>`,
  });
}

const router = express.Router();
const wrap = (fn) => (req, res, next) => fn(req, res, next).catch(next);

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: 'Prevec poskusov prijave. Pocakaj 15 minut.',
  standardHeaders: true,
  legacyHeaders: false,
});

const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  message: 'Prevec registracij. Pocakaj 1 uro.',
  standardHeaders: true,
  legacyHeaders: false,
});

const usernamePattern = /^[a-zA-Z0-9_]{3,24}$/;
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const strongPasswordPattern = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z\d]).{8,}$/;

router.post('/register', registerLimiter, wrap(async (req, res) => {
  const username = String(req.body?.username || '').trim();
  const email = String(req.body?.email || '').trim().toLowerCase();
  const password = String(req.body?.password || '');

  if (!username || !email || !password) return res.status(400).send('Vsa polja morajo biti izpolnjena.');
  if (!usernamePattern.test(username)) return res.status(400).send('Uporabnisko ime naj ima 3-24 znakov (crke, stevilke, _).');
  if (!emailPattern.test(email)) return res.status(400).send('Vnesi veljaven email naslov.');
  if (!strongPasswordPattern.test(password)) return res.status(400).send('Geslo mora imeti vsaj 8 znakov ter veliko, malo crko, stevilko in poseben znak.');
  if (email === ADMIN_EMAIL) return res.status(400).send('Ta e-posta ni dovoljena za registracijo.');

  const safeUsername = username.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const safeEmail = email.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  if (await User.findOne({ username: new RegExp(`^${safeUsername}$`, 'i') })) return res.status(400).send('Uporabnisko ime ze obstaja.');
  if (await User.findOne({ email: new RegExp(`^${safeEmail}$`, 'i') })) return res.status(400).send('E-posta je ze registrirana.');

  const hashedPassword = await bcrypt.hash(password, 10);
  await new User({ username, email, password: hashedPassword, role: 'user' }).save();
  res.status(200).send('Registracija uspesna');
}));

router.post('/login', loginLimiter, wrap(async (req, res) => {
  const identifier = String(req.body?.username || '').trim();
  const password = String(req.body?.password || '');
  const user = await User.findOne({ $or: [{ username: identifier }, { email: identifier }] });
  if (!user) return res.status(400).send('Uporabnik ne obstaja');
  if (!await bcrypt.compare(password, user.password)) return res.status(400).send('Napacno geslo.');
  const role = user.role || (user.email === ADMIN_EMAIL ? 'admin' : 'user');
  req.session.user = { id: String(user._id), username: user.username, email: user.email, role };
  res.status(200).send('Prijava uspesna');
}));

router.get('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/prijava.html'));
});

router.get('/api/user', (req, res) => {
  if (!req.session.user) return res.json({ user: null });
  User.findById(req.session.user.id)
    .then((user) => {
      if (!user) return res.json({ user: null });
      return res.json({ user: { id: String(user._id), username: user.username, email: user.email, role: user.role, avatar: user.avatar || '' } });
    })
    .catch(() => res.json({ user: req.session.user || null }));
});

router.post('/api/change-password', authMiddleware, wrap(async (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  if (!currentPassword || !newPassword) return res.status(400).json({ error: 'Neveljavni podatki.' });
  if (!strongPasswordPattern.test(String(newPassword))) return res.status(400).json({ error: 'Novo geslo mora imeti vsaj 8 znakov ter veliko, malo crko, stevilko in poseben znak.' });
  const userId = await resolveSessionUserId(req.session.user);
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  const user = await User.findById(userId);
  if (!user) return res.status(404).json({ error: 'Uporabnik ne obstaja.' });
  if (!await bcrypt.compare(String(currentPassword), user.password)) return res.status(400).json({ error: 'Trenutno geslo ni pravilno.' });
  user.password = await bcrypt.hash(String(newPassword), 10);
  await user.save();
  return res.json({ message: 'Geslo je uspesno spremenjeno.' });
}));

router.post('/api/forgot-password', wrap(async (req, res) => {
  const email = String(req.body?.email || '').trim();
  if (!email) return res.status(400).json({ error: 'Vnesi email.' });
  if (!emailPattern.test(email)) return res.status(400).json({ error: 'Vnesi veljaven email naslov.' });
  const user = await User.findOne({ email: new RegExp(`^${email.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') });
  if (!user) return res.json({ message: 'Ce email obstaja, je bil poslan reset link.' });
  const token = crypto.randomBytes(24).toString('hex');
  user.resetToken = token;
  user.resetTokenExpires = new Date(Date.now() + 1000 * 60 * 30);
  await user.save();
  const resetLink = `${APP_URL}/reset-password.html?token=${token}`;
  await sendResetEmail(user.email, resetLink).catch((err) => console.error('[reset-password] Email ni bil poslan:', err.message));
  return res.json({ message: 'Ce email obstaja, je bil poslan reset link.' });
}));

router.post('/api/reset-password', wrap(async (req, res) => {
  const token = String(req.body?.token || '');
  const newPassword = String(req.body?.newPassword || '');
  if (!token || !newPassword) return res.status(400).json({ error: 'Neveljavni podatki.' });
  if (!strongPasswordPattern.test(newPassword)) return res.status(400).json({ error: 'Geslo mora imeti vsaj 8 znakov ter veliko, malo crko, stevilko in poseben znak.' });
  const user = await User.findOne({ resetToken: token, resetTokenExpires: { $gt: new Date() } });
  if (!user) return res.status(400).json({ error: 'Link je potekel ali ne obstaja.' });
  user.password = await bcrypt.hash(newPassword, 10);
  user.resetToken = null;
  user.resetTokenExpires = null;
  await user.save();
  return res.json({ message: 'Geslo je uspesno zamenjano.' });
}));

module.exports = router;
