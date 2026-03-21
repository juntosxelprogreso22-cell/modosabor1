function logAudit(db, payload) {
  const {
    modulo,
    accion,
    entidad = '',
    entidad_id = '',
    actor_id = null,
    actor_nombre = 'Sistema',
    detalle = {},
  } = payload;

  db.prepare(`
    INSERT INTO auditoria_eventos (modulo, accion, entidad, entidad_id, actor_id, actor_nombre, detalle)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    modulo,
    accion,
    entidad,
    String(entidad_id || ''),
    actor_id,
    actor_nombre,
    JSON.stringify(detalle || {})
  );
}

function actorFromRequest(req, fallbackName = 'Sistema') {
  if (req?.user) {
    return {
      actor_id: req.user.id || null,
      actor_nombre: req.user.nombre || req.user.email || fallbackName,
    };
  }

  return {
    actor_id: null,
    actor_nombre: fallbackName,
  };
}

module.exports = {
  logAudit,
  actorFromRequest,
};
