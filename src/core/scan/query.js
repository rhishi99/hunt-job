/**
 * query.js — instant job browsing straight from the `jobs` table (no network).
 *
 * The `jobs` table already holds every posting scanAll() has ever seen (dedup +
 * soft-close), so filtering it is the fast path: no ATS round-trips. Used by the
 * `list` CLI, the interactive "Browse saved jobs" flow, and to post-filter live
 * scan results (filterJobs is pure and reused by scanPortals.js).
 */
import { pathToFileURL } from 'url';
import { getDb } from '../db.js';
import { jobMatchesArchetype, isIndiaLocation } from './normalize.js';
import { isTargetJob } from './providers/websearch.js';

const DAY = 86400000;
const HOUR = 3600000;

/**
 * Pure filter over an array of job objects.
 * Each job: { title, location, company, source|ats_platform, postedAt, firstSeenAt }
 *
 * Location precedence: explicit `location` keyword > `remote` > `allLocations`
 * (no filter) > default India-only. This mirrors the app's India focus while
 * letting the DB's full corpus be queried when the user opts out.
 */
export function filterJobs(jobs, opts = {}) {
  const {
    archetype, sinceDays, newHours, location, remote, allLocations, company, platform, limit,
    employmentType,
  } = opts;
  const now = Date.now();
  // Accepts a single type or a list ('part-time' vs ['part-time','contract']).
  const wantedTypes = employmentType
    ? (Array.isArray(employmentType) ? employmentType : [employmentType]).map(t => String(t).toLowerCase())
    : null;

  let out = jobs.filter(j => {
    if (archetype && !jobMatchesArchetype(j.title || '', null, archetype)) return false;

    // Unknown commitment is excluded, not assumed full-time — a null here means
    // the provider told us nothing, so it can't be claimed as a match.
    if (wantedTypes && !wantedTypes.includes(j.employmentType)) return false;

    // Search-discovered LinkedIn stubs are noisy: hide rows that miss the senior/city target.
    // Rows saved before the ingest filter existed get cleaned up here too.
    if ((j.source || j.ats_platform) === 'linkedin-search' && !isTargetJob(j)) return false;

    const loc = (j.location || '').toLowerCase();
    if (location) {
      if (!loc.includes(location.toLowerCase())) return false;
    } else if (remote) {
      if (!/\bremote\b|\banywhere\b|\bworldwide\b/.test(loc)) return false;
    } else if (!allLocations) {
      // India, or remote anywhere. On-site abroad (relocation) stays hidden.
      if (!isIndiaLocation(j.location) && !/\bremote\b|\bwork from home\b/.test(loc)) return false;
    }

    if (company && !(j.company || '').toLowerCase().includes(company.toLowerCase())) return false;
    if (platform && (j.source || j.ats_platform || '') !== platform) return false;
    if (sinceDays && !(j.postedAt && now - j.postedAt < sinceDays * DAY)) return false;
    if (newHours && !(j.firstSeenAt && now - j.firstSeenAt < newHours * HOUR)) return false;
    return true;
  });

  out.sort((a, b) => (b.postedAt || b.firstSeenAt || 0) - (a.postedAt || a.firstSeenAt || 0));
  if (limit > 0) out = out.slice(0, limit);
  return out;
}

/** Query the jobs table (active by default) and apply filterJobs. Instant — no network. */
export function queryJobs(opts = {}, db = getDb()) {
  const rows = db.prepare(`
    SELECT j.id, j.title, j.location, j.url, j.apply_url AS applyUrl,
           j.posted_at AS postedAt, j.first_seen_at AS firstSeenAt, j.ats_platform AS source,
           j.employment_type AS employmentType,
           -- employer wins for aggregator sources, where company_id is the SOURCE
           -- (e.g. 'remotive') rather than the hiring company.
           COALESCE(j.employer, c.name, j.company_id) AS company
    FROM jobs j
    LEFT JOIN companies c ON c.id = j.company_id
    WHERE j.status = ?
  `).all(opts.status || 'active');
  // B-10: filter + LIMIT over the light rows first, then load the (large)
  // description blob only for the page that survives.
  const page = filterJobs(rows, opts);
  const CHUNK = 500;
  for (let i = 0; i < page.length; i += CHUNK) {
    const slice = page.slice(i, i + CHUNK);
    const byId = new Map(
      db.prepare(`SELECT id, description FROM jobs WHERE id IN (${slice.map(() => '?').join(',')})`)
        .all(...slice.map(j => j.id)).map(r => [r.id, r.description])
    );
    for (const j of slice) j.description = byId.get(j.id);
  }
  return page;
}

// ── self-check ────────────────────────────────────────────────────────────────
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const now = Date.now();
  const sample = [
    { title: 'Senior DevOps Engineer', location: 'Bangalore', company: 'Acme', source: 'lever', postedAt: now - 1 * DAY, firstSeenAt: now - 2 * HOUR, employmentType: 'full-time' },
    { title: 'Frontend Developer', location: 'London, UK', company: 'Beta', source: 'greenhouse', postedAt: now - 40 * DAY, firstSeenAt: now - 40 * DAY, employmentType: 'part-time' },
    { title: 'Data Engineer', location: 'Remote', company: 'Acme', source: 'lever', postedAt: now - 5 * DAY, firstSeenAt: now - 5 * DAY, employmentType: 'contract' },
    { title: 'Platform Engineer', location: 'Pune', company: 'Gamma', source: 'ashby', postedAt: now - 2 * DAY, firstSeenAt: now - 2 * DAY, employmentType: null },
  ];
  const assert = (c, m) => { if (!c) throw new Error('FAIL: ' + m); };

  assert(filterJobs(sample, { archetype: 'DevOps Engineer' }).length === 1, 'archetype match');
  assert(filterJobs(sample, {}).length === 3, 'default India-only drops UK'); // Bangalore + Remote + Pune
  assert(filterJobs(sample, { allLocations: true }).length === 4, 'allLocations keeps UK');
  assert(filterJobs(sample, { remote: true }).length === 1, 'remote-only keeps Remote');
  assert(filterJobs(sample, { sinceDays: 7 }).length === 3, 'sinceDays 7 drops 40d-old');
  assert(filterJobs(sample, { newHours: 48 }).length === 1, 'newHours 48 keeps 2h-old');
  assert(filterJobs(sample, { company: 'acme' }).length === 2, 'company substring');
  assert(filterJobs(sample, { limit: 1 })[0].title === 'Senior DevOps Engineer', 'limit + newest-first sort');

  // employment-type filter
  assert(filterJobs(sample, { employmentType: 'contract', allLocations: true }).length === 1, 'single commitment');
  assert(filterJobs(sample, { employmentType: ['part-time', 'contract'], allLocations: true }).length === 2, 'commitment list');
  assert(filterJobs(sample, { employmentType: 'part-time' }).length === 0, 'commitment still respects India filter');
  assert(filterJobs(sample, { employmentType: ['part-time'], allLocations: true })[0].company === 'Beta', 'right row returned');
  // A null employmentType must never satisfy a filter — unknown != full-time.
  assert(filterJobs(sample, { employmentType: 'full-time', allLocations: true }).length === 1, 'null commitment excluded');
  console.log('query.js self-check: OK');
}
