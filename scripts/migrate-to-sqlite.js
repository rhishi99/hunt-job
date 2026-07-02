#!/usr/bin/env node
// One-time migration: data/evaluated-jobs.json + data/applications.json + company
// portal config -> data/hunt-job.db. Never deletes user data — originals are
// renamed to .bak after a successful import (skipped if a .bak already exists).
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getDb, closeDb } from '../src/core/db.js';
import { SCANNABLE_COMPANIES } from '../src/core/portalScanner.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, '../data');
const configDir = path.join(__dirname, '../config');

const EVALUATED_JOBS_PATH = path.join(dataDir, 'evaluated-jobs.json');
const APPLICATIONS_PATH = path.join(dataDir, 'applications.json');
const COMPANY_PORTALS_PATH = path.join(configDir, 'company-portals.json');

function readJsonArray(filePath) {
  if (!fs.existsSync(filePath)) return null;
  const raw = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  return Array.isArray(raw) ? raw : [];
}

// ── Pure row mappers (exported for unit tests) ──────────────────────────────

export function evaluationRowFromJson(job) {
  return {
    id: job.id,
    url: job.url ?? null,
    evaluation: JSON.stringify(job.evaluation ?? {}),
    profile: JSON.stringify(job.profile ?? {}),
    evaluated_at: job.evaluatedAt ?? new Date().toISOString(),
  };
}

export function applicationRowFromJson(app) {
  return {
    id: app.id,
    title: app.title ?? null,
    company: app.company ?? null,
    location: app.location ?? null,
    url: app.url ?? null,
    status: app.status ?? null,
    applied_at: app.appliedAt ?? null,
    applicant_name: app.applicantName ?? null,
    apply_method: app.applyMethod ?? null,
    platform: app.platform ?? null,
    fields_filled_count: app.fieldsFilledCount ?? null,
    resume_uploaded: app.resumeUploaded ? 1 : 0,
    resume_path: app.resumePath ?? null,
    evaluation_score: app.evaluationScore ?? null,
    recommendation: app.recommendation ?? null,
  };
}

export function companyRowFromPortal(c) {
  return {
    name: c.name,
    slug: null,
    ats_platform: null,
    location: c.officeLocation ?? null,
    career_url: c.careerPageUrl ?? c.url ?? null,
  };
}

export function companyRowFromScannable(c) {
  return {
    name: c.name,
    slug: c.slug ?? null,
    ats_platform: c.api ?? null,
    location: c.location ?? null,
    career_url: null,
  };
}

// ── Import steps ─────────────────────────────────────────────────────────────

function importEvaluations(db, jobs) {
  if (!jobs?.length) return 0;
  const stmt = db.prepare(`
    INSERT INTO evaluations (id, url, evaluation, profile, evaluated_at)
    VALUES (@id, @url, @evaluation, @profile, @evaluated_at)
    ON CONFLICT(id) DO UPDATE SET
      url = excluded.url, evaluation = excluded.evaluation,
      profile = excluded.profile, evaluated_at = excluded.evaluated_at
  `);
  const insertAll = db.transaction(rows => rows.forEach(r => stmt.run(evaluationRowFromJson(r))));
  insertAll(jobs);
  return jobs.length;
}

function importApplications(db, apps) {
  if (!apps?.length) return 0;
  const stmt = db.prepare(`
    INSERT INTO applications (
      id, title, company, location, url, status, applied_at, applicant_name,
      apply_method, platform, fields_filled_count, resume_uploaded, resume_path,
      evaluation_score, recommendation
    ) VALUES (
      @id, @title, @company, @location, @url, @status, @applied_at, @applicant_name,
      @apply_method, @platform, @fields_filled_count, @resume_uploaded, @resume_path,
      @evaluation_score, @recommendation
    )
    ON CONFLICT(id) DO UPDATE SET
      title = excluded.title, company = excluded.company, location = excluded.location,
      url = excluded.url, status = excluded.status, applied_at = excluded.applied_at,
      applicant_name = excluded.applicant_name, apply_method = excluded.apply_method,
      platform = excluded.platform, fields_filled_count = excluded.fields_filled_count,
      resume_uploaded = excluded.resume_uploaded, resume_path = excluded.resume_path,
      evaluation_score = excluded.evaluation_score, recommendation = excluded.recommendation
  `);
  const insertAll = db.transaction(rows => rows.forEach(r => stmt.run(applicationRowFromJson(r))));
  insertAll(apps);
  return apps.length;
}

function upsertCompany(stmt, row) {
  stmt.run(row);
}

function seedCompanies(db, portalCompanies, scannableCompanies) {
  const stmt = db.prepare(`
    INSERT INTO companies (name, slug, ats_platform, location, career_url)
    VALUES (@name, @slug, @ats_platform, @location, @career_url)
    ON CONFLICT(name) DO UPDATE SET
      slug         = COALESCE(excluded.slug, companies.slug),
      ats_platform = COALESCE(excluded.ats_platform, companies.ats_platform),
      location     = COALESCE(excluded.location, companies.location),
      career_url   = COALESCE(excluded.career_url, companies.career_url)
  `);
  const seedAll = db.transaction(() => {
    (portalCompanies || []).forEach(c => upsertCompany(stmt, companyRowFromPortal(c)));
    (scannableCompanies || []).forEach(c => upsertCompany(stmt, companyRowFromScannable(c)));
  });
  seedAll();
  return (portalCompanies?.length || 0) + (scannableCompanies?.length || 0);
}

function backup(filePath) {
  if (!fs.existsSync(filePath)) return null;
  const bakPath = `${filePath}.bak`;
  if (fs.existsSync(bakPath)) {
    console.warn(`  ! ${path.basename(bakPath)} already exists — leaving ${path.basename(filePath)} in place`);
    return null;
  }
  fs.renameSync(filePath, bakPath);
  return bakPath;
}

async function main() {
  const db = getDb();

  const evaluatedJobs = readJsonArray(EVALUATED_JOBS_PATH);
  const applications = readJsonArray(APPLICATIONS_PATH);
  const portalData = fs.existsSync(COMPANY_PORTALS_PATH)
    ? JSON.parse(fs.readFileSync(COMPANY_PORTALS_PATH, 'utf-8'))
    : { companies: [] };

  const evalCount = importEvaluations(db, evaluatedJobs);
  const appCount = importApplications(db, applications);
  const companyCount = seedCompanies(db, portalData.companies, SCANNABLE_COMPANIES);

  console.log(`Migrated ${evalCount} evaluations, ${appCount} applications, ${companyCount} company seed rows into ${path.relative(process.cwd(), db.name)}`);

  if (evaluatedJobs !== null) {
    const bak = backup(EVALUATED_JOBS_PATH);
    if (bak) console.log(`  evaluated-jobs.json -> ${path.basename(bak)}`);
  }
  if (applications !== null) {
    const bak = backup(APPLICATIONS_PATH);
    if (bak) console.log(`  applications.json -> ${path.basename(bak)}`);
  }

  closeDb();
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  main().catch(e => { console.error(e); process.exit(1); });
}
