/**
 * oraclehcm.js — Oracle Cloud HCM Candidate Experience REST (docs/fable51-answers.md §4.3 #2).
 * scan_config: { host, site, location? = 'India' }. The three *Str fields are the
 * description, so no detail call. Keyword+location search => result.partial = true.
 */
import { fetchJson } from '../httpClient.js';
import { cleanHtml, normalizeJob } from '../normalize.js';
import { readScanConfig, searchTerms } from '../scanConfig.js';

export const needsSlug = false;

const LIMIT = 25;
const MAX_PAGES = 4;

function coords(companyRef) {
  const cfg = readScanConfig(companyRef);
  if (!cfg.host || !cfg.site) throw new Error('oraclehcm: scan_config needs {host, site}');
  return { host: cfg.host, site: cfg.site, location: cfg.location ?? 'India' };
}

/** Pure parse of one response's requisitionList — exported for fixture tests. */
export function parse(requisitions, companyRef) {
  const { host, site } = coords(companyRef);
  const token = companyRef.slug || site;
  return (requisitions || []).filter(r => r.Id && r.Title).map(r => {
    const url = `https://${host}/hcmUI/CandidateExperience/en/sites/${site}/job/${r.Id}`;
    const description = cleanHtml([r.ShortDescriptionStr, r.ExternalResponsibilitiesStr, r.ExternalQualificationsStr]
      .filter(Boolean).join(' '));
    return normalizeJob({
      platform: 'oraclehcm',
      companyToken: token,
      externalId: r.Id,
      company: companyRef.name,
      title: r.Title,
      location: r.PrimaryLocation || r.PrimaryLocationCountry || null,
      url,
      applyUrl: url,
      description,
      postedAt: r.PostedDate ? Date.parse(r.PostedDate) : null,
      // no structured commitment field exposed here -> title/description heuristic only
    });
  });
}

export async function fetchJobs(companyRef) {
  const { host, site, location } = coords(companyRef);
  const seen = new Map();
  for (const term of searchTerms(companyRef)) {
    const kw = encodeURIComponent(term.replace(/[,;=]/g, ' ').trim());
    for (let page = 0; page < MAX_PAGES; page++) {
      const finder = `findReqs;siteNumber=${site},limit=${LIMIT},offset=${page * LIMIT},keyword=${kw},location=${encodeURIComponent(location)}`;
      const data = await fetchJson(
        `https://${host}/hcmRestApi/resources/latest/recruitingCEJobRequisitions?onlyData=true&expand=requisitionList&finder=${finder}`,
        { headers: { Accept: 'application/json' } });
      const item = data?.items?.[0];
      const list = item?.requisitionList || [];
      for (const r of list) if (r.Id && !seen.has(r.Id)) seen.set(r.Id, r);
      if (list.length < LIMIT || (page + 1) * LIMIT >= (item?.TotalJobsCount ?? 0)) break;
    }
  }
  const jobs = parse([...seen.values()], companyRef);
  jobs.partial = true;
  return jobs;
}
