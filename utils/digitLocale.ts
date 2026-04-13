/** Arabic-Indic digits (U+0660–U+0669), common in Arabic locales. */
const ARABIC_INDIC = "٠١٢٣٤٥٦٧٨٩";
/** Eastern Arabic / Persian digits (U+06F0–U+06F9). */
const EASTERN_ARABIC = "۰۱۲۳۴۵۶۷۸۹";
const LATIN = "0123456789";

export function toLatinDigits(s: string): string {
  let out = "";
  for (const c of s) {
    let i = ARABIC_INDIC.indexOf(c);
    if (i >= 0) {
      out += LATIN[i];
      continue;
    }
    i = EASTERN_ARABIC.indexOf(c);
    if (i >= 0) {
      out += LATIN[i];
      continue;
    }
    out += c;
  }
  return out;
}

/** Allow Arabic/Persian numerals in quantity-style fields; state stays ASCII digits. */
export function sanitizeUnsignedIntegerInput(raw: string): string {
  return toLatinDigits(raw).replace(/[^0-9]/g, "");
}
