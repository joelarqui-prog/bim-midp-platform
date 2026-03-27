const { query } = require('../utils/db');
const logger = require('../utils/logger');

class AuditService {
  async log({ userId, action, entityType, entityId, projectId, oldValues, newValues, notes, req }) {
    try {
      await query(
        `INSERT INTO audit_logs
           (user_id, action, entity_type, entity_id, project_id, old_values, new_values, notes, ip_address, user_agent)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [
          userId, action, entityType, entityId || null, projectId || null,
          oldValues ? JSON.stringify(oldValues) : null,
          newValues ? JSON.stringify(newValues) : null,
          notes || null,
          req?.ip || null,
          req?.headers?.['user-agent'] || null,
        ]
      );
    } catch (err) {
      logger.error('Failed to write audit log:', err.message);
    }
  }

  async getByProject(projectId, { page = 1, limit = 50, entityType, action } = {}) {
    const offset = (parseInt(page) - 1) * parseInt(limit);
    let conditions = ['al.project_id = $1'];
    let params = [projectId];
    let pIdx = 2;

    if (entityType) { conditions.push(`al.entity_type = $${pIdx++}`); params.push(entityType); }
    if (action) { conditions.push(`al.action = $${pIdx++}`); params.push(action); }

    const where = conditions.join(' AND ');
    const { rows } = await query(
      `SELECT al.*, u.full_name AS user_name, u.role AS user_role
       FROM audit_logs al
       LEFT JOIN users u ON al.user_id = u.id
       WHERE ${where}
       ORDER BY al.created_at DESC
       LIMIT $${pIdx} OFFSET $${pIdx+1}`,
      [...params, parseInt(limit), offset]
    );
    return rows;
  }
}

module.exports = new AuditService();
