export function fmtMoney(v, ccy = "RON") {
  return new Intl.NumberFormat("en-RO", {
    style: "currency",
    currency: ccy,
    maximumFractionDigits: 0,
  }).format(v);
}

export function adjustedValue(asset) {
  return asset.marketValue * (1 - asset.haircut / 100);
}
