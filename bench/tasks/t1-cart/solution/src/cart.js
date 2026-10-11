import { PRODUCTS } from "./catalog.js";
import { COUPONS } from "./coupons.js";

export function computeTotal(items, couponCode, today = new Date()) {
  const warnings = [];
  let subtotalCents = 0;

  for (const item of items) {
    const { sku, qty } = item;

    if (!(sku in PRODUCTS)) {
      throw new Error("UNKNOWN_SKU:" + sku);
    }

    if (!Number.isInteger(qty) || qty < 1) {
      throw new Error("INVALID_QTY:" + sku);
    }

    const priceCents = PRODUCTS[sku].priceCents;
    let lineTotal = qty * priceCents;

    if (qty >= 10) {
      lineTotal -= Math.round(lineTotal * 0.1);
    }

    subtotalCents += lineTotal;
  }

  let discountCents = 0;

  if (couponCode != null && couponCode !== "") {
    const normalizedCode = String(couponCode).trim().toUpperCase();
    const coupon = COUPONS[normalizedCode];

    if (!coupon) {
      warnings.push("UNKNOWN_COUPON");
    } else {
      if (today.toISOString().slice(0, 10) > coupon.expires) {
        warnings.push("EXPIRED_COUPON");
      } else if (subtotalCents < coupon.minSubtotalCents) {
        warnings.push("MIN_SUBTOTAL");
      } else {
        if (coupon.type === "percent") {
          discountCents = Math.round(subtotalCents * coupon.value / 100);
        } else if (coupon.type === "fixed") {
          discountCents = coupon.valueCents;
        }

        if (discountCents > subtotalCents) {
          discountCents = subtotalCents;
        }
      }
    }
  }

  const totalCents = subtotalCents - discountCents;

  return {
    subtotalCents,
    discountCents,
    totalCents,
    warnings,
  };
}
