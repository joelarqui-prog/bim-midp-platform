// ============================================================
// users.js - User management (Admin only for CRUD)
// ============================================================
const express = require('express');
const bcrypt = require('bcrypt');
const { body, validationResult } = require('express-validator');
const { authenticate, adminOnly } = require('../middleware/auth');
const { query } = require('../utils/db');

const router = express.Router();
router.use(authenticate);

router.get('/', async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT id, email, full_name, role, phone, specialty, company, is_active, last_login_at, created_at
       FROM users ORDER BY full_name ASC`
    );
    res.json(rows);
  } catch (err) { next(err); }
});

router.post('/', adminOnly, [
  body('email').isEmail().normalizeEmail(),
  body('password').isLength({ min: 8 }).matches(/^(?=.*[A-Z])(?=.*[0-9])/),
  body('full_name').notEmpty().trim(),
  body('role').isIn(['admin', 'bim_manager', 'specialist']),
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: 'Datos inválidos.', details: errors.array() });
    }
    const { email, password, full_name, role, phone, specialty, company } = req.body;
    const hash = await bcrypt.hash(password, 12);
    const { rows } = await query(
      `INSERT INTO users (email, password_hash, full_name, role, phone, specialty, company, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id, email, full_name, role, specialty, company`,
      [email, hash, full_name, role, phone, specialty, company, req.user.id]
    );
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
});

router.put('/:id', adminOnly, async (req, res, next) => {
  try {
    const { full_name, role, phone, specialty, company, is_active } = req.body;
    const { rows } = await query(
      `UPDATE users SET
         full_name = COALESCE($1, full_name),
         role = COALESCE($2, role),
         phone = COALESCE($3, phone),
         specialty = COALESCE($4, specialty),
         company = COALESCE($5, company),
         is_active = COALESCE($6, is_active)
       WHERE id = $7
       RETURNING id, email, full_name, role, phone, specialty, company, is_active`,
      [full_name, role, phone, specialty, company, is_active, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Usuario no encontrado.' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

router.delete('/:id', adminOnly, async (req, res, next) => {
  try {
    if (req.params.id === req.user.id) {
      return res.status(400).json({ error: 'No puede eliminar su propia cuenta.' });
    }
    await query('UPDATE users SET is_active = false WHERE id = $1', [req.params.id]);
    res.json({ deleted: true });
  } catch (err) { next(err); }
});

module.exports = router;
