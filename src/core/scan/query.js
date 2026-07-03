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
  const { archetype, sinceDays, newHours, location, remote, allLocations, company, platform, limit } = opts;
  const now = Date.now();

  let out = jobs.filter(j => {
    if (archetype && !jobMatchesArchetype(j.title || '', null, archetype)) return false;

    const loc = (j.location || '').toLowerCase();
    if (location) {
      if (!loc.includes(location.toLowerCase())) return false;
    } else if (remote) {
      if (!/\bremote\b|\banywhere\b|\bworldwide\b/.test(loc)) return false;
    } else if (!allLocations) {
      if (!isIndiaLocation(j.location)) return false;
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
    SELECT j.id, j.title, j.location, j.url, j.apply_url AS applyUrl, j.description,
           j.posted_at AS postedAt, j.first_seen_at AS firstSeenAt, j.ats_platform AS source,
           COALESCE(c.name, j.company_id) AS company
    FROM jobs j
    LEFT JOIN companies c ON c.id = j.company_id
    WHERE j.status = ?
  `).all(opts.status || 'active');
  return filterJobs(rows, opts);
}

// ── self-check ────────────────────────────────────────────────────────────────
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const now = Date.now();
  const sample = [
    { title: 'Senior DevOps Engineer', location: 'Bangalore', company: 'Acme', source: 'lever', postedAt: now - 1 * DAY, firstSeenAt: now - 2 * HOUR },
    { title: 'Frontend Developer', location: 'London, UK', company: 'Beta', source: 'greenhouse', postedAt: now - 40 * DAY, firstSeenAt: now - 40 * DAY },
    { title: 'Data Engineer', location: 'Remote', company: 'Acme', source: 'lever', postedAt: now - 5 * DAY, firstSeenAt: now - 5 * DAY },
  ];
  const assert = (c, m) => { if (!c) throw new Error('FAIL: ' + m); };

  assert(filterJobs(sample, { archetype: 'DevOps Engineer' }).length === 1, 'archetype match');
  assert(filterJobs(sample, {}).length === 2, 'default India-only drops UK'); // Bangalore + Remote
  assert(filterJobs(sample, { allLocations: true }).length === 3, 'allLocations keeps UK');
  assert(filterJobs(sample, { remote: true }).length === 1, 'remote-only keeps Remote');
  assert(filterJobs(sample, { sinceDays: 7 }).length === 2, 'sinceDays 7 drops 40d-old');
  assert(filterJobs(sample, { newHours: 48 }).length === 1, 'newHours 48 keeps 2h-old');
  assert(filterJobs(sample, { company: 'acme' }).length === 2, 'company substring');
  assert(filterJobs(sample, { limit: 1 })[0].title === 'Senior DevOps Engineer', 'limit + newest-first sort');
  console.log('query.js self-check: OK');
}
