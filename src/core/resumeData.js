/**
 * Canonical resume-rendering shape — shared by the interactive builder
 * (`resume-builder/index.html`, which inlines an identical `defaultResumeData()`
 * literal — keep the two in sync) and the CLI PDF generator
 * (`src/core/resumeGenerator.js`).
 *
 * RESUME_SHAPE = {
 *   name:      string,
 *   title:     string,
 *   summary:   string,
 *   photo:     string | null,              // data: URL
 *   contact:   { email, phone, location, linkedin, github },
 *   experience:[{ title, company, location, period, desc, bullets: string[] }],
 *   skills:    string[],                    // flat union — always present
 *   skillGroups:{ [group: string]: string[] },  // optional grouped view
 *   certificates:[{ name, period, desc }],
 *   education: [{ degree, institution, period }],
 *   languages: [{ name, level }],
 *   interests: string[],
 * }
 *
 * `profile.yml` (the profile system used by evaluation/matching) keeps its own
 * flatter shape; `fromProfile()` bridges it to this one.
 */

/** Escape a string for safe interpolation into an HTML template literal. */
export function esc(s) {
  return String(s ?? '').replace(/[&<>"]/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]
  ));
}

const SKILL_GROUPS = {
  'Cloud & AWS': ['AWS', 'EC2', 'S3', 'RDS', 'DynamoDB', 'ElastiCache', 'IAM', 'VPC', 'CloudWatch'],
  'CI/CD': ['Jenkins', 'Bamboo', 'GitHub Enterprise', 'Stash', 'AWX', 'Harness'],
  'IaC & Config': ['Terraform', 'Ansible', 'PowerShell'],
  'Containers': ['Docker', 'Kubernetes'],
  'Observability': ['New Relic'],
  'Code Quality & Security': ['SonarQube'],
  'AI & Automation': ['Claude Code', 'AI Automation'],
  'Delivery': ['JIRA', 'Confluence', 'Scaled Agile (SAFe)', 'Problem Solving', 'Cross-Team Collaboration'],
};

/** The seed resume — single source of truth (mirrored in resume-builder/index.html). */
export function defaultResumeData() {
  return {
    name: 'Rhishikesh Patil',
    title: 'Staff Software Engineer, DevOps',
    summary:
      'DevOps engineer experienced in AWS infrastructure, CI/CD, containerization, IaC, ' +
      'monitoring, automation, AI-assisted tooling, and leading large-scale platform migrations and team enablement. ' +
      'Certified Scrum Master (SAFe) with a background in Agile delivery. Strong problem solving, ' +
      'communication, and cross-team collaboration skills.',
    photo: null,
    contact: {
      email: 'rhishi99@gmail.com',
      phone: '8087821219',
      location: 'Pune, India',
      linkedin: 'in.linkedin.com/in/rhishikesh-patil-07413a23',
      github: '',
    },
    experience: [
      {
        title: 'Staff Software Engineer',
        company: 'CDK Global India Pvt. Ltd.',
        location: 'Pune',
        period: '12/2016 – Present',
        desc: 'CDK Global provides software and data services to the automotive retail industry.',
        bullets: [
          'Managed AWS cloud infrastructure across EC2, S3, RDS, IAM, VPC, ElastiCache, DynamoDB, and CloudWatch.',
          'Built and maintained CI/CD pipelines on Stash, Bamboo, and GitHub Enterprise.',
          'Ran observability and monitoring with New Relic for performance, reliability, and proactive incident detection.',
          'Provisioned and managed cloud resources as code with Terraform.',
          'Built, deployed, and debugged containerized applications on Docker and Kubernetes.',
          'Automated server provisioning and configuration with Ansible and PowerShell.',
          'Modernized delivery with Harness CI/CD and AI automation — used Claude Code to accelerate pipeline scripting, incident triage, and infrastructure tooling.',
          'Mentored a team of 70+ engineers on branching strategy for parallel development across CI/CD tooling.',
          'Led cross-functional migrations: Puppet to Ansible, Bamboo to GitHub, Windows Server 2008 R2 to 2016, and Ansible Tower to AWX.',
          'Enforced code quality and security gates in CI/CD pipelines with SonarQube.',
          'Owned production releases and change management.',
        ],
      },
      {
        title: 'Senior Systems Analyst',
        company: 'Persistent Systems Ltd.',
        location: '',
        period: '06/2015 – 12/2016',
        desc: '',
        bullets: [
          'Set up CI/CD with Jenkins, SonarQube, Git, SVN, JIRA, and IBM Rational CLM across multiple software development projects.',
        ],
      },
      {
        title: 'Software Engineer',
        company: 'Atos India Pvt. Ltd.',
        location: '',
        period: '11/2010 – 06/2015',
        desc: '',
        bullets: [
          'Consulted on SDLC adoption and process engineering for software projects using IBM RTC, RRC, and ClearQuest.',
        ],
      },
    ],
    skills: Object.values(SKILL_GROUPS).flat(),
    skillGroups: JSON.parse(JSON.stringify(SKILL_GROUPS)),
    certificates: [
      {
        name: 'SAFe 5.0 Scrum Master',
        period: '07/2021 – 07/2022',
        desc: 'Scaled Agile SAFe 5.0 Scrum Master certification.',
      },
    ],
    education: [
      { degree: 'Bachelor of Computer Engineering', institution: 'RMCET Devrukh, University of Mumbai', period: '07/2006 – 08/2010' },
      { degree: 'Class XII', institution: 'Kolhapur Board, Maharashtra', period: '03/2004 – 03/2006' },
      { degree: 'Class X', institution: 'Karnataka Secondary Education Examination Board', period: '' },
    ],
    languages: [
      { name: 'Marathi', level: 'Native or Bilingual Proficiency' },
      { name: 'Hindi', level: 'Native or Bilingual Proficiency' },
      { name: 'English', level: 'Full Professional Proficiency' },
    ],
    interests: ['Trekking and Hiking', 'Financial Markets'],
  };
}

/** Empty-but-valid resume, for callers that want to fill it field by field. */
export function emptyResumeData() {
  return {
    name: '', title: '', summary: '', photo: null,
    contact: { email: '', phone: '', location: '', linkedin: '', github: '' },
    experience: [], skills: [], skillGroups: {}, certificates: [],
    education: [], languages: [], interests: [],
  };
}

const splitBullets = desc => String(desc || '')
  .split(/(?<=[.!?])\s+(?=[A-Z0-9])/)
  .map(s => s.trim())
  .filter(Boolean);

/**
 * Map a `profile.yml`-style profile object to the canonical resume shape.
 * Unknown / missing fields degrade to empty — never throws.
 */
export function fromProfile(profile = {}) {
  const p = profile || {};
  const r = emptyResumeData();

  r.name = p.name || '';
  r.title = p.currentRole || p.title || '';
  r.summary = p.summary || '';
  r.contact = {
    email: p.email || '',
    phone: p.phone || '',
    location: p.location || '',
    linkedin: p.linkedin || '',
    github: p.github || '',
  };

  r.experience = (p.experience || []).map(e => ({
    title: e.title || '',
    company: e.company || '',
    location: e.location || '',
    period: e.period || [e.startDate, e.endDate].filter(Boolean).join(' – '),
    desc: e.summary || '',
    bullets: Array.isArray(e.bullets) && e.bullets.length ? e.bullets : splitBullets(e.description),
  }));

  const flat = [...(p.techStack || []), ...(p.skills || [])].filter(Boolean);
  r.skills = [...new Set(flat)];
  r.skillGroups = p.skillGroups && typeof p.skillGroups === 'object' ? p.skillGroups : {};

  r.certificates = (p.certifications || []).map(c =>
    typeof c === 'string' ? { name: c, period: '', desc: '' } : {
      name: c.name || '', period: c.period || '', desc: c.desc || '',
    });

  r.education = (p.education || []).map(e => ({
    degree: [e.degree, e.field].filter(Boolean).join(' in ') || e.degree || '',
    institution: e.institution || e.school || '',
    period: e.period || String(e.year || ''),
  }));

  r.languages = (p.languages || []).map(l =>
    typeof l === 'string' ? { name: l, level: '' } : { name: l.name || '', level: l.level || '' });

  r.interests = p.interests || [];
  r.photo = p.photo || null;

  return r;
}

/**
 * Merge an LLM-tailored partial ({ summary?, skills?, experience:[{title,company,dates,bullets}] })
 * over a canonical base. Only overrides fields the model actually returned; never
 * adds experience entries the base doesn't have (bullet-level tailoring only).
 */
export function mergeTailored(base, tailored = {}) {
  const out = JSON.parse(JSON.stringify(base));
  if (tailored.summary) out.summary = tailored.summary;
  if (Array.isArray(tailored.skills) && tailored.skills.length) out.skills = tailored.skills;

  if (Array.isArray(tailored.experience)) {
    const norm = s => (s || '').toLowerCase().trim();
    const used = new Set();
    out.experience = out.experience.map((job, i) => {
      // prefer a company+title match; fall back to company-only; each tailored
      // entry is consumed once so repeat-employer roles don't collide
      let mi = tailored.experience.findIndex((t, ti) => !used.has(ti) &&
        norm(t.company) === norm(job.company) && norm(t.title) === norm(job.title));
      if (mi === -1) mi = tailored.experience.findIndex((t, ti) => !used.has(ti) &&
        norm(t.company) === norm(job.company));
      if (mi === -1) return job;
      used.add(mi);
      const match = tailored.experience[mi];
      return Array.isArray(match.bullets) && match.bullets.length
        ? { ...job, bullets: match.bullets } : job;
    });
  }
  return out;
}
