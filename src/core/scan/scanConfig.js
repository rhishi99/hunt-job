/**
 * scanConfig.js — helpers for providers that keep their coordinates in
 * companies.scan_config (JSON TEXT) instead of a board `slug` (docs/fable51-answers.md §4.2).
 */

/** Parses companyRef.scan_config (JSON string or already an object). Never throws. */
export function readScanConfig(companyRef) {
  const raw = companyRef?.scan_config;
  if (!raw) return {};
  if (typeof raw === 'object') return raw;
  try {
    const v = JSON.parse(raw);
    return v && typeof v === 'object' ? v : {};
  } catch {
    return {};
  }
}

/**
 * Search keywords for keyword-driven providers: the archetypes scanAll passes in,
 * else scan_config.keywords, else one empty query (= everything the source lists).
 */
export function searchTerms(companyRef, cfg = readScanConfig(companyRef)) {
  const fromArch = (companyRef?.archetypes || []).filter(Boolean);
  if (fromArch.length) return [...new Set(fromArch)];
  if (Array.isArray(cfg.keywords) && cfg.keywords.length) return cfg.keywords;
  return [''];
}
