#!/usr/bin/env node
/**
 * applyJob.js — `hunt-job apply <url>`: open the AI auto-fill apply flow for a
 * single job URL from the command line. Enriches the job from the saved jobs
 * table when the URL is known, so the cover letter + fields get real context.
 */
import 'dotenv/config';
import chalk from 'chalk';
import ProfileManager from '../core/profileManager.js';
import { getDb, closeDb } from '../core/db.js';
import { applyToJob } from './flows/applyFlow.js';

async function main() {
  const url = process.argv[2];
  if (!url || url.startsWith('-')) {
    console.error(chalk.red('Usage: node hunt-job.js apply <job-url>'));
    process.exit(1);
  }

  const profile = await new ProfileManager().loadProfile();
  if (!profile?.name) {
    console.error(chalk.red('No profile found. Run:  node hunt-job.js profile init'));
    process.exit(1);
  }

  // Enrich from the jobs table if we've seen this posting.
  const row = getDb().prepare(`
    SELECT j.title, j.location, j.description, COALESCE(c.name, j.company_id) AS company
    FROM jobs j LEFT JOIN companies c ON c.id = j.company_id
    WHERE j.url = ? OR j.apply_url = ? LIMIT 1
  `).get(url, url);

  const job = {
    url,
    title: row?.title || 'Job Application',
    company: row?.company || 'Unknown',
    location: row?.location || null,
    description: row?.description || '',
  };

  const jobContext = job.description
    ? `Position: ${job.title}\nCompany: ${job.company}\nLocation: ${job.location || ''}\n\n${job.description}`
    : '';

  await applyToJob(job, profile, jobContext);
  closeDb();
}

main().catch(e => { console.error(chalk.red('Apply error:'), e.message); process.exit(1); });
