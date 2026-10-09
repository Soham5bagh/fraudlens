const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const RUPEES = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" });
const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000;

export function money(paise: number | null | undefined): string {
  if (paise == null || Number.isNaN(paise)) return "—";
  return RUPEES.format(paise / 100);
}

export function wholeRupees(paise: number): string {
  const text = money(paise);
  return text.endsWith(".00") ? text.slice(0, -3) : text;
}

export function plural(n: number, word: string): string {
  return n === 1 ? `${n} ${word}` : `${n} ${word}s`;
}

export function isoFromSeconds(ts: number): string {
  return new Date(ts * 1000).toISOString().replace(".000Z", "Z");
}

export function isoFromMs(ms: number): string {
  const d = new Date(ms);
  const trimmed = Date.UTC(
    d.getUTCFullYear(),
    d.getUTCMonth(),
    d.getUTCDate(),
    d.getUTCHours(),
    d.getUTCMinutes(),
    d.getUTCSeconds(),
  );
  return new Date(trimmed).toISOString().replace(".000Z", "Z");
}

/** India Standard Time has no daylight saving, so a fixed offset is exact. */
export function clock(ts: number): string {
  const d = new Date(ts * 1000 + IST_OFFSET_MS);
  const day = String(d.getUTCDate()).padStart(2, "0");
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  return `${day} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()} ${hh}:${mm} IST`;
}

export function shortClock(ts: number): string {
  const d = new Date(ts * 1000 + IST_OFFSET_MS);
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  return `${hh}:${mm} IST`;
}

export function minutesBetween(startTs: number, endTs: number): number {
  return Math.max(0, Math.round((endTs - startTs) / 60));
}

export function medianInt(values: number[]): number {
  if (!values.length) return 0;
  const ordered = [...values].sort((a, b) => a - b);
  const mid = Math.floor(ordered.length / 2);
  const raw = ordered.length % 2 === 1 ? ordered[mid] : (ordered[mid - 1] + ordered[mid]) / 2;
  return Math.trunc(raw);
}

export function pct0(ratio: number): string {
  return `${(ratio * 100).toFixed(0)}%`;
}

export function times(ratio: number): string {
  return `${ratio.toFixed(1)}×`;
}

const COUNTRY_NAMES: Record<string, string> = {
  US: "the United States",
  GB: "the United Kingdom",
  NL: "the Netherlands",
  AE: "the United Arab Emirates",
  SG: "Singapore",
  ES: "Spain",
  CA: "Canada",
  NG: "Nigeria",
  BR: "Brazil",
  PT: "Portugal",
  DE: "Germany",
  EE: "Estonia",
  FR: "France",
  IN: "India",
  AU: "Australia",
  JP: "Japan",
  MX: "Mexico",
  IE: "Ireland",
  IT: "Italy",
  SE: "Sweden",
};

export function countryName(code: string): string {
  return COUNTRY_NAMES[code] ?? code;
}

export function nameList(names: string[]): string {
  if (!names.length) return "none";
  if (names.length === 1) return names[0];
  if (names.length <= 8) return `${names.slice(0, -1).join(", ")}, and ${names[names.length - 1]}`;
  return `${names.slice(0, 7).join(", ")}, and ${names.length - 7} more`;
}

export function othersOnDevice(count: number): string {
  if (count === 0) return "No other customer uses the devices in this episode.";
  if (count === 1) return "1 other customer uses a device in this episode.";
  return `${count} other customers use a device in this episode.`;
}

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function randInt(rng: () => number, maxExclusive: number): number {
  return Math.floor(rng() * maxExclusive);
}
