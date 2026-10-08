/** Shared money formatting. Formatting only: no data module adds amounts across sources here. */

/** Dollars in Spanish: "$13.45 mil millones", "$812.3 millones", "$45,210". */
export function money(value: number): string {
  const sign = value < 0 ? "−" : "";
  const abs = Math.abs(value);
  if (abs >= 1e9) return `${sign}$${(abs / 1e9).toFixed(2)} mil millones`;
  if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(1)} millones`;
  return `${sign}$${Math.round(abs).toLocaleString("en-US")}`;
}
