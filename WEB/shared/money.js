/** Money is integer paise. 100 paise = ₹1. */

export function toPaise(value) {
  if (value == null) return 0;
  let s = String(value).trim();
  if (!s || s === "-" || s === "—" || s === "–") return 0;
  s = s.replace(/₹/g, "").replace(/,/g, "").replace(/\s+/g, "");
  if (!s || s === "-" || s === "—" || s === "–") return 0;

  const negative = s.startsWith("-") || /^\(.*\)$/.test(s) || /dr$/i.test(s);
  s = s.replace(/^\(/, "").replace(/\)$/, "").replace(/^-/, "").replace(/(cr|dr)$/i, "");
  if (!/^\d+(\.\d+)?$/.test(s)) return null;

  const [rs, frac = ""] = s.split(".");
  if (rs.length > 12) return null;
  const digits = (frac + "000").slice(0, 3);
  let paise = Number(rs) * 100 + Number(digits.slice(0, 2));
  if (digits[2] >= "5") paise += 1;
  if (!Number.isSafeInteger(paise)) return null;
  return negative ? -paise : paise;
}

export function toUnsignedPaise(value) {
  if (value == null) return 0;
  const s = String(value).trim();
  if (!s || s === "-" || s === "—" || s === "–") return 0;
  const cleaned = s.replace(/(cr|dr)$/i, "").replace(/^-/, "").replace(/^\(/, "").replace(/\)$/, "");
  const paise = toPaise(cleaned);
  if (paise == null) return null;
  return Math.abs(paise);
}

export function paiseToAmount(paise) {
  const sign = paise < 0 ? "-" : "";
  const abs = Math.abs(paise);
  const rupees = Math.floor(abs / 100);
  const fraction = String(abs % 100).padStart(2, "0");
  return `${sign}${rupees}.${fraction}`;
}

function groupIndian(intStr) {
  if (intStr.length <= 3) return intStr;
  const tail = intStr.slice(-3);
  const head = intStr.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ",");
  return `${head},${tail}`;
}

export function formatRupee(amount, { empty = false } = {}) {
  const raw = String(amount ?? "0.00").trim();
  const negative = raw.startsWith("-");
  const [rsRaw, psRaw = "00"] = raw.replace("-", "").split(".");
  const rs = (rsRaw.replace(/\D/g, "") || "0").replace(/^0+(?=\d)/, "");
  const ps = (psRaw.replace(/\D/g, "") + "00").slice(0, 2);
  if (empty && !negative && rs === "0" && ps === "00") return "—";
  const body = `${groupIndian(rs)}.${ps}`;
  return negative ? `−₹${body}` : `₹${body}`;
}
