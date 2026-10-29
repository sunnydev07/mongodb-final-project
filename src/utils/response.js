function ok(res, data, status = 200, meta) {
  const body = { success: true, data };
  if (meta) body.meta = meta;
  return res.status(status).json(body);
}

function created(res, data, meta) {
  return ok(res, data, 201, meta);
}

function noContent(res) {
  return res.status(204).send();
}

module.exports = { ok, created, noContent };
