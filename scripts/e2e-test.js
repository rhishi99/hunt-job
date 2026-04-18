#!/usr/bin/env node
/**
 * End-to-end pipeline test.
 * Runs: Scan → Evaluate → Interview Prep → Resume → Apply
 * Uses real AI if quota available; stubs AI otherwise so structure is always verified.
 */
import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

let passed = 0, failed = 0;
function ok(label, value) {
  if (value) { console.log(`  ✓ ${label}`); passed++; }
  else        { console.log(`  ✗ ${label}`); failed++; }
}

// ─── AI stub (used when real AI quota is exhausted) ───────────────────────────
function stubAiClient() {
  return {
    messages: {
      create: async ({ messages }) => {
        const prompt = messages?.[0]?.content || '';
        let text = '';

        if (prompt.includes('evaluate') || prompt.includes('Evaluate') || prompt.includes('10 dimensions')) {
          text = JSON.stringify({
            overallScore: 4.2,
            recommendation: 'Apply',
            dimensions: {
              'Salary Alignment': 4, 'Tech Stack Compatibility': 5, 'Company Culture Fit': 4,
              'Growth Opportunities': 4, 'Location/Remote Requirements': 4,
              'Team Dynamics': 4, 'Product Market Fit': 4, 'Work-Life Balance': 4,
              'Career Progression': 4, 'Dealbreaker Compliance': 5
            },
            matches: ['Strong AWS/cloud experience match', 'CI/CD pipeline expertise', 'Kubernetes & Docker skills'],
            mismatches: ['Salary slightly below expectation'],
          });
        } else if (prompt.includes('keywords') || prompt.includes('extract')) {
          text = '["DevOps", "AWS", "Kubernetes", "Docker", "CI/CD", "Terraform", "Jenkins", "Ansible", "Python", "Infrastructure as Code"]';
        } else if (prompt.includes('resume') || prompt.includes('HTML')) {
          text = `<html><head><title>Resume</title><style>body{font-family:Arial;margin:40px;} h1{color:#333;} .section{margin:20px 0;}</style></head><body>
<h1>Rhishikesh Patil</h1><p>rhishi99@gmail.com | +91 8087821219 | Pune, India</p>
<div class="section"><h2>Summary</h2><p>Senior DevOps Engineer with 15 years experience in AWS, CI/CD, Kubernetes, and IaC. Expert in Terraform, Ansible, Jenkins, Docker.</p></div>
<div class="section"><h2>Experience</h2><h3>Senior Software Engineer - CDK Global India (2016–Present)</h3><ul><li>Managed AWS infrastructure (EC2, S3, RDS, IAM, VPC)</li><li>Built CI/CD pipelines with Jenkins, GitHub Enterprise</li><li>Led Docker/Kubernetes deployments at scale</li><li>Automated with Terraform, Ansible, CloudFormation</li></ul></div>
<div class="section"><h2>Skills</h2><p>AWS, Kubernetes, Docker, Terraform, Jenkins, Ansible, CI/CD, Python, IaC, DevOps</p></div>
</body></html>`;
        } else if (prompt.includes('interview') || prompt.includes('preparation') || prompt.includes('JSON')) {
          text = JSON.stringify({
            focusAreas: ['AWS Cloud Architecture', 'Kubernetes & Container Orchestration', 'CI/CD Pipeline Design', 'Infrastructure as Code', 'Monitoring & Observability'],
            conceptsToMaster: [
              { category: 'Cloud', name: 'AWS Services Deep Dive' },
              { category: 'DevOps', name: 'GitOps workflows' },
              { category: 'DevOps', name: 'Kubernetes operators' }
            ],
            interviewRounds: [
              { name: 'Technical Screening', duration: '45 min', focus: 'DevOps fundamentals' },
              { name: 'System Design', duration: '60 min', focus: 'CI/CD architecture' },
              { name: 'Coding Round', duration: '45 min', focus: 'Scripting & automation' },
              { name: 'Leadership Round', duration: '45 min', focus: 'Team management' },
            ],
            behavioralQuestions: [
              'Tell me about a large-scale migration you led.',
              'How do you handle production incidents?',
              'Describe your experience mentoring junior engineers.',
              'How do you ensure high availability in your infrastructure?',
              'What is your approach to security in CI/CD pipelines?',
            ],
            weeklyPlan: {
              'Week 1': ['AWS services review', 'Terraform deep dive', 'Kubernetes advanced topics'],
              'Week 2': ['System design patterns', 'Mock interviews', 'CI/CD best practices'],
              'Week 3': ['Scripting & automation', 'Monitoring & alerting', 'Company research'],
              'Week 4': ['Full mock interviews', 'Behavioral prep', 'Review & polish'],
            },
            redFlags: ['Vague answers on specific tools', 'No metrics in answers', 'Not asking questions'],
            techStack: ['AWS', 'Kubernetes', 'Docker', 'Terraform', 'Jenkins', 'Python'],
            systemDesign: ['Design a CI/CD pipeline', 'Design a fault-tolerant deployment system'],
          });
        } else {
          text = 'OK';
        }
        return { content: [{ text }] };
      }
    }
  };
}

// ─── Test runner ──────────────────────────────────────────────────────────────
console.log('\n╔══════════════════════════════════════════╗');
console.log('║      CAREER-OPS END-TO-END TEST          ║');
console.log('╚══════════════════════════════════════════╝\n');

let aiMode = 'real';

// ── STEP 1: SCAN ──────────────────────────────────────────────────────────────
console.log('STEP 1: SCAN FOR DEVOPS JOBS');
import PortalScanner from '../src/core/portalScanner.js';
const scanner = new PortalScanner();
const jobs = await scanner.scan('DevOps Engineer');
ok('Found at least 1 DevOps job', jobs.length > 0);
ok('Jobs have title', jobs[0]?.title?.length > 0);
ok('Jobs have company', jobs[0]?.company?.length > 0);
ok('Jobs have URL', jobs[0]?.url?.startsWith('http'));
ok('Jobs have location', jobs[0]?.location?.length > 0);

const job = jobs.find(j => !/canada|toronto/i.test(j.location || '')) || jobs[0];
console.log(`\n  Selected: ${job.title} @ ${job.company} (${job.location})`);
console.log(`  URL: ${job.url}\n`);

// ── STEP 2: LOAD PROFILE ──────────────────────────────────────────────────────
console.log('STEP 2: LOAD PROFILE');
import ProfileManager from '../src/core/profileManager.js';
const pm = new ProfileManager();
const profile = await pm.loadProfile();
ok('Profile loaded', !!profile?.name);
ok('Profile has tech stack', profile?.techStack?.length > 0);
ok('Profile has archetypes', profile?.archetypes?.length > 0);
console.log(`  Profile: ${profile.name}, ${profile.yearsOfExperience}yrs\n`);

// ── STEP 3: EVALUATE JOB ─────────────────────────────────────────────────────
console.log('STEP 3: EVALUATE JOB');
import JobEvaluator from '../src/core/jobEvaluator.js';

// Try real AI; fall back to stub if quota exhausted
let evaluation;
try {
  const evaluator = new JobEvaluator();
  evaluation = await evaluator.evaluate(job.url, profile);
  console.log('  (using real AI)');
} catch (e) {
  if (e.message.includes('DAILY_QUOTA') || e.message.includes('429') || e.message.includes('quota')) {
    aiMode = 'stub';
    console.log('  (AI quota exhausted — using stub for structure verification)');
    // Inject stub into evaluator
    const evaluator = new JobEvaluator();
    evaluator.client = stubAiClient();
    evaluation = await evaluator.evaluate(job.url, profile);
  } else { throw e; }
}

ok('Evaluation returned score', typeof evaluation?.overallScore === 'number');
ok('Score in valid range (1-5)', evaluation?.overallScore >= 1 && evaluation?.overallScore <= 5);
ok('Has recommendation', ['Apply','Maybe','Skip','REVIEW'].includes(evaluation?.recommendation));
ok('Has dimensions', Object.keys(evaluation?.dimensions || {}).length > 0);
ok('Saved to evaluated-jobs.json', fs.existsSync(path.join(ROOT, 'data/evaluated-jobs.json')));
console.log(`  Score: ${evaluation.overallScore} | Recommendation: ${evaluation.recommendation}\n`);

// ── STEP 4: INTERVIEW PREP ────────────────────────────────────────────────────
console.log('STEP 4: GENERATE INTERVIEW PREP PLAN');
import InterviewPrep from '../src/core/interviewPrep.js';

const prep = new InterviewPrep();
if (aiMode === 'stub') prep.client = stubAiClient();

const jobDescForPrep = `${job.title} at ${job.company}. ${job.description || ''}`;
const prepPlan = await prep.generatePrepPlan(jobDescForPrep, profile);

ok('Prep plan generated', !!prepPlan);
ok('Has focus areas', prepPlan?.focusAreas?.length > 0);
ok('Has behavioral questions', prepPlan?.behavioralQuestions?.length > 0);
ok('Has weekly plan', !!prepPlan?.weeklyPlan);
ok('Saved to data/interview-prep/', fs.readdirSync(path.join(ROOT, 'data/interview-prep')).length > 0);
console.log(`  Focus areas: ${prepPlan.focusAreas?.slice(0,2).join(', ')}\n`);

// ── STEP 5: GENERATE RESUME ───────────────────────────────────────────────────
console.log('STEP 5: GENERATE TAILORED RESUME PDF');
import ResumeGenerator from '../src/core/resumeGenerator.js';

const gen = new ResumeGenerator();
if (aiMode === 'stub') gen.client = stubAiClient();

const result = await gen.generate(jobDescForPrep, profile);
ok('Resume PDF generated', !!result?.path);
ok('Resume file exists', fs.existsSync(result.path));
ok('Resume file has content', fs.statSync(result.path).size > 1000);
ok('Keywords extracted', result?.keywords?.length > 0);
console.log(`  Resume: ${result.path}`);
console.log(`  Keywords: ${result.keywords?.slice(0,5).join(', ')}\n`);

// ── STEP 6: APPLY (SAVE) ─────────────────────────────────────────────────────
console.log('STEP 6: SAVE APPLICATION');
const applicationsPath = path.join(ROOT, 'data/applications.json');
if (!fs.existsSync(path.dirname(applicationsPath))) {
  fs.mkdirSync(path.dirname(applicationsPath), { recursive: true });
}
const applications = fs.existsSync(applicationsPath)
  ? JSON.parse(fs.readFileSync(applicationsPath, 'utf-8')) : [];

const application = {
  id: `app_${Date.now()}`,
  title: job.title,
  company: job.company,
  location: job.location,
  url: job.url,
  status: 'Applied',
  appliedAt: new Date().toISOString(),
  resumePath: result.path,
  evaluationScore: evaluation.overallScore,
  recommendation: evaluation.recommendation,
};
applications.push(application);
fs.writeFileSync(applicationsPath, JSON.stringify(applications, null, 2), 'utf-8');

ok('Application saved to applications.json', fs.existsSync(applicationsPath));
ok('Application has all fields', !!(application.title && application.company && application.url && application.resumePath));
console.log(`  Saved application ID: ${application.id}`);
console.log(`  Apply at: ${job.url}\n`);

// ── SUMMARY ───────────────────────────────────────────────────────────────────
console.log('══════════════════════════════════════════');
console.log(`  RESULTS: ${passed} passed, ${failed} failed`);
console.log(`  AI mode: ${aiMode === 'stub' ? 'STUB (Gemini quota exhausted — add GROQ_API_KEY for free 100 RPD)' : 'REAL AI ✓'}`);
if (failed === 0) {
  console.log('\n  ✓ All pipeline steps working correctly!');
} else {
  console.log('\n  ✗ Some steps failed — check output above');
}
console.log('══════════════════════════════════════════\n');
process.exit(failed > 0 ? 1 : 0);
