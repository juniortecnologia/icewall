// expires: último dia válido (inclusive), em UTC.
export const COUPONS = {
  SAVE10: { type: "percent", value: 10, minSubtotalCents: 0, expires: "2099-12-31" },
  FIVEOFF: { type: "fixed", valueCents: 500, minSubtotalCents: 3000, expires: "2099-12-31" },
  BIGFIX: { type: "fixed", valueCents: 100000, minSubtotalCents: 0, expires: "2099-12-31" },
  OLD50: { type: "percent", value: 50, minSubtotalCents: 0, expires: "2020-01-01" },
};
