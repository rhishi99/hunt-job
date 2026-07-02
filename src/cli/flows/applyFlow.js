import inquirer from 'inquirer';
import chalk from 'chalk';
import JobEvaluator from '../../core/jobEvaluator.js';
import { getDb } from '../../core/db.js';
import {
  clear, banner, section, success, warn, err, hint, pressEnter,
  scoreBar, showApplicationDataCard, showAutoFillReport,
} from '../ui.js';

export async function runAutoFill(job, profile, jobContext) {
  console.log(chalk.gray('\n  Preparing AI cover letter + field values...'));
  console.log(chalk.gray('  This takes ~5 seconds, then the browser will open.\n'));

  const { autoFillApplication } = await import('../../core/autoFillBrowser.js');
  const result = await autoFillApplication(
    job.url,
    job.applyUrl || null,
    profile,
    jobContext || ''
  );

  showAutoFillReport(result);
  return result;
}

export async function applyToJob(job, profile, jobContext = '') {
  clear(); banner();
  section('Apply to Job');

  const alreadyApplied = getDb().prepare('SELECT * FROM applications WHERE url = ?').get(job.url);
  if (alreadyApplied) {
    warn(`Already applied to this job on ${new Date(alreadyApplied.applied_at).toLocaleDateString('en-IN')}`);
    await pressEnter();
    return;
  }

  console.log(chalk.white(`\n  Job:     `) + chalk.cyan.bold(job.title || job.jobTitle));
  console.log(chalk.white(`  Company: `) + chalk.white(job.company));
  console.log(chalk.white(`  URL:     `) + chalk.blue.underline(job.url || 'N/A'));

  if (!job.url) {
    warn('No URL available for this job. Cannot open or auto-fill.');
    await pressEnter();
    return;
  }

  // Show data card so user can copy-paste if needed
  showApplicationDataCard(profile);

  const { applyMethod } = await inquirer.prompt([{
    type: 'list',
    name: 'applyMethod',
    message: 'How would you like to apply?',
    choices: [
      { name: '🤖  Auto-fill form  (AI cover letter + browser auto-fill for 20+ fields)', value: 'autofill' },
      { name: '📋  Manual apply   (data card above — copy-paste into form yourself)',      value: 'manual' },
      { name: '↩  Skip',                                                                  value: 'skip' },
    ]
  }]);

  if (applyMethod === 'skip') { await pressEnter(); return; }

  let autoFillResult = null;

  if (applyMethod === 'autofill') {
    try {
      autoFillResult = await runAutoFill(job, profile, jobContext);

      // Offer retry if fill coverage was low
      const fillCount = autoFillResult.filled.length;
      const skippedWithValue = autoFillResult.skipped.filter(f => autoFillResult.fieldValues[f]).length;
      const pct = (fillCount + skippedWithValue) > 0
        ? Math.round((fillCount / (fillCount + skippedWithValue)) * 100)
        : 0;

      if (pct < 30 && skippedWithValue > 0) {
        warn('Low fill coverage. The form may need a moment to load fully.');
        const { retry } = await inquirer.prompt([{
          type: 'confirm',
          name: 'retry',
          message: 'Retry auto-fill? (browser stays open)',
          default: true
        }]);
        if (retry) {
          try {
            const { autoFillApplication } = await import('../../core/autoFillBrowser.js');
            const retryResult = await autoFillApplication(
              job.url, job.applyUrl || null, profile, jobContext || ''
            );
            showAutoFillReport(retryResult);
            autoFillResult = retryResult;
          } catch (e) { err(`Retry failed: ${e.message}`); }
        }
      }

      console.log(chalk.yellow('\n  Browser is open — review, complete any remaining fields, and submit.'));
      console.log(chalk.gray('  Press Enter here AFTER you have submitted the form.\n'));
      await pressEnter();

      try { await autoFillResult.browser.close(); } catch {}
    } catch (e) {
      err(`Auto-fill failed: ${e.message}`);
      hint(`Apply manually at: ${job.url}`);
      await pressEnter();
    }
  } else {
    // Manual — data card already shown above
    hint(`Open this URL to apply: ${job.url}`);
    console.log(chalk.gray('\n  Press Enter after you have submitted the form.\n'));
    await pressEnter();
  }

  const { didSubmit } = await inquirer.prompt([{
    type: 'confirm',
    name: 'didSubmit',
    message: 'Did you successfully submit the application?',
    default: true
  }]);

  if (!didSubmit) {
    warn('Application not marked as submitted.');
    await pressEnter();
    return;
  }

  const application = {
    id:            `app_${Date.now()}`,
    title:         job.title || job.jobTitle,
    company:       job.company,
    location:      job.location,
    url:           job.url,
    status:        'Applied',
    appliedAt:     new Date().toISOString(),
    applicantName: profile?.name || 'Unknown',
    applyMethod,
    platform:      autoFillResult?.platform || null,
    fieldsFilledCount: autoFillResult?.filled?.length || 0,
    resumeUploaded:    autoFillResult?.uploaded || false,
  };

  getDb().prepare(`
    INSERT INTO applications (
      id, title, company, location, url, status, applied_at,
      applicant_name, apply_method, platform, fields_filled_count, resume_uploaded
    ) VALUES (
      @id, @title, @company, @location, @url, @status, @appliedAt,
      @applicantName, @applyMethod, @platform, @fieldsFilledCount, @resumeUploaded
    )
  `).run({ ...application, resumeUploaded: application.resumeUploaded ? 1 : 0 });

  success(`Application saved! (ID: ${application.id})`);
  console.log(chalk.gray('\n  You can track this in Application Tracker.'));
  await pressEnter();
}

export async function runApplicationTracker() {
  clear(); banner();
  section('Application Tracker');

  const jobs = await new JobEvaluator().getEvaluatedJobs();
  if (!jobs.length) {
    warn('No evaluated jobs yet.');
    await pressEnter();
    return;
  }

  const sorted = [...jobs].sort((a, b) =>
    (b.evaluation?.overallScore || 0) - (a.evaluation?.overallScore || 0)
  );

  sorted.forEach((job, i) => {
    const score = job.evaluation?.overallScore || 0;
    const rec = job.evaluation?.recommendation || '?';
    const date = new Date(job.evaluatedAt).toLocaleDateString('en-IN');
    const recColor = rec === 'Apply' ? chalk.green : rec === 'Maybe' ? chalk.yellow : chalk.red;
    console.log(
      chalk.gray(`  ${(i + 1).toString().padStart(2)}. `) +
      scoreBar(score) +
      chalk.gray('  ') + recColor(rec.padEnd(7)) +
      chalk.gray(`  ${date}  `) +
      chalk.white((job.url || 'No URL').slice(0, 50))
    );
  });

  console.log(chalk.gray(`\n  Total evaluated: ${jobs.length}`));
  const applied = jobs.filter(j => (j.evaluation?.overallScore || 0) >= 4.0).length;
  console.log(chalk.gray(`  Strong matches (≥4.0): ${applied}`));

  await pressEnter();
}
