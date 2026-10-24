import { describe, expect, it } from 'vitest';
import { sanitizePastedHtmlFragment } from './paste-sanitize.ts';

describe('sanitizePastedHtmlFragment', () => {
  it('strips script tags and event handlers from pasted HTML', () => {
    const pasted = '<p onclick="alert(1)">hola</p><script>alert(1)</script>';
    const safe = sanitizePastedHtmlFragment(pasted, 'notas/ejemplo.html');
    expect(safe.toLowerCase()).not.toContain('<script');
    expect(safe).not.toContain('onclick');
    expect(safe).toContain('hola');
  });

  it('rejects javascript: URLs in links', () => {
    const pasted = '<p><a href="javascript:alert(1)">x</a></p>';
    const safe = sanitizePastedHtmlFragment(pasted, 'notas/ejemplo.html');
    expect(safe).not.toContain('javascript:');
  });
});
