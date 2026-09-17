import fs from 'fs';
import path from 'path';
import yaml from 'yaml';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadEnvProfile() {
  const env = process.env;
  if (env.HUNT_JOB_NAME || env.HUNT_JOB_EMAIL || env.HUNT_JOB_ROLE) {
    return {
      name: env.HUNT_JOB_NAME || '',
      email: env.HUNT_JOB_EMAIL || '',
      phone: env.HUNT_JOB_PHONE || '',
      currentRole: env.HUNT_JOB_ROLE || '',
      yearsOfExperience: parseInt(env.HUNT_JOB_YEARS) || 0,
      archetypes: (env.HUNT_JOB_ARCHETYPES || '').split(',').map(s => s.trim()).filter(Boolean),
      salary: {
        min: parseInt(env.HUNT_JOB_SALARY_MIN) || 0,
        max: parseInt(env.HUNT_JOB_SALARY_MAX) || 0,
        currency: env.HUNT_JOB_CURRENCY || 'INR',
        unit: env.HUNT_JOB_SALARY_UNIT || 'LPA'
      },
      remotePreference: env.HUNT_JOB_REMOTE || 'hybrid',
      techStack: (env.HUNT_JOB_TECH_STACK || '').split(',').map(s => s.trim()).filter(Boolean),
      dealbreakers: (env.HUNT_JOB_DEALBREAKERS || '').split(',').map(s => s.trim()).filter(Boolean),
      experience: [],
      education: [],
      projects: [],
      skills: [],
      certifications: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      _fromEnv: true
    };
  }
  return null;
}

// Scaffold values `initializeProfile()`/manual edits leave behind — present but meaningless.
const PLACEHOLDER_NAMES = new Set(['', 'updated name', 'your name', 'name', 'n/a']);

/**
 * Checks whether a profile carries enough signal for the evaluator and resume
 * generator to do real work. These are exactly the fields
 * `jobEvaluator.buildEvaluationPrompt()` interpolates into the LLM call — an
 * empty one silently scores every job against nothing.
 *
 * @returns {{ok: boolean, missing: string[]}}
 */
export function isProfileComplete(profile) {
  const missing = [];
  if (!profile) return { ok: false, missing: ['profile (no config/profile.yml)'] };

  if (PLACEHOLDER_NAMES.has(String(profile.name || '').trim().toLowerCase())) missing.push('name');
  if (!profile.currentRole) missing.push('currentRole');
  if (!(profile.yearsOfExperience > 0)) missing.push('yearsOfExperience');
  if (!profile.archetypes?.length) missing.push('archetypes');
  if (!profile.techStack?.length) missing.push('techStack');
  if (!(profile.salary?.min > 0) && !(profile.salary?.max > 0)) missing.push('salary');
  if (!profile.experience?.length) missing.push('experience');

  return { ok: missing.length === 0, missing };
}

class ProfileManager {
  constructor() {
    // Overridable so tests don't write to the real profile. runner.mjs calls
    // initializeProfile(), which writes the EMPTY scaffold — pointed at the
    // real config/ that silently wiped the user's profile on every `npm test`.
    this.profileDir = process.env.HUNT_JOB_CONFIG_DIR || path.join(__dirname, '../../config');
    this.modesDir = process.env.HUNT_JOB_MODES_DIR || path.join(__dirname, '../../modes');
    this.profilePath = path.join(this.profileDir, 'profile.yml');
    this.profileMdPath = path.join(this.modesDir, '_profile.md');

    this.ensureDirectories();
  }

  ensureDirectories() {
    [this.profileDir, this.modesDir].forEach(dir => {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    });
  }

  async loadProfile() {
    // First check env-based profile
    const envProfile = loadEnvProfile();
    if (envProfile) {
      this.warnIfIncomplete(envProfile);
      return envProfile;
    }
    
    try {
      if (!fs.existsSync(this.profilePath)) {
        return null;
      }
      const content = fs.readFileSync(this.profilePath, 'utf-8');
      const profile = yaml.parse(content);
      this.warnIfIncomplete(profile);
      return profile;
    } catch (error) {
      console.error('Error loading profile:', error);
      return null;
    }
  }

  /** Prints an incomplete-profile warning once per process (stderr, so --json stays clean). */
  warnIfIncomplete(profile) {
    if (this._warned) return;
    const { ok, missing } = isProfileComplete(profile);
    if (ok) return;
    this._warned = true;
    console.error(
      `\n⚠  Profile incomplete — missing: ${missing.join(', ')}.\n` +
      `   Job scores and tailored resumes will be low-quality until this is filled.\n` +
      `   Fix: npm run profile:seed   (or npm run profile:init to enter it by hand)\n`
    );
  }

  async saveProfile(profile) {
    try {
      const yaml_content = yaml.stringify(profile);
      fs.writeFileSync(this.profilePath, yaml_content, 'utf-8');

      // Also save to markdown format for CLI viewing
      const md_content = this.generateProfileMarkdown(profile);
      fs.writeFileSync(this.profileMdPath, md_content, 'utf-8');

      return profile;
    } catch (error) {
      console.error('Error saving profile:', error);
      throw error;
    }
  }

  async initializeProfile() {
    const profile = {
      name: '',
      email: '',
      phone: '',
      currentRole: '',
      yearsOfExperience: 0,
      archetypes: [],
      salary: {
        min: 0,
        max: 0,
        currency: 'INR',
        unit: 'LPA'
      },
      remotePreference: 'hybrid',
      techStack: [],
      dealbreakers: [],
      experience: [],
      education: [],
      projects: [],
      skills: [],
      certifications: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    await this.saveProfile(profile);
    return profile;
  }

  generateProfileMarkdown(profile) {
    const md = `# Career Profile
Created: ${profile.createdAt}
Last Updated: ${profile.updatedAt}

## Personal Information
- Name: ${profile.name || 'Not set'}
- Email: ${profile.email || 'Not set'}
- Phone: ${profile.phone || 'Not set'}

## Career Information
- Current Role: ${profile.currentRole || 'Not set'}
- Years of Experience: ${profile.yearsOfExperience || 0}
- Target Archetypes: ${profile.archetypes?.join(', ') || 'Not set'}

## Preferences
- Remote Preference: ${profile.remotePreference}
- Salary Range: ₹${profile.salary?.min || 0} - ₹${profile.salary?.max || 0} ${profile.salary?.unit || 'LPA'} (${profile.salary?.currency || 'INR'})
- Tech Stack: ${profile.techStack?.join(', ') || 'Not set'}

## Dealbreakers
${profile.dealbreakers?.map(d => `- ${d}`).join('\n') || 'None set'}

## Experience
${profile.experience?.map(exp => `### ${exp.title} at ${exp.company}
- Duration: ${exp.startDate} - ${exp.endDate}
- Description: ${exp.description}`).join('\n\n') || 'Not set'}

## Education
${profile.education?.map(edu => `### ${edu.degree} in ${edu.field}
- School: ${edu.school}
- Year: ${edu.year}`).join('\n\n') || 'Not set'}

## Skills
${profile.skills?.map(s => `- ${s}`).join('\n') || 'Not set'}

## Projects
${profile.projects?.map(p => `### ${p.title}
- Description: ${p.description}
- Technologies: ${p.technologies?.join(', ') || 'N/A'}`).join('\n\n') || 'Not set'}
`;
    return md;
  }

  async updateProfile(updates) {
    const profile = await this.loadProfile();
    if (!profile) {
      throw new Error('Profile not found. Run initialization first.');
    }

    const updatedProfile = {
      ...profile,
      ...updates,
      updatedAt: new Date().toISOString()
    };

    return await this.saveProfile(updatedProfile);
  }
}

export default ProfileManager;
