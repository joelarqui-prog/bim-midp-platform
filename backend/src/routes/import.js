const express = require('express');
const multer = require('multer');
const XLSX = require('xlsx');
const path = require('path');
const { authenticate, managerUp } = require('../middleware/auth');
const { query, transaction } = require('../utils/db');
const fieldSchemaService = require('../services/fieldSchemaService');
const auditService = require('../services/auditService');

const router = express.Router();
router.use(authenticate);

// Configure multer for Excel files
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (['.xlsx', '.xls', '.csv'].includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Solo se permiten archivos Excel (.xlsx, .xls) o CSV.'));
    }
  },
});

// ─── GET /api/import/:projectId/template ─────────────────────────────────────
// Generate an Excel template based on current field schemas
router.get('/:projectId/template', async (req, res, next) => {
  try {
    const schemas = await fieldSchemaService.getByProject(req.params.projectId);

    // Build header row
    const headers = [
      ...schemas.map(s => ({
        key: s.key,
        label: `${s.name}${s.is_required ? ' *' : ''}`,
        allowed: s.allowed_values
          ? s.allowed_values.map(v => v.value).join(' | ')
          : s.field_type,
      })),
      { key: 'name', label: 'Nombre del Entregable *', allowed: 'Texto libre' },
      { key: 'description', label: 'Descripción', allowed: 'Texto libre' },
      { key: 'status', label: 'Estado', allowed: 'pending | in_progress | for_review | approved | rejected | issued' },
      { key: 'planned_date', label: 'Fecha Planificada', allowed: 'YYYY-MM-DD' },
    ];

    const wb = XLSX.utils.book_new();

    // Main sheet
    const mainData = [
      headers.map(h => h.label),   // Row 1: labels
      headers.map(h => h.allowed), // Row 2: allowed values (informational)
      headers.map(() => ''),        // Row 3: empty example row
    ];

    // Example row
    const exampleRow = schemas.map(s => {
      if (s.allowed_values?.length) return s.allowed_values[0].value;
      if (s.field_type === 'number') return '0001';
      if (s.field_type === 'date') return '2025-06-01';
      return `${s.name}_ejemplo`;
    });
    exampleRow.push('Plano de Arquitectura - Planta General', 'Descripción ejemplo', 'pending', '2025-06-30');
    mainData[2] = exampleRow;

    const ws = XLSX.utils.aoa_to_sheet(mainData);

    // Column widths
    ws['!cols'] = headers.map(() => ({ wch: 20 }));

    XLSX.utils.book_append_sheet(wb, ws, 'Entregables');

    // Reference sheet with allowed values
    const refData = [['Campo', 'Clave', 'Tipo', 'Valores Permitidos', 'Requerido']];
    for (const s of schemas) {
      refData.push([
        s.name, s.key, s.field_type,
        s.allowed_values?.map(v => `${v.value} = ${v.label}`).join('\n') || '-',
        s.is_required ? 'Sí' : 'No',
      ]);
    }
    const wsRef = XLSX.utils.aoa_to_sheet(refData);
    wsRef['!cols'] = [{ wch: 20 }, { wch: 15 }, { wch: 12 }, { wch: 50 }, { wch: 10 }];
    XLSX.utils.book_append_sheet(wb, wsRef, 'Referencia de Campos');

    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="plantilla_entregables.xlsx"');
    res.send(buffer);
  } catch (err) { next(err); }
});

// ─── POST /api/import/:projectId ─────────────────────────────────────────────
router.post('/:projectId', managerUp, upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Archivo requerido.' });

    const projectId = req.params.projectId;
    const schemas = await fieldSchemaService.getByProject(projectId);

    // Parse Excel
    const wb = XLSX.read(req.file.buffer, { type: 'buffer', cellDates: true });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rawData = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

    if (rawData.length < 2) {
      return res.status(400).json({ error: 'El archivo está vacío o sin datos.' });
    }

    // Map headers (row 0) to field keys
    const headerRow = rawData[0].map(h => String(h).trim());
    const schemaLabelToKey = {};
    for (const s of schemas) {
      // Match by label (with or without *)
      schemaLabelToKey[s.name] = s.key;
      schemaLabelToKey[`${s.name} *`] = s.key;
    }

    const colMap = {}; // colIndex → field key
    for (let i = 0; i < headerRow.length; i++) {
      const h = headerRow[i].replace(' *', '');
      if (schemaLabelToKey[headerRow[i]]) {
        colMap[i] = schemaLabelToKey[headerRow[i]];
      } else if (['Nombre del Entregable', 'Nombre del Entregable *'].includes(headerRow[i])) {
        colMap[i] = '__name';
      } else if (headerRow[i] === 'Descripción') {
        colMap[i] = '__description';
      } else if (headerRow[i] === 'Estado') {
        colMap[i] = '__status';
      } else if (headerRow[i] === 'Fecha Planificada') {
        colMap[i] = '__planned_date';
      }
    }

    // Validate that required schema fields are present
    for (const schema of schemas) {
      if (schema.is_required && !Object.values(colMap).includes(schema.key)) {
        return res.status(400).json({
          error: `Columna requerida no encontrada: "${schema.name}". Descargue la plantilla actualizada.`,
        });
      }
    }

    // Process data rows (skip header row 0 and info row 1)
    const dataRows = rawData.slice(2);
    const results = { success: [], errors: [] };

    for (let rowIdx = 0; rowIdx < dataRows.length; rowIdx++) {
      const row = dataRows[rowIdx];
      const rowNum = rowIdx + 3; // 1-indexed for user

      if (row.every(cell => cell === '' || cell === null)) continue; // skip empty rows

      const field_values = {};
      let name = '', description = '', status = 'pending', planned_date = null;

      for (const [colIdx, fieldKey] of Object.entries(colMap)) {
        const value = String(row[colIdx] ?? '').trim();
        if (fieldKey === '__name') name = value;
        else if (fieldKey === '__description') description = value;
        else if (fieldKey === '__status') status = value || 'pending';
        else if (fieldKey === '__planned_date') planned_date = value || null;
        else field_values[fieldKey] = value;
      }

      // Validate
      const validationErrors = fieldSchemaService.validateFieldValues(schemas, field_values);
      if (!name) validationErrors.push('"Nombre del Entregable" es obligatorio.');

      if (validationErrors.length) {
        results.errors.push({ row: rowNum, errors: validationErrors, data: row });
        continue;
      }

      // Build code and check duplicate
      let code;
      try {
        code = fieldSchemaService.buildCode(schemas, field_values);
      } catch (e) {
        results.errors.push({ row: rowNum, errors: [e.message], data: row });
        continue;
      }

      const dupCheck = await query(
        'SELECT id FROM deliverables WHERE project_id = $1 AND code = $2 AND is_active = true',
        [projectId, code]
      );
      if (dupCheck.rows.length) {
        results.errors.push({
          row: rowNum,
          errors: [`Código duplicado: "${code}" ya existe.`],
          data: row,
        });
        continue;
      }

      results.success.push({ code, name, description, status, planned_date, field_values, rowNum });
    }

    // Create batch record
    const { rows: batchRows } = await query(
      `INSERT INTO import_batches (project_id, filename, total_rows, success_rows, error_rows, status, errors, imported_by)
       VALUES ($1,$2,$3,$4,$5,'processing',$6,$7) RETURNING id`,
      [
        projectId, req.file.originalname, dataRows.length,
        results.success.length, results.errors.length,
        JSON.stringify(results.errors), req.user.id,
      ]
    );

    // Insert valid deliverables in a transaction
    let insertedCount = 0;
    if (results.success.length > 0) {
      await transaction(async (client) => {
        for (const item of results.success) {
          const { rows } = await client.query(
            `INSERT INTO deliverables
               (project_id, code, name, description, status, planned_date, field_values, created_by, updated_by)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$8) RETURNING id`,
            [projectId, item.code, item.name, item.description,
             item.status, item.planned_date, JSON.stringify(item.field_values), req.user.id]
          );
          await client.query(
            `INSERT INTO deliverable_versions (deliverable_id, version, snapshot, changed_by, change_note)
             VALUES ($1, 1, $2, $3, 'Importación masiva')`,
            [rows[0].id, JSON.stringify(rows[0]), req.user.id]
          );
          insertedCount++;
        }
      });
    }

    // Update batch status
    await query(
      `UPDATE import_batches SET status = 'done', completed_at = NOW(),
       success_rows = $1, error_rows = $2 WHERE id = $3`,
      [insertedCount, results.errors.length, batchRows[0].id]
    );

    await auditService.log({
      userId: req.user.id, action: 'import',
      entityType: 'deliverable', entityId: batchRows[0].id,
      projectId,
      newValues: { filename: req.file.originalname, inserted: insertedCount, errors: results.errors.length },
    });

    res.json({
      batch_id: batchRows[0].id,
      total: dataRows.filter(r => !r.every(c => c === '')).length,
      inserted: insertedCount,
      errors: results.errors,
      message: `Importación completada: ${insertedCount} entregables registrados, ${results.errors.length} errores.`,
    });
  } catch (err) { next(err); }
});

module.exports = router;
