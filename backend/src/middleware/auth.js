const jwt = require('jsonwebtoken');
const { query } = require('../utils/db');

/**
 * Verify JWT and attach user to req
 */
const authenticate = async (req, res, next) => {
  try {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Token de autenticación requerido.' });
    }
    const token = header.slice(7);
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Load fresh user from DB (catches deactivated users)
    const { rows } = await query(
      'SELECT id, email, full_name, role, is_active FROM users WHERE id = $1',
      [decoded.userId]
    );

    if (!rows.length || !rows[0].is_active) {
      return res.status(401).json({ error: 'Usuario no encontrado o desactivado.' });
    }

    req.user = rows[0];
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Sesión expirada. Inicie sesión nuevamente.' });
    }
    return res.status(401).json({ error: 'Token inválido.' });
  }
};

/**
 * Restrict to specific roles
 * @param  {...string} roles - allowed roles
 */
const authorize = (...roles) => (req, res, next) => {
  if (!req.user || !roles.includes(req.user.role)) {
    return res.status(403).json({
      error: 'No tiene permisos para realizar esta acción.',
      required: roles,
      current: req.user?.role,
    });
  }
  next();
};

const adminOnly  = authorize('admin');
const managerUp  = authorize('admin', 'bim_manager');

module.exports = { authenticate, authorize, adminOnly, managerUp };
