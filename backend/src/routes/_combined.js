const express = require('express');
const { authenticate } = require('../middleware/auth');
const { query } = require('../utils/db');

// ─── DASHBOARD ────────────────────────────────────────────────────────────────
const dashboardRouter = express.Router();
dashboardRouter.use(authenticate);

dashboardRouter.get('/:projectId', async (req, res, next) => {
  try {
    const pid = req.params.projectId;

    const [statusDist, recentActivity, progressData, userLoad] = await Promise.all([
      // Status distribution
      query(
        `SELECT status, COUNT(*) as count
         FROM deliverables WHERE project_id = $1 AND is_active = true
         GROUP BY status`, [pid]
      ),
      // Recent changes
      query(
        `SELECT al.*, u.full_name as user_name
         FROM audit_logs al LEFT JOIN users u ON al.user_id = u.id
         WHERE al.project_id = $1
         ORDER BY al.created_at DESC LIMIT 10`, [pid]
      ),
      // Progress per discipline
      query(
        `SELECT
           d.field_values->>'discipline' as discipline,
           COUNT(*) as total,
           COUNT(*) FILTER (WHERE status = 'approved' OR status = 'issued') as completed
         FROM deliverables d
         WHERE project_id = $1 AND is_active = true
         GROUP BY discipline ORDER BY discipline`, [pid]
      ),
      // Deliverables per user
      query(
        `SELECT u.full_name, u.specialty, COUNT(*) as count
         FROM deliverables d JOIN users u ON d.assigned_to = u.id
         WHERE d.project_id = $1 AND d.is_active = true
         GROUP BY u.id, u.full_name, u.specialty
         ORDER BY count DESC LIMIT 10`, [pid]
      ),
    ]);

    // Overall progress
    const total = statusDist.rows.reduce((s, r) => s + parseInt(r.count), 0);
    const completed = statusDist.rows
      .filter(r => ['approved', 'issued'].includes(r.status))
      .reduce((s, r) => s + parseInt(r.count), 0);

    res.json({
      summary: {
        total_deliverables: total,
        completed,
        completion_pct: total > 0 ? Math.round((completed / total) * 100) : 0,
      },
      status_distribution: statusDist.rows,
      recent_activity: recentActivity.rows,
      discipline_progress: progressData.rows,
      user_load: userLoad.rows,
    });
  } catch (err) { next(err); }
});

// ─── PRODUCTION ───────────────────────────────────────────────────────────────
const productionRouter = express.Router();
productionRouter.use(authenticate);

productionRouter.get('/:deliverableId', async (req, res, next) => {
  try {
    const { rows } = await query(
      'SELECT * FROM production_units WHERE deliverable_id = $1 ORDER BY recorded_at DESC',
      [req.params.deliverableId]
    );
    res.json(rows);
  } catch (err) { next(err); }
});

productionRouter.post('/:deliverableId', async (req, res, next) => {
  try {
    const { unit_type, planned_qty, consumed_qty, unit_label, notes, recorded_at } = req.body;
    const { rows } = await query(
      `INSERT INTO production_units
         (deliverable_id, unit_type, planned_qty, consumed_qty, unit_label, notes, recorded_by, recorded_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [req.params.deliverableId, unit_type, planned_qty, consumed_qty || 0,
       unit_label || 'und', notes, req.user.id, recorded_at || new Date()]
    );
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
});

productionRouter.put('/:id', async (req, res, next) => {
  try {
    const { planned_qty, consumed_qty, notes } = req.body;
    const { rows } = await query(
      `UPDATE production_units SET
         planned_qty = COALESCE($1, planned_qty),
         consumed_qty = COALESCE($2, consumed_qty),
         notes = COALESCE($3, notes)
       WHERE id = $4 RETURNING *`,
      [planned_qty, consumed_qty, notes, req.params.id]
    );
    res.json(rows[0]);
  } catch (err) { next(err); }
});

// ─── AUDIT ────────────────────────────────────────────────────────────────────
const auditRouter = express.Router();
auditRouter.use(authenticate);
const auditService = require('../services/auditService');

auditRouter.get('/:projectId', async (req, res, next) => {
  try {
    const logs = await auditService.getByProject(req.params.projectId, req.query);
    res.json(logs);
  } catch (err) { next(err); }
});

// ─── PROJECTS ─────────────────────────────────────────────────────────────────
const projectsRouter = express.Router();
projectsRouter.use(authenticate);
const { adminOnly } = require('../middleware/auth');

projectsRouter.get('/', async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT p.*,
         COUNT(d.id) FILTER (WHERE d.is_active = true) AS deliverable_count
       FROM projects p
       LEFT JOIN deliverables d ON d.project_id = p.id
       WHERE p.is_active = true
       GROUP BY p.id ORDER BY p.created_at DESC`
    );
    res.json(rows);
  } catch (err) { next(err); }
});

projectsRouter.get('/:id', async (req, res, next) => {
  try {
    const { rows } = await query('SELECT * FROM projects WHERE id = $1', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Proyecto no encontrado.' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

projectsRouter.post('/', adminOnly, async (req, res, next) => {
  try {
    const { code, name, description, client, location, start_date, end_date } = req.body;
    const { rows } = await query(
      `INSERT INTO projects (code, name, description, client, location, start_date, end_date)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [code, name, description, client, location, start_date, end_date]
    );
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
});

projectsRouter.put('/:id', adminOnly, async (req, res, next) => {
  try {
    const { name, description, client, location, start_date, end_date, is_active } = req.body;
    const { rows } = await query(
      `UPDATE projects SET
         name = COALESCE($1, name), description = COALESCE($2, description),
         client = COALESCE($3, client), location = COALESCE($4, location),
         start_date = COALESCE($5, start_date), end_date = COALESCE($6, end_date),
         is_active = COALESCE($7, is_active)
       WHERE id = $8 RETURNING *`,
      [name, description, client, location, start_date, end_date, is_active, req.params.id]
    );
    res.json(rows[0]);
  } catch (err) { next(err); }
});

module.exports = {
  dashboardRouter,
  productionRouter,
  auditRouter,
  projectsRouter,
};
