const express = require('express');
const { body, query: qParam, validationResult } = require('express-validator');
const { authenticate, managerUp } = require('../middleware/auth');
const { query, transaction } = require('../utils/db');
const fieldSchemaService = require('../services/fieldSchemaService');
const auditService = require('../services/auditService');

const router = express.Router();
router.use(authenticate);

// ─── GET /api/deliverables/:projectId ────────────────────────────────────────
router.get('/:projectId', [
  qParam('status').optional().isIn(['pending','in_progress','for_review','approved','rejected','issued']),
  qParam('assigned_to').optional().isUUID(),
  qParam('page').optional().isInt({ min: 1 }),
  qParam('limit').optional().isInt({ min: 1, max: 200 }),
  qParam('search').optional().trim(),
], async (req, res, next) => {
  try {
    const { status, assigned_to, search, page = 1, limit = 50 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    let conditions = ['d.project_id = $1', 'd.is_active = true'];
    let params = [req.params.projectId];
    let pIdx = 2;

    if (status) { conditions.push(`d.status = $${pIdx++}`); params.push(status); }
    if (assigned_to) { conditions.push(`d.assigned_to = $${pIdx++}`); params.push(assigned_to); }
    if (search) {
      conditions.push(`(d.code ILIKE $${pIdx} OR d.name ILIKE $${pIdx})`);
      params.push(`%${search}%`); pIdx++;
    }

    const where = conditions.join(' AND ');

    const countRes = await query(
      `SELECT COUNT(*) FROM deliverables d WHERE ${where}`, params
    );

    const { rows } = await query(
      `SELECT d.*,
              u.full_name AS assigned_to_name,
              u.specialty AS assigned_to_specialty,
              c.full_name AS created_by_name,
              ROUND(
                COALESCE(
                  (SELECT SUM(consumed_qty) / NULLIF(SUM(planned_qty),0) * 100
                   FROM production_units WHERE deliverable_id = d.id), 0
                ), 1
              ) AS progress_pct
       FROM deliverables d
       LEFT JOIN users u ON d.assigned_to = u.id
       LEFT JOIN users c ON d.created_by = c.id
       WHERE ${where}
       ORDER BY d.created_at DESC
       LIMIT $${pIdx} OFFSET $${pIdx+1}`,
      [...params, parseInt(limit), offset]
    );

    res.json({
      data: rows,
      pagination: {
        total: parseInt(countRes.rows[0].count),
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(parseInt(countRes.rows[0].count) / parseInt(limit)),
      }
    });
  } catch (err) { next(err); }
});

// ─── GET /api/deliverables/:projectId/:id ─────────────────────────────────────
router.get('/:projectId/:id', async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT d.*,
              u.full_name AS assigned_to_name,
              c.full_name AS created_by_name,
              upd.full_name AS updated_by_name
       FROM deliverables d
       LEFT JOIN users u ON d.assigned_to = u.id
       LEFT JOIN users c ON d.created_by = c.id
       LEFT JOIN users upd ON d.updated_by = upd.id
       WHERE d.id = $1 AND d.project_id = $2 AND d.is_active = true`,
      [req.params.id, req.params.projectId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Entregable no encontrado.' });

    // Load production units
    const { rows: prodRows } = await query(
      'SELECT * FROM production_units WHERE deliverable_id = $1 ORDER BY recorded_at DESC',
      [req.params.id]
    );

    // Load versions
    const { rows: versionRows } = await query(
      `SELECT dv.*, u.full_name AS changed_by_name
       FROM deliverable_versions dv
       JOIN users u ON dv.changed_by = u.id
       WHERE dv.deliverable_id = $1 ORDER BY dv.version DESC`,
      [req.params.id]
    );

    res.json({ ...rows[0], production_units: prodRows, versions: versionRows });
  } catch (err) { next(err); }
});

// ─── POST /api/deliverables/:projectId ────────────────────────────────────────
router.post('/:projectId', managerUp, [
  body('name').notEmpty().trim().isLength({ max: 500 }),
  body('field_values').isObject(),
  body('planned_date').optional().isISO8601(),
  body('assigned_to').optional().isUUID(),
  body('status').optional().isIn(['pending','in_progress','for_review','approved','rejected','issued']),
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: 'Datos inválidos.', details: errors.array() });
    }

    const { name, field_values, description, planned_date, assigned_to, status = 'pending' } = req.body;
    const projectId = req.params.projectId;

    // Load schemas and build code
    const schemas = await fieldSchemaService.getByProject(projectId);
    const validationErrors = fieldSchemaService.validateFieldValues(schemas, field_values);
    if (validationErrors.length) {
      return res.status(400).json({ error: 'Errores de validación de campos.', details: validationErrors });
    }

    const code = fieldSchemaService.buildCode(schemas, field_values);

    // Check duplicate code
    const dupCheck = await query(
      'SELECT id FROM deliverables WHERE project_id = $1 AND code = $2 AND is_active = true',
      [projectId, code]
    );
    if (dupCheck.rows.length) {
      return res.status(409).json({
        error: `Código duplicado: "${code}" ya existe en este proyecto.`,
        duplicate_code: code,
      });
    }

    const result = await transaction(async (client) => {
      const { rows } = await client.query(
        `INSERT INTO deliverables
           (project_id, code, name, description, status, assigned_to,
            planned_date, field_values, created_by, updated_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$9)
         RETURNING *`,
        [projectId, code, name, description, status, assigned_to || null,
         planned_date || null, JSON.stringify(field_values), req.user.id]
      );

      // Create initial version snapshot
      await client.query(
        `INSERT INTO deliverable_versions (deliverable_id, version, snapshot, changed_by, change_note)
         VALUES ($1, 1, $2, $3, 'Creación inicial')`,
        [rows[0].id, JSON.stringify(rows[0]), req.user.id]
      );

      return rows[0];
    });

    await auditService.log({
      userId: req.user.id, action: 'create',
      entityType: 'deliverable', entityId: result.id,
      projectId, newValues: result,
    });

    res.status(201).json(result);
  } catch (err) { next(err); }
});

// ─── PUT /api/deliverables/:projectId/:id ────────────────────────────────────
router.put('/:projectId/:id', managerUp, async (req, res, next) => {
  try {
    const { name, field_values, description, planned_date, actual_date,
            assigned_to, status, change_note } = req.body;
    const { projectId, id } = req.params;

    const { rows: existing } = await query(
      'SELECT * FROM deliverables WHERE id = $1 AND project_id = $2 AND is_active = true',
      [id, projectId]
    );
    if (!existing.length) return res.status(404).json({ error: 'Entregable no encontrado.' });

    const prev = existing[0];

    // If field_values changed, regenerate code
    let newCode = prev.code;
    let newFieldValues = prev.field_values;

    if (field_values) {
      const schemas = await fieldSchemaService.getByProject(projectId);
      const merged = { ...prev.field_values, ...field_values };
      const validationErrors = fieldSchemaService.validateFieldValues(schemas, merged);
      if (validationErrors.length) {
        return res.status(400).json({ error: 'Errores de validación.', details: validationErrors });
      }
      newCode = fieldSchemaService.buildCode(schemas, merged);
      newFieldValues = merged;

      // Check duplicate (excluding current)
      if (newCode !== prev.code) {
        const dupCheck = await query(
          'SELECT id FROM deliverables WHERE project_id = $1 AND code = $2 AND id != $3 AND is_active = true',
          [projectId, newCode, id]
        );
        if (dupCheck.rows.length) {
          return res.status(409).json({
            error: `Código duplicado: "${newCode}" ya existe.`,
            duplicate_code: newCode,
          });
        }
      }
    }

    const newVersion = prev.version + 1;

    const updated = await transaction(async (client) => {
      const { rows } = await client.query(
        `UPDATE deliverables SET
           name = COALESCE($1, name),
           description = COALESCE($2, description),
           status = COALESCE($3, status),
           assigned_to = COALESCE($4, assigned_to),
           planned_date = COALESCE($5, planned_date),
           actual_date = COALESCE($6, actual_date),
           code = $7,
           field_values = $8,
           version = $9,
           updated_by = $10
         WHERE id = $11 RETURNING *`,
        [name, description, status, assigned_to, planned_date, actual_date,
         newCode, JSON.stringify(newFieldValues), newVersion, req.user.id, id]
      );

      await client.query(
        `INSERT INTO deliverable_versions (deliverable_id, version, snapshot, changed_by, change_note)
         VALUES ($1,$2,$3,$4,$5)`,
        [id, newVersion, JSON.stringify(rows[0]), req.user.id, change_note || 'Actualización']
      );

      return rows[0];
    });

    await auditService.log({
      userId: req.user.id, action: 'update',
      entityType: 'deliverable', entityId: id,
      projectId, oldValues: prev, newValues: updated,
    });

    res.json(updated);
  } catch (err) { next(err); }
});

// ─── DELETE /api/deliverables/:projectId/:id ──────────────────────────────────
router.delete('/:projectId/:id', managerUp, async (req, res, next) => {
  try {
    const { rows } = await query(
      'UPDATE deliverables SET is_active = false, updated_by = $1 WHERE id = $2 AND project_id = $3 RETURNING id',
      [req.user.id, req.params.id, req.params.projectId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Entregable no encontrado.' });

    await auditService.log({
      userId: req.user.id, action: 'delete',
      entityType: 'deliverable', entityId: req.params.id,
      projectId: req.params.projectId,
    });

    res.json({ deleted: true, id: req.params.id });
  } catch (err) { next(err); }
});

// ─── POST /api/deliverables/:projectId/validate-code ─────────────────────────
// Check if a generated code would be a duplicate
router.post('/:projectId/validate-code', authenticate, async (req, res, next) => {
  try {
    const { field_values, exclude_id } = req.body;
    const schemas = await fieldSchemaService.getByProject(req.params.projectId);
    const code = fieldSchemaService.buildCode(schemas, field_values);

    const params = [req.params.projectId, code];
    let sql = 'SELECT id FROM deliverables WHERE project_id = $1 AND code = $2 AND is_active = true';
    if (exclude_id) { sql += ' AND id != $3'; params.push(exclude_id); }

    const { rows } = await query(sql, params);

    res.json({
      code,
      is_duplicate: rows.length > 0,
      message: rows.length > 0
        ? `Código "${code}" ya existe en el proyecto.`
        : `Código "${code}" disponible.`,
    });
  } catch (err) { next(err); }
});

module.exports = router;
