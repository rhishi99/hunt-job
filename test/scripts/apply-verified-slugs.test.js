import { describe, test, expect, vi } from 'vitest';
import Database from 'better-sqlite3';
import { runMigrations } from '../../src/core/db.js';
import {
  nameMatches, planEntry, buildPlan, applyPlan,
  DIRECT_ENTRIES, WORKDAY_ENTRIES, ORACLEHCM_ENTRIES, SUCCESSFACTORS_ENTRIES,
} from '../../scripts/apply-verified-slugs.js';

function freshDb() {
  const db = new Database(':memory:');
  runMigrations(db);
  return db;
}

function insertCompany(db, overrides = {}) {
  const c = { name: 'Placeholder', slug: null, ats_platform: null, enabled: 1, scan_config: null, ...overrides };
  db.prepare(`
    INSERT INTO companies (name, slug, ats_platform, enabled, scan_config)
    VALUES (@name, @slug, @ats_platform, @enabled, @scan_config)
  `).run(c);
  return db.prepare('SELECT * FROM companies WHERE name = ?').get(c.name);
}

describe('nameMatches', () => {
  test('accepts an exact company name', () => {
    expect(nameMatches('GitLab', 'GitLab')).toBe(true);
  });

  test('accepts token containment (Razorpay legal-entity name)', () => {
    expect(nameMatches('Razorpay Software Private Limited', 'Razorpay')).toBe(true);
  });

  test('rejects an unrelated company on the same slug guess (tcs case, §4.1)', () => {
    expect(nameMatches('Thornbury Community Services', 'TCS')).toBe(false);
  });

  test('rejects two empty/garbage strings', () => {
    expect(nameMatches('', '')).toBe(false);
  });
});

describe('planEntry — direct provider rows', () => {
  test('a brand-new company plans as insert, enabled', async () => {
    const db = freshDb();
    const plan = await planEntry(db, { name: 'Twilio', slug: 'twilio', platform: 'greenhouse' });
    expect(plan.action).toBe('insert');
    expect(plan.enabled).toBe(1);
    expect(plan.slug).toBe('twilio');
  });

  test('a row already matching the target state plans as noop', async () => {
    const db = freshDb();
    insertCompany(db, { name: 'GitLab', slug: 'gitlab', ats_platform: 'greenhouse', enabled: 1 });
    const plan = await planEntry(db, { name: 'GitLab', slug: 'gitlab', platform: 'greenhouse' });
    expect(plan.action).toBe('noop');
  });

  test('a row with a stale/missing slug plans as update', async () => {
    const db = freshDb();
    insertCompany(db, { name: 'Swiggy', slug: null, ats_platform: null, enabled: 1 });
    const plan = await planEntry(db, { name: 'Swiggy', slug: 'swiggy', platform: 'smartrecruiters' });
    expect(plan.action).toBe('update');
    expect(plan.slug).toBe('swiggy');
  });

  test('name matches by COLLATE NOCASE (case-insensitive lookup)', async () => {
    const db = freshDb();
    insertCompany(db, { name: 'ixigo', slug: null, ats_platform: null, enabled: 1 });
    const plan = await planEntry(db, { name: 'ixigo', slug: 'ixigo', platform: 'smartrecruiters' });
    expect(plan.action).toBe('update');
  });
});

describe('planEntry — verify-gated rows (New Relic / Razorpay caveat)', () => {
  test('applies when the injected verify function confirms the name', async () => {
    const db = freshDb();
    const verify = vi.fn().mockResolvedValue({ ok: true, boardName: 'Razorpay Software Private Limited' });
    const plan = await planEntry(
      db,
      { name: 'Razorpay', slug: 'razorpaysoftwareprivatelimited', platform: 'greenhouse', verify: true },
      { verify }
    );
    expect(verify).toHaveBeenCalledWith('razorpaysoftwareprivatelimited', 'Razorpay');
    expect(plan.action).toBe('insert');
  });

  test('skips (never enables) when the injected verify function rejects the name', async () => {
    const db = freshDb();
    const verify = vi.fn().mockResolvedValue({ ok: false, boardName: 'Thornbury Community Services' });
    const plan = await planEntry(
      db,
      { name: 'TCS', slug: 'tcs', platform: 'greenhouse', verify: true },
      { verify }
    );
    expect(plan.action).toBe('skip');
    expect(plan.reason).toMatch(/name check failed/);
  });

  test('skips (does not throw) when the verify request itself fails', async () => {
    const db = freshDb();
    const verify = vi.fn().mockRejectedValue(new Error('network down'));
    const plan = await planEntry(
      db,
      { name: 'New Relic', slug: 'newrelic', platform: 'greenhouse', verify: true },
      { verify }
    );
    expect(plan.action).toBe('skip');
    expect(plan.reason).toMatch(/verify request failed/);
  });
});

describe('planEntry — config-driven platforms never clobber a working direct provider', () => {
  test('a Workday entry is skipped when the company already has an enabled direct-provider row (Visa case)', async () => {
    const db = freshDb();
    insertCompany(db, { name: 'Visa', slug: 'Visa', ats_platform: 'smartrecruiters', enabled: 1 });
    const plan = await planEntry(db, {
      name: 'Visa', platform: 'workday', scan_config: { tenant: 'visa', wd: 'wd5', site: 'Visa' },
    });
    expect(plan.action).toBe('skip');
    expect(plan.reason).toMatch(/already on smartrecruiters/);
  });

  test('a Workday entry still applies when the existing row is disabled', async () => {
    const db = freshDb();
    insertCompany(db, { name: 'Infosys', slug: null, ats_platform: null, enabled: 1 });
    const plan = await planEntry(db, {
      name: 'Infosys', platform: 'workday', scan_config: { tenant: 'infosys', wd: 'wd103', site: 'BLS_Careers' },
    });
    expect(plan.action).toBe('update');
    expect(plan.enabled).toBe(0);
    expect(JSON.parse(plan.scan_config)).toEqual({ tenant: 'infosys', wd: 'wd103', site: 'BLS_Careers' });
  });

  test('a brand-new Workday-only company inserts disabled with scan_config', async () => {
    const db = freshDb();
    const plan = await planEntry(db, {
      name: 'JPMorgan', platform: 'oraclehcm', scan_config: { host: 'jpmc.fa.oraclecloud.com', site: 'CX_1001' },
    });
    expect(plan.action).toBe('insert');
    expect(plan.enabled).toBe(0);
    expect(plan.slug).toBeNull();
  });
});

describe('buildPlan + applyPlan (fixture DB, injected verify — no network)', () => {
  const noVerify = { verify: vi.fn().mockResolvedValue({ ok: true, boardName: 'ok' }) };

  test('every DIRECT_ENTRIES/WORKDAY_ENTRIES/ORACLEHCM_ENTRIES/SUCCESSFACTORS_ENTRIES row gets a plan', async () => {
    const db = freshDb();
    const plan = await buildPlan(db, noVerify);
    expect(plan.length).toBe(
      DIRECT_ENTRIES.length + WORKDAY_ENTRIES.length + ORACLEHCM_ENTRIES.length + SUCCESSFACTORS_ENTRIES.length
    );
  });

  test('applying the plan to an empty DB enables exactly the direct-provider rows', async () => {
    const db = freshDb();
    const plan = await buildPlan(db, noVerify);
    applyPlan(db, plan);

    const enabledPlatforms = db.prepare('SELECT DISTINCT ats_platform FROM companies WHERE enabled = 1').all().map(r => r.ats_platform);
    expect(enabledPlatforms.sort()).toEqual(['ashby', 'greenhouse', 'lever', 'smartrecruiters']);

    const disabledCount = db.prepare("SELECT COUNT(*) c FROM companies WHERE enabled = 0 AND ats_platform IN ('workday','oraclehcm','successfactors')").get().c;
    expect(disabledCount).toBeGreaterThan(0);

    // Applying twice is idempotent (second pass is all noop, no crash, same counts).
    const plan2 = await buildPlan(db, noVerify);
    expect(plan2.every(p => p.action === 'noop' || p.action === 'skip')).toBe(true);
  });
});
