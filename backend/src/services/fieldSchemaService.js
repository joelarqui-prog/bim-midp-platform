const { query, transaction } = require('../utils/db');

/**
 * FieldSchemaService - Core of the dynamic coding metamodel.
 * Manages the configurable field definitions that build deliverable codes.
 */
class FieldSchemaService {

  /**
   * Get all active schemas for a project, ordered by code_order
   */
  async getByProject(projectId) {
    const { rows } = await query(
      `SELECT * FROM field_schemas
       WHERE project_id = $1 AND is_active = true
       ORDER BY code_order ASC NULLS LAST, name ASC`,
      [projectId]
    );
    return rows;
  }

  /**
   * Create a new field schema
   */
  async create(projectId, data, userId) {
    const {
      name, key, field_type, is_required, is_part_of_code,
      code_order, separator, max_length, allowed_values,
      validation_regex, description
    } = data;

    // Validate key uniqueness within project
    const existing = await query(
      'SELECT id FROM field_schemas WHERE project_id = $1 AND key = $2',
      [projectId, key]
    );
    if (existing.rows.length) {
      throw Object.assign(new Error(`Ya existe un campo con clave "${key}".`), { status: 409 });
    }

    const { rows } = await query(
      `INSERT INTO field_schemas
        (project_id, name, key, field_type, is_required, is_part_of_code,
         code_order, separator, max_length, allowed_values, validation_regex,
         description, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
       RETURNING *`,
      [
        projectId, name, key, field_type, is_required ?? true,
        is_part_of_code ?? true, code_order, separator ?? '-',
        max_length ?? 10,
        allowed_values ? JSON.stringify(allowed_values) : null,
        validation_regex, description, userId
      ]
    );
    return rows[0];
  }

  /**
   * Update a field schema
   */
  async update(schemaId, projectId, data, userId) {
    const {
      name, field_type, is_required, is_part_of_code,
      code_order, separator, max_length, allowed_values,
      validation_regex, description
    } = data;

    const { rows } = await query(
      `UPDATE field_schemas SET
        name = COALESCE($1, name),
        field_type = COALESCE($2, field_type),
        is_required = COALESCE($3, is_required),
        is_part_of_code = COALESCE($4, is_part_of_code),
        code_order = COALESCE($5, code_order),
        separator = COALESCE($6, separator),
        max_length = COALESCE($7, max_length),
        allowed_values = COALESCE($8::jsonb, allowed_values),
        validation_regex = COALESCE($9, validation_regex),
        description = COALESCE($10, description)
       WHERE id = $11 AND project_id = $12
       RETURNING *`,
      [
        name, field_type, is_required, is_part_of_code,
        code_order, separator, max_length,
        allowed_values ? JSON.stringify(allowed_values) : null,
        validation_regex, description,
        schemaId, projectId
      ]
    );

    if (!rows.length) throw Object.assign(new Error('Campo no encontrado.'), { status: 404 });
    return rows[0];
  }

  /**
   * Soft delete a field schema
   * Checks that no deliverables use this field's code segment
   */
  async delete(schemaId, projectId) {
    const schema = await query(
      'SELECT key FROM field_schemas WHERE id = $1 AND project_id = $2',
      [schemaId, projectId]
    );
    if (!schema.rows.length) throw Object.assign(new Error('Campo no encontrado.'), { status: 404 });

    // Check usage in deliverables
    const used = await query(
      `SELECT COUNT(*) FROM deliverables
       WHERE project_id = $1 AND field_values ? $2`,
      [projectId, schema.rows[0].key]
    );
    if (parseInt(used.rows[0].count) > 0) {
      throw Object.assign(
        new Error(`Este campo está en uso por ${used.rows[0].count} entregable(s). No puede eliminarse.`),
        { status: 409 }
      );
    }

    await query(
      'UPDATE field_schemas SET is_active = false WHERE id = $1',
      [schemaId]
    );
    return { deleted: true };
  }

  /**
   * Generate a code string from field values and schema definitions
   * @param {Object[]} schemas - sorted field schemas with is_part_of_code = true
   * @param {Object} fieldValues - { discipline: 'ARQ', phase: 'PD', ... }
   * @returns {string} - generated code, e.g. "HRDTRU-ARQ-PD-Z01-P2-PL-0001"
   */
  buildCode(schemas, fieldValues) {
    const codeParts = schemas
      .filter(s => s.is_part_of_code && s.is_active)
      .sort((a, b) => (a.code_order ?? 99) - (b.code_order ?? 99));

    let code = '';
    for (let i = 0; i < codeParts.length; i++) {
      const schema = codeParts[i];
      const value = fieldValues[schema.key];
      if (value === undefined || value === null || value === '') {
        if (schema.is_required) {
          throw Object.assign(
            new Error(`El campo "${schema.name}" es requerido para generar el código.`),
            { status: 400 }
          );
        }
        continue;
      }

      // Validate against allowed_values if dropdown
      if (schema.field_type === 'dropdown' && schema.allowed_values) {
        const allowed = schema.allowed_values.map(v => v.value);
        if (!allowed.includes(value)) {
          throw Object.assign(
            new Error(`Valor "${value}" no permitido para "${schema.name}". Valores válidos: ${allowed.join(', ')}`),
            { status: 400 }
          );
        }
      }

      // Apply max_length
      const segment = String(value).substring(0, schema.max_length);
      code += segment;

      // Add separator (not after last part)
      if (i < codeParts.length - 1 && schema.separator) {
        code += schema.separator;
      }
    }

    return code;
  }

  /**
   * Validate all field values against schemas
   * @returns {string[]} - list of validation errors
   */
  validateFieldValues(schemas, fieldValues) {
    const errors = [];

    for (const schema of schemas) {
      if (!schema.is_active) continue;
      const value = fieldValues[schema.key];

      if (schema.is_required && (value === undefined || value === null || value === '')) {
        errors.push(`"${schema.name}" es obligatorio.`);
        continue;
      }

      if (!value) continue; // optional + empty = ok

      if (schema.field_type === 'dropdown' && schema.allowed_values?.length) {
        const allowed = schema.allowed_values.map(v => v.value);
        if (!allowed.includes(value)) {
          errors.push(`"${schema.name}": valor "${value}" no permitido.`);
        }
      }

      if (schema.field_type === 'number' && isNaN(Number(value))) {
        errors.push(`"${schema.name}": debe ser un número.`);
      }

      if (schema.field_type === 'date' && isNaN(Date.parse(value))) {
        errors.push(`"${schema.name}": formato de fecha inválido.`);
      }

      if (schema.max_length && String(value).length > schema.max_length) {
        errors.push(`"${schema.name}": máximo ${schema.max_length} caracteres.`);
      }

      if (schema.validation_regex) {
        const regex = new RegExp(schema.validation_regex);
        if (!regex.test(value)) {
          errors.push(`"${schema.name}": formato inválido.`);
        }
      }
    }

    return errors;
  }
}

module.exports = new FieldSchemaService();
