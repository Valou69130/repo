// Maximum lengths for text fields (characters)
const MAX = {
  id:           32,
  shortText:    100,   // names, counterparty, currency, isin, etc.
  mediumText:   500,   // notes, comments, eligibility descriptions
  longText:    2000,   // audit comments, integration refs
  url:          512,
  email:        254,
};

// Strip ASCII control characters (0x00–0x1F, 0x7F) except tab and newline.
// Prevents log injection, stored XSS via control chars, and terminal escape sequences.
function sanitise(value) {
  if (typeof value !== 'string') return value;
  // eslint-disable-next-line no-control-regex
  return value.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
}

function isNonEmptyString(value, max = MAX.shortText) {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= max;
}

function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function isOptionalString(value, max = MAX.mediumText) {
  return value === undefined || value === null || (typeof value === 'string' && value.length <= max);
}

function isArrayOfStrings(value, max = MAX.id) {
  return Array.isArray(value) && value.every((item) => typeof item === 'string' && item.trim().length > 0 && item.length <= max);
}

function isIsoCurrency(value) {
  return typeof value === 'string' && /^[A-Z]{3}$/.test(value);
}

function isIsoDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(value + 'T00:00:00Z');
  if (Number.isNaN(d.getTime())) return false;
  return d.toISOString().slice(0, 10) === value;
}

function badRequest(res, error) {
  return res.status(400).json({ error });
}

module.exports = {
  MAX,
  sanitise,
  isNonEmptyString,
  isFiniteNumber,
  isOptionalString,
  isArrayOfStrings,
  isIsoCurrency,
  isIsoDate,
  badRequest,
};
