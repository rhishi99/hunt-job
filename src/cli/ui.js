// Shared CLI widgets — pure rendering helpers, no flow logic here.
import inquirer from 'inquirer';
import chalk from 'chalk';

export function clear() { process.stdout.write('\x1Bc'); }

export function banner() {
  console.log(chalk.cyan.bold('╔══════════════════════════════════════════╗'));
  console.log(chalk.cyan.bold('║') + chalk.white.bold('   🎯  CAREER-OPS  —  Job Search Agent    ') + chalk.cyan.bold('║'));
  console.log(chalk.cyan.bold('╚══════════════════════════════════════════╝'));
}

export function section(title) {
  console.log('\n' + chalk.cyan.bold(`── ${title} `) + chalk.cyan('─'.repeat(Math.max(0, 42 - title.length))));
}

export function info(label, value) {
  console.log(chalk.gray(`  ${label.padEnd(18)}: `) + chalk.white(value || chalk.italic.gray('not set')));
}

export function success(msg) { console.log(chalk.green(`\n  ✓  ${msg}`)); }
export function warn(msg)    { console.log(chalk.yellow(`\n  ⚠  ${msg}`)); }
export function err(msg)     { console.log(chalk.red(`\n  ✗  ${msg}`)); }
export function hint(msg)    { console.log(chalk.gray(`\n     ${msg}`)); }

export async function pressEnter() {
  await inquirer.prompt([{ type: 'input', name: '_', message: chalk.gray('Press Enter to continue...') }]);
}

export function scoreBar(score, max = 5) {
  const filled = Math.round((score / max) * 10);
  const bar = '█'.repeat(filled) + '░'.repeat(10 - filled);
  const color = score >= 4 ? chalk.green : score >= 3 ? chalk.yellow : chalk.red;
  return color(`${bar} ${score.toFixed(1)}/${max}`);
}

export function showProfileSummary(profile) {
  section('Your Profile');
  info('Name', profile.name);
  info('Role', profile.currentRole);
  info('Experience', `${profile.yearsOfExperience} years`);
  info('Location', profile.location);
  info('CTC Range', profile.salary ? `₹${profile.salary.min}–${profile.salary.max} LPA` : null);
  info('Archetypes', (profile.archetypes || []).join(', '));
  info('Work Mode', profile.remotePreference);
  info('Top Skills', (profile.techStack || []).slice(0, 6).join(', '));
}

export function showApplicationDataCard(profile) {
  const nameParts = (profile.name || '').split(' ');
  const firstName = nameParts[0] || '';
  const lastName = nameParts.slice(1).join(' ') || '';
  const recentCompany = (profile.experience || [])[0]?.company || '';

  section('Application Data Card  —  copy-paste ready');
  const row = (label, val) => {
    if (!val) return;
    console.log(chalk.gray(`  ${label.padEnd(22)}: `) + chalk.white(val));
  };
  row('First Name', firstName);
  row('Last Name', lastName);
  row('Full Name', profile.name);
  row('Email', profile.email);
  row('Phone', profile.phone);
  row('LinkedIn', profile.linkedin);
  row('GitHub', profile.github);
  row('Portfolio / Website', profile.website || profile.portfolio);
  row('Location', profile.location);
  row('Current Title', profile.currentRole);
  row('Current Company', recentCompany);
  row('Years of Experience', profile.yearsOfExperience ? String(profile.yearsOfExperience) : null);
  row('Top Skills', (profile.techStack || []).slice(0, 8).join(', '));
  row('Salary Expectation', profile.salary?.min ? `₹${profile.salary.min}–${profile.salary.max} LPA` : null);
}

export function showAutoFillReport(result) {
  const { platform, platformName, filled, skipped, uploaded, aiMappingUsed, fieldValues, targetUrl } = result;

  section('Auto-Fill Report');
  console.log(chalk.gray(`  Platform : `) + chalk.cyan.bold(platformName || platform));
  console.log(chalk.gray(`  URL      : `) + chalk.blue(targetUrl));
  if (aiMappingUsed) {
    console.log(chalk.gray(`  Method   : `) + chalk.magenta('🤖 AI field mapping + static sweep'));
  }

  // Group fields into categories for display
  const CATEGORIES = {
    '👤 Identity':   ['firstName', 'lastName', 'fullName', 'email', 'phone'],
    '📍 Location':   ['location', 'currentTitle', 'currentCompany'],
    '🔗 Links':      ['linkedin', 'github', 'website', 'twitter'],
    '📚 Education':  ['educationDegree', 'educationSchool', 'educationField', 'educationYear'],
    '💼 Experience': ['yearsOfExperience', 'skills', 'workAuthorization', 'noticePeriod', 'salaryExpectation'],
    '✉️  Content':    ['coverLetter', 'summary'],
  };

  const allFilled  = new Set(filled.map(f => f.replace('(AI)', '')));
  const allSkipped = new Set(skipped);

  console.log();
  for (const [cat, fields] of Object.entries(CATEGORIES)) {
    const catFilled  = fields.filter(f => allFilled.has(f));
    const catSkipped = fields.filter(f => allSkipped.has(f) && fieldValues[f]);
    const catMissing = fields.filter(f => allSkipped.has(f) && !fieldValues[f]);
    if (!catFilled.length && !catSkipped.length) continue;

    console.log(chalk.white.bold(`  ${cat}`));
    catFilled.forEach(f  => console.log(chalk.green(`    ✓ ${f}`)));
    catSkipped.forEach(f => console.log(chalk.yellow(`    ⚠ ${f}  ${chalk.gray('(not found on form)')}`)));
    catMissing.forEach(f => console.log(chalk.gray(`    · ${f}  ${chalk.italic.gray('(not in profile)')}`)));
  }

  // Resume upload status
  console.log();
  if (uploaded) {
    console.log(chalk.green('  📎 Resume PDF uploaded successfully'));
  } else if (fieldValues.resumePath) {
    console.log(chalk.yellow('  📎 Resume found but file input not detected on this form'));
  } else {
    console.log(chalk.gray('  📎 No resume PDF — generate one first with "Generate Resume"'));
  }

  const fillCount = filled.length;
  const total     = filled.length + skipped.filter(f => fieldValues[f]).length;
  const pct       = total > 0 ? Math.round((fillCount / total) * 100) : 0;
  console.log();
  console.log(
    chalk.white('  Coverage: ') +
    (pct >= 70 ? chalk.green : pct >= 40 ? chalk.yellow : chalk.red)(`${pct}%`) +
    chalk.gray(` (${fillCount}/${total} fields filled)`)
  );
}
