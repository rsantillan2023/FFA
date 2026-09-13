/** C.15 — convenciones numéricas chilenas ($ 1.234.567,89 o 1.234.567). */
export function parseMontoChileno(raw: string | number): number {
  if (typeof raw === "number") return raw;
  let s = raw.trim().replace(/^\$?\s*CLP?\s*/i, "").replace(/\s/g, "");
  if (!s) return 0;

  const neg = s.startsWith("(") && s.endsWith(")");
  if (neg) s = s.slice(1, -1);

  if (s.includes(",") && s.includes(".")) {
    s = s.replace(/\./g, "").replace(",", ".");
  } else if (s.includes(".") && /^\d{1,3}(\.\d{3})+$/.test(s)) {
    s = s.replace(/\./g, "");
  } else if (s.includes(",")) {
    s = s.replace(",", ".");
  }

  const n = Number.parseFloat(s);
  if (Number.isNaN(n)) return 0;
  return neg ? -n : n;
}
