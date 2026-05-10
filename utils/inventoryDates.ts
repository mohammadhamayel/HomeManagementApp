import { parseFlexibleDate } from "../components/DateInputField";

/**
 * Parse dates stored in SQLite: `YYYY-MM-DD`, full ISO (`toISOString()`), or flexible `DD/MM/YYYY`.
 * Avoids `new Date("YYYY-MM-DD")` / empty-string pitfalls that yield Invalid Date in the UI.
 */
export function parseInventoryDateString(
  value: string | null | undefined
): Date | null {
  const v = (value ?? "").trim();
  if (!v) return null;

  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) {
    const [y, mo, da] = v.split("-").map((x) => Number.parseInt(x, 10));
    if (!Number.isFinite(y) || !Number.isFinite(mo) || !Number.isFinite(da)) {
      return null;
    }
    const dt = new Date(y, mo - 1, da);
    if (
      dt.getFullYear() !== y ||
      dt.getMonth() !== mo - 1 ||
      dt.getDate() !== da
    ) {
      return null;
    }
    return dt;
  }

  const ms = Date.parse(v);
  if (Number.isFinite(ms)) {
    const dt = new Date(ms);
    if (!Number.isNaN(dt.getTime())) return dt;
  }

  return parseFlexibleDate(v);
}

export function formatInventoryDateForDisplay(
  value: string | null | undefined,
  locale = "ar"
): string {
  const d = parseInventoryDateString(value);
  if (!d) return "—";
  return d.toLocaleDateString(locale);
}

/** Store a calendar day as ISO (same style as `LastProductScreen` / `toISOString()`). */
export function ymdDayToIsoStorage(ymd: string): string {
  const t = ymd.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
  const [y, m, d] = t.split("-").map((x) => Number.parseInt(x, 10));
  return new Date(y, m - 1, d).toISOString();
}
