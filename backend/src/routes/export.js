const express = require('express');
const XLSX = require('xlsx');
const { authenticate } = require('../middleware/auth');
const { query } = require('../utils/db');
const fieldSchemaService = require('../services/fieldSchemaService');

const router = express.Router();
router.use(authenticate);

async function getDeliverables(projectId, filters = {}) {
  const { status, assigned_to } = filters;
  let conditions = ['d.project_id = $1', 'd.is_active = true'];
  let params = [projectId];
  let pIdx = 2;

  if (status) { conditions.push(`d.status = $${pIdx++}`); params.push(status); }
  if (assigned_to) { conditions.push(`d.assigned_to = $${pIdx++}`); params.push(assigned_to); }

  const { rows } = await query(
    `SELECT d.*, u.full_name AS assigned_to_name, c.full_name AS created_by_name
     FROM deliverables d
     LEFT JOIN users u ON d.assigned_to = u.id
     LEFT JOIN users c ON d.created_by = c.id
     WHERE ${conditions.join(' AND ')}
     ORDER BY d.code ASC`,
    params
  );
  return rows;
}

// ─── GET /api/export/:projectId/excel ─────────────────────────────────────────
router.get('/:projectId/excel', async (req, res, next) => {
  try {
    const schemas = await fieldSchemaService.getByProject(req.params.projectId);
    const deliverables = await getDeliverables(req.params.projectId, req.query);

    const { rows: proj } = await query('SELECT name FROM projects WHERE id = $1', [req.params.projectId]);
    const projectName = proj[0]?.name || 'Proyecto';

    // Build headers
    const staticHeaders = ['Código', 'Nombre', 'Estado', 'Responsable', 'Fecha Planificada', 'Fecha Real', 'Versión', 'Creado Por', 'Fecha Creación'];
    const dynamicHeaders = schemas.map(s => s.name);
    const allHeaders = [...dynamicHeaders, ...staticHeaders];

    const STATUS_LABELS = {
      pending: 'Pendiente', in_progress: 'En Progreso',
      for_review: 'En Revisión', approved: 'Aprobado',
      rejected: 'Rechazado', issued: 'Emitido',
    };

    const rows = deliverables.map(d => {
      const row = [];
      for (const schema of schemas) {
        row.push(d.field_values?.[schema.key] ?? '');
      }
      row.push(
        d.code,
        d.name,
        STATUS_LABELS[d.status] || d.status,
        d.assigned_to_name || '',
        d.planned_date ? new Date(d.planned_date).toLocaleDateString('es-PE') : '',
        d.actual_date ? new Date(d.actual_date).toLocaleDateString('es-PE') : '',
        d.version,
        d.created_by_name || '',
        new Date(d.created_at).toLocaleDateString('es-PE'),
      );
      return row;
    });

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([allHeaders, ...rows]);
    ws['!cols'] = allHeaders.map(() => ({ wch: 18 }));
    XLSX.utils.book_append_sheet(wb, ws, 'Entregables');

    // Summary sheet
    const statusCount = {};
    for (const d of deliverables) statusCount[d.status] = (statusCount[d.status] || 0) + 1;
    const summaryData = [
      ['RESUMEN MIDP - ' + projectName],
      ['Fecha de exportación', new Date().toLocaleString('es-PE')],
      ['Total de entregables', deliverables.length],
      [''],
      ['Estado', 'Cantidad'],
      ...Object.entries(statusCount).map(([k, v]) => [STATUS_LABELS[k] || k, v]),
    ];
    const wsSummary = XLSX.utils.aoa_to_sheet(summaryData);
    wsSummary['!cols'] = [{ wch: 30 }, { wch: 20 }];
    XLSX.utils.book_append_sheet(wb, wsSummary, 'Resumen');

    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="MIDP_${Date.now()}.xlsx"`);
    res.send(buffer);
  } catch (err) { next(err); }
});

// ─── GET /api/export/:projectId/json ──────────────────────────────────────────
router.get('/:projectId/json', async (req, res, next) => {
  try {
    const deliverables = await getDeliverables(req.params.projectId, req.query);
    const schemas = await fieldSchemaService.getByProject(req.params.projectId);
    res.setHeader('Content-Disposition', `attachment; filename="MIDP_${Date.now()}.json"`);
    res.json({ exported_at: new Date().toISOString(), schemas, deliverables });
  } catch (err) { next(err); }
});

// ─── GET /api/export/:projectId/csv ───────────────────────────────────────────
router.get('/:projectId/csv', async (req, res, next) => {
  try {
    const schemas = await fieldSchemaService.getByProject(req.params.projectId);
    const deliverables = await getDeliverables(req.params.projectId, req.query);

    const escape = v => `"${String(v ?? '').replace(/"/g, '""')}"`;

    const headers = [
      ...schemas.map(s => escape(s.name)),
      'Código', 'Nombre', 'Estado', 'Responsable', 'Fecha Planificada', 'Versión',
    ].join(',');

    const rows = deliverables.map(d => [
      ...schemas.map(s => escape(d.field_values?.[s.key] ?? '')),
      escape(d.code), escape(d.name), escape(d.status),
      escape(d.assigned_to_name), escape(d.planned_date), d.version,
    ].join(','));

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="MIDP_${Date.now()}.csv"`);
    res.send('\uFEFF' + [headers, ...rows].join('\n')); // BOM for Excel compatibility
  } catch (err) { next(err); }
});

module.exports = router;
