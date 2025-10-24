// middleware/auth.js
export const requireAuth = (req, res, next) => {
  if (req.session?.user) return next();
  return res.status(401).json({ ok: false, error: 'auth_required' });
};
