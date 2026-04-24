#!/usr/bin/env node
import inquirer from 'inquirer';
import chalk from 'chalk';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(__dirname, '../../.env');

const PROVIDERS = [
  { name: 'Anthropic',  envKey: 'ANTHROPIC_API_KEY',  url: 'console.anthropic.com' },
  { name: 'OpenRouter', envKey: 'OPENROUTER_API_KEY', url: 'openrouter.ai/keys' },
  { name: 'Groq',       envKey: 'GROQ_API_KEY',       url: 'console.groq.com' },
  { name: 'Nvidia NIM', envKey: 'NVIDIA_API_KEY',     url: 'integrate.api.nvidia.com' },
  { name: 'Gemini',     envKey: 'GEMINI_API_KEY',     url: 'aistudio.google.com' },
];

function loadEnv() {
  if (!fs.existsSync(envPath)) return {};
  const lines = fs.readFileSync(envPath, 'utf-8').split('\n');
  return Object.fromEntries(
    lines
      .filter(l => l.includes('=') && !l.startsWith('#'))
      .map(l => {
        const idx = l.indexOf('=');
        return [l.slice(0, idx).trim(), l.slice(idx + 1).trim()];
      })
  );
}

function saveEnv(vars) {
  const existing = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf-8') : '';
  const lines = existing.split('\n');
  const updated = { ...vars };

  const newLines = lines.map(line => {
    if (line.startsWith('#') || !line.includes('=')) return line;
    const key = line.split('=')[0].trim();
    if (key in updated) {
      const val = updated[key];
      delete updated[key];
      return `${key}=${val}`;
    }
    return line;
  });

  // Append any new keys not previously in the file
  for (const [k, v] of Object.entries(updated)) {
    newLines.push(`${k}=${v}`);
  }

  fs.writeFileSync(envPath, newLines.join('\n'), 'utf-8');
}

function maskKey(key) {
  if (!key || key.length < 10) return key;
  return key.slice(0, 6) + '...' + key.slice(-4);
}

function getProviderStatus(envVars) {
  return PROVIDERS.map(p => ({
    ...p,
    configured: !!envVars[p.envKey],
    masked: envVars[p.envKey] ? maskKey(envVars[p.envKey]) : null,
  }));
}

function showProviderTable(statuses) {
  console.log('\n' + chalk.bold('  Provider       Status'));
  console.log('  ' + '─'.repeat(40));
  for (const s of statuses) {
    const status = s.configured
      ? chalk.green(`✓  ${s.masked}`)
      : chalk.gray('✗  not configured');
    console.log(`  ${s.name.padEnd(14)} ${status}`);
  }
  console.log();
}

async function testProviderKey(providerEnvKey, apiKey) {
  process.env[providerEnvKey] = apiKey;
  // Force re-import by using dynamic import with cache bust not possible in ESM,
  // so we rely on the env var being set before import (works for first test per session)
  const { testConnection } = await import('../core/aiClient.js');
  const providerName = PROVIDERS.find(p => p.envKey === providerEnvKey)?.name.toLowerCase().replace(' ', '') ?? null;
  // Map display name to aiClient provider key
  const providerKeyMap = {
    anthropic: 'anthropic', openrouter: 'openrouter', groq: 'groq',
    nvidianim: 'nvidia', gemini: 'gemini',
  };
  return testConnection(providerKeyMap[providerName] ?? null);
}

async function main() {
  console.log(chalk.cyan.bold('\n⚙️  Hunt-Job Provider Setup\n'));

  const { action } = await inquirer.prompt([{
    type: 'list',
    name: 'action',
    message: 'What would you like to do?',
    choices: [
      { name: 'View configured providers',       value: 'view' },
      { name: 'Set / update a provider key',     value: 'set' },
      { name: 'Test a specific provider',        value: 'test-one' },
      { name: 'Test all configured providers',   value: 'test-all' },
      { name: 'Exit',                            value: 'exit' },
    ]
  }]);

  if (action === 'exit') process.exit(0);

  const envVars = loadEnv();
  const statuses = getProviderStatus(envVars);

  if (action === 'view') {
    showProviderTable(statuses);
    return;
  }

  if (action === 'test-all') {
    const configured = statuses.filter(s => s.configured);
    if (!configured.length) {
      console.log(chalk.red('\nNo providers configured. Set at least one key first.\n'));
      process.exit(1);
    }
    // Preload all keys into env before importing
    for (const s of configured) process.env[s.envKey] = envVars[s.envKey];

    console.log(chalk.gray('\nTesting all configured providers...\n'));
    const { testAllProviders } = await import('../core/aiClient.js');
    const results = await testAllProviders();
    for (const [name, result] of Object.entries(results)) {
      if (result.ok) {
        console.log(chalk.green(`  ✓ ${name}: "${result.response}"`));
      } else {
        console.log(chalk.red(`  ✗ ${name}: ${result.error}`));
      }
    }
    console.log();
    return;
  }

  if (action === 'test-one') {
    const configured = statuses.filter(s => s.configured);
    if (!configured.length) {
      console.log(chalk.red('\nNo providers configured.\n'));
      process.exit(1);
    }
    const { provider } = await inquirer.prompt([{
      type: 'list',
      name: 'provider',
      message: 'Select provider to test:',
      choices: configured.map(s => ({ name: `${s.name}  [${s.masked}]`, value: s })),
    }]);
    process.env[provider.envKey] = envVars[provider.envKey];
    console.log(chalk.gray('\nTesting connection...'));
    try {
      const { testConnection } = await import('../core/aiClient.js');
      const nimMap = { 'ANTHROPIC_API_KEY': 'anthropic', 'OPENROUTER_API_KEY': 'openrouter',
                       'GROQ_API_KEY': 'groq', 'NVIDIA_API_KEY': 'nvidia', 'GEMINI_API_KEY': 'gemini' };
      const result = await testConnection(nimMap[provider.envKey]);
      console.log(chalk.green(`\n  ✓ ${provider.name}: "${result}"\n`));
    } catch (err) {
      console.error(chalk.red(`\n  ✗ Failed: ${err.message}\n`));
      process.exit(1);
    }
    return;
  }

  // action === 'set'
  const { provider } = await inquirer.prompt([{
    type: 'list',
    name: 'provider',
    message: 'Select provider:',
    choices: statuses.map(s => ({
      name: `${s.name.padEnd(14)} ${s.configured ? chalk.yellow(`[${s.masked}]`) : chalk.gray('[not configured]')}`,
      value: s,
    })),
  }]);

  const { apiKey } = await inquirer.prompt([{
    type: 'password',
    name: 'apiKey',
    message: `Enter ${provider.name} API key (get it at ${provider.url}):`,
    mask: '*',
    validate: v => v.length > 10 || 'Key seems too short — please check',
  }]);

  console.log(chalk.gray('\nTesting connection...'));
  let testResult;
  try {
    testResult = await testProviderKey(provider.envKey, apiKey);
  } catch (err) {
    console.error(chalk.red(`\n✗ Connection failed: ${err.message}`));
    console.log(chalk.yellow('Key was NOT saved. Please verify the key and try again.\n'));
    process.exit(1);
  }

  console.log(chalk.green(`\n✓ Connection successful! Response: "${testResult}"`));
  saveEnv({ ...envVars, [provider.envKey]: apiKey });
  console.log(chalk.green(`✓ Key saved to .env\n`));
}

main().catch(err => {
  console.error(chalk.red('Error:'), err.message);
  process.exit(1);
});
