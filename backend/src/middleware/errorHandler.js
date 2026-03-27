const logger = require('../utils/logger');

const errorHandler = (err, req, res, _next) => {
  logger.error({
    message: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method,
    user: req.user?.id,
  });

  // PostgreSQL unique constraint
  if (err.code === '23505') {
    const match = err.detail?.match(/\((.+)\)=\((.+)\)/);
    return res.status(409).json({
      error: 'Valor duplicado detectado.',
      field: match?.[1],
      value: match?.[2],
    });
  }

  // PostgreSQL FK violation
  if (err.code === '23503') {
    return res.status(409).json({ error: 'Referencia inválida a un recurso relacionado.' });
  }

  // Validation errors from express-validator
  if (err.type === 'validation') {
    return res.status(400).json({ error: 'Datos de entrada inválidos.', details: err.errors });
  }

  // Multer file size
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ error: 'El archivo supera el tamaño máximo permitido (10MB).' });
  }

  const status = err.status || err.statusCode || 500;
  res.status(status).json({
    error: process.env.NODE_ENV === 'production'
      ? 'Error interno del servidor.'
      : err.message,
    ...(process.env.NODE_ENV !== 'production' && { stack: err.stack }),
  });
};

module.exports = errorHandler;
