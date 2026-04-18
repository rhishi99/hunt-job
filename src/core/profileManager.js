import fs from 'fs';
import path from 'path';
import yaml from 'yaml';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

class ProfileManager {
  constructor() {
    this.profileDir = path.join(__dirname, '../../config');
    this.modesDir = path.join(__dirname, '../../modes');
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
    try {
      if (!fs.existsSync(this.profilePath)) {
        return null;
      }
      const content = fs.readFileSync(this.profilePath, 'utf-8');
      return yaml.parse(content);
    } catch (error) {
      console.error('Error loading profile:', error);
      return null;
    }
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
