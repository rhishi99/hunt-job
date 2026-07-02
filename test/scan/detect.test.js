import { describe, test, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/core/scan/httpClient.js', () => ({ fetchText: vi.fn() }));

import { fetchText } from '../../src/core/scan/httpClient.js';
import { detectFromUrl, detectFromPage, detect } from '../../src/core/scan/detect.js';

beforeEach(() => {
  fetchText.mockReset();
});

describe('detectFromUrl (plan §2.3 URL regex)', () => {
  test('greenhouse — job-boards subdomain + slug', () => {
    expect(detectFromUrl('https://job-boards.greenhouse.io/gitlab/jobs/8503792002'))
      .toEqual({ platform: 'greenhouse', token: 'gitlab', method: 'url' });
  });

  test('lever', () => {
    expect(detectFromUrl('https://jobs.lever.co/paytm/0d0deb25-be58-4245-8efa-715bc2e61a7a'))
      .toEqual({ platform: 'lever', token: 'paytm', method: 'url' });
  });

  test('ashby', () => {
    expect(detectFromUrl('https://jobs.ashbyhq.com/openai/00207abc-49b7-465c-a219-f7c1140f8047'))
      .toEqual({ platform: 'ashby', token: 'openai', method: 'url' });
  });

  test('smartrecruiters — careers subdomain', () => {
    expect(detectFromUrl('https://careers.smartrecruiters.com/Visa/sr-manager-744000133907678'))
      .toEqual({ platform: 'smartrecruiters', token: 'Visa', method: 'url' });
  });

  test('recruitee', () => {
    expect(detectFromUrl('https://shypple.recruitee.com/o/work-student-sales-german-speaking-1'))
      .toEqual({ platform: 'recruitee', token: 'shypple', method: 'url' });
  });

  test('workable — apply subdomain', () => {
    expect(detectFromUrl('https://apply.workable.com/shypple/j/ABC123/'))
      .toEqual({ platform: 'workable', token: 'shypple', method: 'url' });
  });

  test('workable — company subdomain', () => {
    expect(detectFromUrl('https://shypple.workable.com/j/ABC123/'))
      .toEqual({ platform: 'workable', token: 'shypple', method: 'url' });
  });

  test('workday is detected (low-reliability platform — no scan provider yet)', () => {
    const r = detectFromUrl('https://company.wd5.myworkdayjobs.com/en-US/careers');
    expect(r.platform).toBe('workday');
    expect(r.method).toBe('url');
  });

  test('unrecognized host returns null', () => {
    expect(detectFromUrl('https://careers.somecompany.com/jobs')).toBeNull();
  });

  test('null/empty url returns null', () => {
    expect(detectFromUrl('')).toBeNull();
    expect(detectFromUrl(null)).toBeNull();
  });
});

describe('detectFromPage (DOM fingerprint fallback)', () => {
  test('finds a Lever fingerprint in fetched HTML', async () => {
    fetchText.mockResolvedValueOnce('<html><script>window.Lever = {}</script></html>');
    expect(await detectFromPage('https://careers.example.com')).toEqual({ platform: 'lever', token: null, method: 'dom' });
  });

  test('returns null when fetchText throws', async () => {
    fetchText.mockRejectedValueOnce(new Error('timeout'));
    expect(await detectFromPage('https://careers.example.com')).toBeNull();
  });

  test('returns null when no fingerprint matches', async () => {
    fetchText.mockResolvedValueOnce('<html>nothing recognizable here</html>');
    expect(await detectFromPage('https://careers.example.com')).toBeNull();
  });
});

describe('detect (combined)', () => {
  test('prefers URL detection over a page fetch', async () => {
    const r = await detect('https://jobs.lever.co/paytm/abc');
    expect(r.method).toBe('url');
    expect(fetchText).not.toHaveBeenCalled();
  });

  test('falls back to DOM fingerprinting when the URL is unrecognized', async () => {
    fetchText.mockResolvedValueOnce('<html>window._grnhse boards.greenhouse.io</html>');
    const r = await detect('https://careers.example.com');
    expect(r.platform).toBe('greenhouse');
    expect(r.method).toBe('dom');
  });

  test('returns platform: null when nothing matches at all', async () => {
    fetchText.mockResolvedValueOnce('<html>nothing</html>');
    expect(await detect('https://careers.example.com')).toEqual({ platform: null, token: null, method: 'none' });
  });
});
