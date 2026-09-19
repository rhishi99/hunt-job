import { describe, it, expect } from 'vitest';
import { makeJobSlug } from '../src/core/jobDocs.js';

describe('makeJobSlug (B-28)', () => {
  it('prefers the job row over JD text', () => {
    const slug = makeJobSlug('Company: Wrong\nPosition: Wrong', { company: 'Stripe', title: 'Staff SRE' });
    expect(slug.startsWith('Stripe_Staff-SRE_')).toBe(true);
  });

  it('falls back to JD lines, then to Unknown placeholders', () => {
    expect(makeJobSlug('Company: Acme\nPosition: DevOps').startsWith('Acme_DevOps_')).toBe(true);
    expect(makeJobSlug('just text').startsWith('Unknown-Company_Unknown-Role_')).toBe(true);
  });
});
