import { describe, test, expect } from 'vitest';
import ResumeGenerator from '../src/core/resumeGenerator.js';
import { defaultResumeData, fromProfile, mergeTailored, esc } from '../src/core/resumeData.js';

describe('_extractBalancedArray', () => {
  const rg = new ResumeGenerator();

  test('extracts a simple flat array', () => {
    const result = rg._extractBalancedArray('some text ["a", "b"] more');
    expect(result).toBe('["a", "b"]');
    expect(JSON.parse(result)).toEqual(['a', 'b']);
  });

  test('extracts an array containing nested arrays without stopping early', () => {
    const text = 'prefix [["a","b"], ["c","d"]] suffix';
    const result = rg._extractBalancedArray(text);
    expect(result).toBe('[["a","b"], ["c","d"]]');
    expect(JSON.parse(result)).toEqual([['a', 'b'], ['c', 'd']]);
  });

  test('extracts array from prose-wrapped model output', () => {
    const text = 'Here are the top keywords for this role:\n["Python", "AWS", "Docker"]\nLet me know if you need more.';
    const result = rg._extractBalancedArray(text);
    expect(JSON.parse(result)).toEqual(['Python', 'AWS', 'Docker']);
  });

  test('returns null when there is no opening bracket', () => {
    expect(rg._extractBalancedArray('no array here')).toBeNull();
  });

  test('returns null when the closing bracket is missing (truncated response)', () => {
    expect(rg._extractBalancedArray('some text ["a", "b"')).toBeNull();
  });
});

describe('esc', () => {
  test('escapes HTML metacharacters', () => {
    expect(esc('Supported <10 & "many" >5 services'))
      .toBe('Supported &lt;10 &amp; &quot;many&quot; &gt;5 services');
  });
  test('coerces nullish to empty string', () => {
    expect(esc(null)).toBe('');
    expect(esc(undefined)).toBe('');
  });
});

describe('fromProfile', () => {
  test('maps a profile.yml-shaped object onto the canonical resume shape', () => {
    const r = fromProfile({
      name: 'Jane Doe',
      currentRole: 'SRE',
      email: 'j@x.com',
      experience: [{ title: 'SRE', company: 'Acme', startDate: '2020', endDate: '2023', description: 'Ran clusters. Cut costs.' }],
      education: [{ degree: 'BE', field: 'CS', school: 'MIT', year: '2018' }],
      certifications: ['CKA'],
      techStack: ['Go'],
      skills: ['SQL'],
    });
    expect(r.name).toBe('Jane Doe');
    expect(r.title).toBe('SRE');
    expect(r.contact.email).toBe('j@x.com');
    expect(r.experience[0].period).toBe('2020 – 2023');
    expect(r.experience[0].bullets).toEqual(['Ran clusters.', 'Cut costs.']);
    expect(r.education[0]).toEqual({ degree: 'BE in CS', institution: 'MIT', period: '2018' });
    expect(r.certificates[0]).toEqual({ name: 'CKA', period: '', desc: '' });
    expect(r.skills).toEqual(['Go', 'SQL']);
  });

  test('never throws on empty / missing input', () => {
    expect(() => fromProfile()).not.toThrow();
    expect(() => fromProfile({})).not.toThrow();
    expect(fromProfile({}).experience).toEqual([]);
  });
});

describe('mergeTailored', () => {
  test('overrides summary and reorders skills but never adds experience entries', () => {
    const base = defaultResumeData();
    const out = mergeTailored(base, {
      summary: 'Tailored.',
      skills: ['Kubernetes', 'AWS'],
      experience: [
        { company: 'CDK Global India Pvt. Ltd.', bullets: ['Shorter bullet.'] },
        { company: 'Ghost Corp', bullets: ['should be ignored'] },
      ],
    });
    expect(out.summary).toBe('Tailored.');
    expect(out.skills).toEqual(['Kubernetes', 'AWS']);
    expect(out.experience).toHaveLength(base.experience.length);
    expect(out.experience[0].bullets).toEqual(['Shorter bullet.']);
    expect(out.experience.some(j => j.company === 'Ghost Corp')).toBe(false);
  });

  test('empty tailored partial leaves the base untouched', () => {
    const base = defaultResumeData();
    expect(mergeTailored(base, {})).toEqual(base);
  });
});

describe('renderHtml', () => {
  const rg = new ResumeGenerator();
  const html = rg.renderHtml(defaultResumeData());

  test('renders every section the canonical shape carries', () => {
    expect(html).toContain('>Professional Experience<');
    expect(html).toContain('>Education<');
    expect(html).toContain('>Languages<');
    expect(html).toContain('>Interests<');
    expect(html).toContain('>Certifications<');
  });
  test('renders certificate objects, not [object Object]', () => {
    expect(html).toContain('SAFe 5.0 Scrum Master');
    expect(html).not.toContain('[object Object]');
  });
  test('renders per-job description and location', () => {
    expect(html).toContain('automotive retail industry');
    expect(html).toContain('CDK Global India Pvt. Ltd., Pune');
  });
  test('drops the invented "N+ Years Experience" line', () => {
    expect(html).not.toMatch(/Years Experience/);
  });
  test('escapes interpolated field values', () => {
    const evil = defaultResumeData();
    evil.name = 'A <script>x</script> B';
    expect(rg.renderHtml(evil)).toContain('A &lt;script&gt;x&lt;/script&gt; B');
  });
});
