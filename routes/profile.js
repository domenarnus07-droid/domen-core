const express = require('express');
const path = require('path');
const fs = require('fs/promises');
const { User } = require('../db/models');
const { authMiddleware, resolveSessionUserId } = require('../middleware/auth');

const router = express.Router();
const wrap = (fn) => (req, res, next) => fn(req, res, next).catch(next);

router.get('/profile.html', authMiddleware, (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'profile.html'));
});

router.get('/api/profile', authMiddleware, wrap(async (req, res) => {
  const userId = await resolveSessionUserId(req.session.user);
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  const user = await User.findById(userId).select('username email avatar role phone address defaultShipping defaultPayment');
  if (!user) return res.status(404).json({ error: 'Uporabnik ne obstaja.' });
  return res.json({
    id: String(user._id), username: user.username, email: user.email, role: user.role,
    avatar: user.avatar || '', phone: user.phone || '', address: user.address || '',
    defaultShipping: user.defaultShipping || 'posta', defaultPayment: user.defaultPayment || 'povzetje'
  });
}));

router.post('/api/profile/preferences', authMiddleware, wrap(async (req, res) => {
  const userId = await resolveSessionUserId(req.session.user);
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  const phone = String(req.body?.phone || '').trim();
  const address = String(req.body?.address || '').trim();
  const defaultShipping = String(req.body?.defaultShipping || '').trim();
  const defaultPayment = String(req.body?.defaultPayment || '').trim();

  if (phone && !/^\+?[0-9\s()\/-]{8,20}$/.test(phone)) return res.status(400).json({ error: 'Telefon ni v veljavni obliki.' });
  if (address && !/^.{4,120}$/.test(address)) return res.status(400).json({ error: 'Naslov mora imeti vsaj 4 znake.' });
  if (!['posta', 'prednostna', 'osebno'].includes(defaultShipping)) return res.status(400).json({ error: 'Izberi veljaven privzet nacin dostave.' });
  if (!['povzetje', 'kartica', 'leanpay'].includes(defaultPayment)) return res.status(400).json({ error: 'Izberi veljaven privzet nacin placila.' });

  const updated = await User.findByIdAndUpdate(userId, { $set: { phone, address, defaultShipping, defaultPayment } }, { new: true })
    .select('username email avatar role phone address defaultShipping defaultPayment');
  return res.json({
    id: String(updated._id), username: updated.username, email: updated.email, role: updated.role,
    avatar: updated.avatar || '', phone: updated.phone || '', address: updated.address || '',
    defaultShipping: updated.defaultShipping || 'posta', defaultPayment: updated.defaultPayment || 'povzetje'
  });
}));

router.post('/api/profile/avatar', authMiddleware, wrap(async (req, res) => {
  try {
    const userId = await resolveSessionUserId(req.session.user);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    const { dataUrl, fileName } = req.body || {};
    if (!dataUrl) return res.status(400).json({ error: 'Manjka slika.' });
    const match = String(dataUrl).match(/^data:image\/(png|jpeg|jpg|webp|gif);base64,(.+)$/);
    if (!match) return res.status(400).json({ error: 'Napacen format slike.' });
    const ext = match[1] === 'jpeg' ? 'jpg' : match[1];
    const buffer = Buffer.from(match[2], 'base64');
    if (buffer.length > 3 * 1024 * 1024) return res.status(400).json({ error: 'Avatar je prevelik (max 3MB).' });
    const baseName = String(fileName || 'avatar').replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9-_]/g, '-').slice(0, 40) || 'avatar';
    const storedName = `${Date.now()}-${baseName}.${ext}`;
    const uploadDir = path.join(__dirname, '..', 'public', 'uploads', 'avatars');
    await fs.mkdir(uploadDir, { recursive: true });
    await fs.writeFile(path.join(uploadDir, storedName), buffer);
    const updated = await User.findByIdAndUpdate(userId, { $set: { avatar: `uploads/avatars/${storedName}` } }, { new: true })
      .select('username email role avatar');
    return res.json({ id: String(updated._id), username: updated.username, email: updated.email, role: updated.role, avatar: updated.avatar || '' });
  } catch (_err) {
    return res.status(500).json({ error: 'Napaka pri nalaganju avatarja.' });
  }
}));

module.exports = router;
