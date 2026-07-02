import inquirer from 'inquirer';
import chalk from 'chalk';
import PortalScanner, { SCANNABLE_COMPANIES } from '../../core/portalScanner.js';
import { getRecentScans, saveScans, clearCache, closeDb, hasFreshScan, TTL_HOURS } from '../../core/jobCache.js';
import { clear, banner, section, warn, err, pressEnter } from '../ui.js';
import { runEvaluateFlow } from './evaluateFlow.js';
import { runInterviewPrepFlow } from './prepFlow.js';
import { runResumeGenFlow } from './resumeFlow.js';
import { applyToJob } from './applyFlow.js';

export async function runScanFlow(profile) {
  clear(); banner();
  section('Scan Job Portals');

  const archetypeChoices = profile.archetypes?.length
    ? [...profile.archetypes, 'Other (type manually)']
    : ['Software Engineer', 'Data Engineer', 'DevOps Engineer', 'Backend Engineer', 'Other (type manually)'];

  const { archetypeChoice } = await inquirer.prompt([{
    type: 'list',
    name: 'archetypeChoice',
    message: 'Which role are you scanning for?',
    choices: archetypeChoices
  }]);

  let archetype = archetypeChoice;
  if (archetypeChoice === 'Other (type manually)') {
    const { custom } = await inquirer.prompt([{ type: 'input', name: 'custom', message: 'Enter role:' }]);
    archetype = custom;
  }

  // ── Cache lookup ─────────────────────────────────────────────────────────
  let jobs = null;

  const cachedScans = getRecentScans(archetype);
  const freshExists  = hasFreshScan(archetype);   // within TTL_HOURS

  if (cachedScans.length > 0 && freshExists) {
    // Only offer cache when there's actually a recent scan
    const now = Date.now();
    const cacheChoices = cachedScans.map(scan => {
      const ageMs   = scan.ageMs;
      const ageDays = Math.floor(ageMs / 86_400_000);
      const ageHrs  = Math.floor(ageMs / 3_600_000);
      const ageMins = Math.floor((ageMs % 3_600_000) / 60_000);
      const ageLabel = ageDays > 0 ? `${ageDays}d old` : ageHrs > 0 ? `${ageHrs}h ${ageMins}m old` : `${ageMins}m old`;
      const scope = scan.companyFilter
        ? scan.companyFilter.slice(0, 40) + (scan.companyFilter.length > 40 ? '…' : '')
        : 'All companies';
      const staleTag = ageDays >= 3 ? chalk.red(' ⚠ STALE') : ageDays >= 1 ? chalk.yellow(' (old)') : chalk.green(' (fresh)');
      return {
        name : `📦  ${scan.jobCount} jobs  ·  ${ageLabel}${staleTag}  ·  ${scope}`,
        value: scan,
      };
    });

    const { scanSource } = await inquirer.prompt([{
      type    : 'list',
      name    : 'scanSource',
      message : `Cached scans for "${archetype}" (select or do a fresh search):`,
      choices : [
        { name: '🔍  Fresh search  (hit live job boards NOW)', value: 'fresh' },
        { name: '🗑️   Clear cache + fresh search', value: 'clear' },
        new inquirer.Separator(),
        ...cacheChoices,
      ],
    }]);

    if (scanSource === 'clear') {
      clearCache(archetype);
      console.log(chalk.gray('  Cache cleared. Running fresh search...\n'));
      // fall through to fresh scan (jobs stays null)
    } else if (scanSource !== 'fresh') {
      jobs = scanSource.jobs;
      const ageMs   = scanSource.ageMs;
      const ageDays = Math.floor(ageMs / 86_400_000);
      if (ageDays >= 3) {
        warn(`These results are ${ageDays} day(s) old. Consider doing a fresh search for latest openings.`);
      } else {
        const ageHrs = Math.floor(ageMs / 3_600_000);
        const ageMins = Math.floor((ageMs % 3_600_000) / 60_000);
        const ageLabel = ageHrs > 0 ? `${ageHrs}h ${ageMins}m` : `${ageMins}m`;
        console.log(chalk.gray(`\n  Loaded ${jobs.length} cached jobs (${ageLabel} old).\n`));
      }
    }
  } else if (cachedScans.length > 0) {
    // Cache exists but is stale (> TTL_HOURS) — inform and auto-run fresh scan
    const oldest = cachedScans[0];
    const ageHrs = Math.floor(oldest.ageMs / 3_600_000);
    warn(`Last scan was ${ageHrs}h ago (limit: ${TTL_HOURS}h). Running a fresh search automatically.`);
    console.log(chalk.gray('  Use "🗑️ Clear cache" in the menu after if you also want to remove old entries.\n'));
    // jobs stays null → fresh scan below
  } else {
    console.log(chalk.gray('  No cached scans found — running fresh search.\n'));
  }

  // ── Fresh scan (cache empty or user chose fresh) ──────────────────────────
  if (!jobs) {
    const total = SCANNABLE_COMPANIES.length;

    const { scanAll } = await inquirer.prompt([{
      type: 'confirm',
      name: 'scanAll',
      message: `Scan all ${total} companies with public job APIs? (No = pick specific ones)`,
      default: true
    }]);

    let selectedCompanies = null;
    if (!scanAll) {
      const { picked } = await inquirer.prompt([{
        type: 'checkbox',
        name: 'picked',
        message: `Select companies to scan (${total} available via API):`,
        pageSize: 20,
        choices: SCANNABLE_COMPANIES.map(c => ({
          name: `${c.name}  ${chalk.gray(`(${c.api})`)}`,
          value: c.name
        })),
        validate: v => v.length > 0 || 'Pick at least one'
      }]);
      selectedCompanies = picked;
    }

    console.log(chalk.gray(`\n  Scanning for "${archetype}" roles...\n`));

    try {
      const scanner = new PortalScanner();
      const rawJobs = await scanner.scan(archetype, selectedCompanies);

      // ── Recency filter ───────────────────────────────────────────────────
      const { recencyDays } = await inquirer.prompt([{
        type: 'list',
        name: 'recencyDays',
        message: `Filter results by posting date (${rawJobs.length} total found):`,
        choices: [
          { name: `🔥  Last 7 days   (${rawJobs.filter(j => j.postedAt && (Date.now() - j.postedAt) < 7  * 86400000).length} jobs)`, value: 7  },
          { name: `📅  Last 30 days  (${rawJobs.filter(j => j.postedAt && (Date.now() - j.postedAt) < 30 * 86400000).length} jobs)`, value: 30 },
          { name: `📆  Last 90 days  (${rawJobs.filter(j => j.postedAt && (Date.now() - j.postedAt) < 90 * 86400000).length} jobs)`, value: 90 },
          { name: `📋  All results   (${rawJobs.length} jobs, no date filter)`,                                                    value: 0  },
        ],
        default: 1,   // default to 30 days
      }]);

      jobs = recencyDays > 0
        ? rawJobs.filter(j => j.postedAt && (Date.now() - j.postedAt) < recencyDays * 86400000)
        : rawJobs;

      if (jobs.length < rawJobs.length) {
        console.log(chalk.gray(`  Filtered: ${rawJobs.length - jobs.length} older jobs hidden (posted > ${recencyDays}d ago).\n`));
      }

      if (jobs.length) {
        const filterLabel = selectedCompanies ? selectedCompanies.join(', ') : null;
        saveScans(archetype, jobs, filterLabel);
      }
    } catch (e) {
      err(`Scan failed: ${e.message}`);
      await pressEnter();
      return;
    }
  }

  // ── Display results ───────────────────────────────────────────────────────
  if (!jobs.length) {
    warn('No matching jobs found. Try a fresh search or broaden the role.');
    await pressEnter();
    return;
  }

  section(`Found ${jobs.length} Roles`);
  jobs.forEach((job, i) => {
    console.log(chalk.cyan.bold(`\n  ${i + 1}. ${job.title || job.jobTitle}`));
    console.log(chalk.gray(`     Company:  `) + chalk.white(job.company));
    console.log(chalk.gray(`     Location: `) + chalk.white(job.location || 'India'));
    if (job.url) console.log(chalk.gray(`     URL:      `) + chalk.blue.underline(job.url));
    if (job.description) console.log(chalk.gray(`     Summary:  `) + chalk.white(job.description.slice(0, 120)));
  });

  // Loop over job selection so users can act on multiple jobs from the same
  // scan without re-fetching / re-picking the archetype each time.
  while (true) {
    let selected;
    if (jobs.length === 1) {
      selected = jobs[0];
      console.log(chalk.gray(`\n  Auto-selected the only result: `) + chalk.cyan.bold(selected.title));
    } else {
      const { jobChoice } = await inquirer.prompt([{
        type: 'list',
        name: 'jobChoice',
        message: 'Select a job:',
        pageSize: 15,
        choices: jobs.map((job, i) => {
          const isNew = job.postedAt && (Date.now() - job.postedAt) < 172800000; // < 48h
          const badge = isNew ? chalk.red(' 🔥 NEW') : job.postedLabel ? chalk.gray(` · ${job.postedLabel}`) : '';
          return {
            name: `${job.title || job.jobTitle}  —  ${job.company}  (${job.location || 'India'})${badge}`,
            value: i
          };
        })
      }]);
      selected = jobs[jobChoice];
    }

    const { action } = await inquirer.prompt([{
      type: 'list',
      name: 'action',
      message: `What do you want to do with: ${selected.title} @ ${selected.company}?`,
      choices: [
        { name: '🚀  Full workflow  (eval → prep → resume → apply)', value: 'full' },
        { name: '📊  Evaluate this job', value: 'evaluate' },
        { name: '🎯  Interview prep', value: 'prep' },
        { name: '📄  Generate resume', value: 'resume' },
        { name: '✅  Apply (save & open link)', value: 'apply' },
        new inquirer.Separator(),
        { name: '🔙  Pick another job from this list', value: 'pickagain' },
        { name: '↩  Back to main menu', value: 'back' },
        { name: '🚪  Exit', value: 'exit' }
      ]
    }]);

    if (action === 'exit') {
      closeDb();
      console.log(chalk.cyan('\n  Good luck with your job search! 🎯\n'));
      process.exit(0);
    }
    if (action === 'back') return;      // back to main menu
    if (action === 'pickagain') continue; // re-show job list, no re-scan

    // Build rich text context so AI modules receive actual content, not just a URL
    const jobTitle = selected.title || selected.jobTitle || '';
    const jobDesc  = selected.description || '';
    const jobUrl   = selected.url || '';
    const jobInput = jobDesc
      ? `Position: ${jobTitle}\nCompany: ${selected.company}\nLocation: ${selected.location || 'India'}\n\n${jobDesc}\n\nJob URL: ${jobUrl}`
      : jobUrl;

    if (action === 'full') {
      try { await runEvaluateFlow(profile, jobInput, true); } catch (e) { err(`Evaluate failed: ${e.message}`); }
      try { await runInterviewPrepFlow(profile, jobInput); } catch (e) { err(`Prep failed: ${e.message}`); }
      try { await runResumeGenFlow(profile, jobInput); } catch (e) { err(`Resume failed: ${e.message}`); }
      try { await applyToJob(selected, profile, jobInput); } catch (e) { err(`Apply failed: ${e.message}`); }
    }
    if (action === 'evaluate') { try { await runEvaluateFlow(profile, jobInput); } catch (e) { err(`Evaluate failed: ${e.message}`); } }
    if (action === 'prep') { try { await runInterviewPrepFlow(profile, jobInput); } catch (e) { err(`Prep failed: ${e.message}`); } }
    if (action === 'resume') { try { await runResumeGenFlow(profile, jobInput); } catch (e) { err(`Resume failed: ${e.message}`); } }
    if (action === 'apply') { try { await applyToJob(selected, profile, jobInput); } catch (e) { err(`Apply failed: ${e.message}`); } }

    // After completing an action, loop back to let the user pick another
    // job from the same results instead of dropping straight to main menu.
  }
}
