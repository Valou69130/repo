// Maximum lengths for text fields (characters)
const MAX = {
  id:           32,
  shortText:    100,   // names, counterparty, currency, isin, etc.
  mediumText:   500,   // notes, comments, eligibility descriptions
  longText:    2000,   // audit comments, integration refs
  url:          512,
  email:        254,
};

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

function badRequest(res, error) {
  return res.status(400).json({ error });
}

module.exports = {
  MAX,
  isNonEmptyString,
  isFiniteNumber,
  isOptionalString,
  isArrayOfStrings,
  badRequest,
};
