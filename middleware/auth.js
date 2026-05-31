const { User } = require('../db/models');

async function resolveSessionUserId(sessionUser) {
  if (sessionUser?.id) return sessionUser.id;
  if (!sessionUser) return null;
  const user = await User.findOne({
    $or: [{ email: sessionUser.email || '' }, { username: sessionUser.username || '' }]
  });
  return user ? String(user._id) : null;
}

function authMiddleware(req, res, next) {
  if (req.session.user) return next();
  if (req.path.startsWith('/api/')) return res.status(401).json({ error: 'Unauthorized' });
  res.redirect('/prijava.html');
}

function adminOnly(req, res, next) {
  if (req.session.user?.role === 'admin') return next();
  return res.status(403).json({ error: 'Admin only' });
}

module.exports = { authMiddleware, adminOnly, resolveSessionUserId };
