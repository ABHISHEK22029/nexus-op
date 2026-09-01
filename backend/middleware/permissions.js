/* ══════════════════════════════════════════════════════════
   permissions middleware — turns the roles table into route guards.

   Usage:
     app.get ('/vendors',     allow('vendors', 'read'),   ...)
     app.post('/vendors',     allow('vendors', 'write'),  ...)
     app.delete('/vendors/:id', allow('vendors','delete'), ...)

   or, for a whole resource in one line:
     app.use('/vendors', guard('vendors'))
   which infers the action from the HTTP verb.
   ══════════════════════════════════════════════════════════ */
const { can, READ, WRITE, DELETE } = require('../shared/roles');

const ACTION_FOR_METHOD = {
  GET: READ, HEAD: READ, OPTIONS: READ,
  POST: WRITE, PUT: WRITE, PATCH: WRITE,
  DELETE: DELETE,
};

function deny(res, resource, action) {
  return res.status(403).json({
    error: 'Not permitted',
    // Say what was needed. A 403 that doesn't tell you what you lacked just
    // generates a support ticket.
    detail: `Your role cannot ${action} ${resource}.`,
    resource, action,
  });
}

/** Explicit resource + action. */
function allow(resource, action = READ) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Not signed in' });
    if (can(req.user.role, resource, action)) return next();
    return deny(res, resource, action);
  };
}

/** Infer the action from the HTTP verb. */
function guard(resource) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Not signed in' });
    const action = ACTION_FOR_METHOD[req.method] || WRITE;
    if (can(req.user.role, resource, action)) return next();
    return deny(res, resource, action);
  };
}

module.exports = { allow, guard, ACTION_FOR_METHOD };
