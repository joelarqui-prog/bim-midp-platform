const express = require('express');
const { body, validationResult } = require('express-validator');
const { authenticate, adminOnly, managerUp } = require('../middleware/auth');
const fieldSchemaService = require('../services/fieldSchemaService');
const { query } = require('../utils/db');

const router = express.Router({ mergeParams: true });

// All schema routes require authentication
router.use(authenticate);

// GET /api/schemas/:projectId - list field schemas for a project
router.get('/:projectId', async (req, res, next) => {
  try {
    const schemas = await fieldSchemaService.getByProject(req.params.projectId);
    res.json(schemas);
  } catch (err) { next(err); }
});

// POST /api/schemas/:projectId - create a field schema (admin only)
router.post('/:projectId', adminOnly, [
  body('name').notEmpty().trim().isLength({ max: 100 }),
  body('key').notEmpty().trim().matches(/^[a-z_][a-z0-9_]*$/)
    .withMessage('La clave debe ser snake_case (letras minúsculas, números y guión bajo).'),
  body('field_type').isIn(['text', 'dropdown', 'number', 'date', 'boolean']),
  body('is_required').optional().isBoolean(),
  body('is_part_of_code').optional().isBoolean(),
  body('code_order').optional().isInt({ min: 1, max: 20 }),
  body('separator').optional().isLength({ max: 5 }),
  body('max_length').optional().isInt({ min: 1, max: 50 }),
  body('allowed_values').optional().isArray(),
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: 'Datos inválidos.', details: errors.array() });
    }
    const schema = await fieldSchemaService.create(
      req.params.projectId, req.body, req.user.id
    );
    res.status(201).json(schema);
  } catch (err) { next(err); }
});

// PUT /api/schemas/:projectId/:schemaId - update
router.put('/:projectId/:schemaId', adminOnly, async (req, res, next) => {
  try {
    const schema = await fieldSchemaService.update(
      req.params.schemaId, req.params.projectId, req.body, req.user.id
    );
    res.json(schema);
  } catch (err) { next(err); }
});

// DELETE /api/schemas/:projectId/:schemaId - soft delete
router.delete('/:projectId/:schemaId', adminOnly, async (req, res, next) => {
  try {
    const result = await fieldSchemaService.delete(
      req.params.schemaId, req.params.projectId
    );
    res.json(result);
  } catch (err) { next(err); }
});

// POST /api/schemas/:projectId/reorder - reorder schemas
router.post('/:projectId/reorder', adminOnly, [
  body('order').isArray().notEmpty(),
  body('order.*.id').isUUID(),
  body('order.*.code_order').isInt({ min: 1 }),
], async (req, res, next) => {
  try {
    const { order } = req.body;
    for (const item of order) {
      await query(
        'UPDATE field_schemas SET code_order = $1 WHERE id = $2 AND project_id = $3',
        [item.code_order, item.id, req.params.projectId]
      );
    }
    const schemas = await fieldSchemaService.getByProject(req.params.projectId);
    res.json(schemas);
  } catch (err) { next(err); }
});

module.exports = router;
