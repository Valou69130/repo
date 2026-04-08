function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function isOptionalString(value) {
  return value === undefined || value === null || typeof value === 'string';
}

function isArrayOfStrings(value) {
  return Array.isArray(value) && value.every((item) => typeof item === 'string' && item.trim().length > 0);
}

function badRequest(res, error) {
  return res.status(400).json({ error });
}

module.exports = {
  isNonEmptyString,
  isFiniteNumber,
  isOptionalString,
  isArrayOfStrings,
  badRequest,
};
