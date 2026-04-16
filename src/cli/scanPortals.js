#!/usr/bin/env node
import PortalScanner from '../core/portalScanner.js';
import chalk from 'chalk';

const portalScanner = new PortalScanner();

async function scanPortals() {
  const args = process.argv.slice(2);
  let archetype = null;
  let companies = null;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--archetype' && args[i + 1]) {
      archetype = args[i + 1];
    } else if (args[i] === '--companies' && args[i + 1]) {
      companies = args[i + 1].split(',').map(c => c.trim());
    }
  }

  if (!archetype) {
    console.error(chalk.red('Error: Please specify --archetype'));
    console.log('Usage: npm run scan-portals -- --archetype "Data Engineer" [--companies "Stripe,Google"]');
    process.exit(1);
  }

  console.log(chalk.cyan.bold('\n🔍 Scanning job portals...\n'));

  const jobs = await portalScanner.scan(archetype, companies);

  if (jobs.length === 0) {
    console.log(chalk.yellow('No matching jobs found.'));
    process.exit(0);
  }

  console.log(chalk.green(`Found ${jobs.length} matching jobs!\n`));

  jobs.forEach((job, index) => {
    console.log(chalk.cyan.bold(`${index + 1}. ${job.title}`));
    console.log(`   Company: ${job.company}`);
    console.log(`   URL: ${job.url}`);
    if (job.description) {
      console.log(`   Description: ${job.description.substring(0, 100)}...`);
    }
    console.log();
  });
}

scanPortals().catch(err => {
  console.error(chalk.red('Error:'), err.message);
  process.exit(1);
});
