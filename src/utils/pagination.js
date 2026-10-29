function parsePagination(query, defaults = { limit: 20, maxLimit: 100 }) {
  const page = Math.max(1, Number.parseInt(query.page, 10) || 1);
  const requestedLimit = Number.parseInt(query.limit, 10) || defaults.limit;
  const limit = Math.min(defaults.maxLimit, Math.max(1, requestedLimit));
  const skip = (page - 1) * limit;
  return { page, limit, skip };
}

function buildMeta(total, page, limit) {
  const pages = Math.ceil(total / limit) || 1;
  return {
    total,
    page,
    limit,
    pages,
    hasPrev: page > 1,
    hasNext: page < pages,
  };
}

module.exports = { parsePagination, buildMeta };
