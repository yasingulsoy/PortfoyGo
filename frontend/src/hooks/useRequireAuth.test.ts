import { describe, expect, it, vi } from 'vitest';

// Hook modülü Next router ve AuthContext'i içe aktarır; saf fonksiyonu test ederken bunları taklit et.
vi.mock('next/navigation', () => ({ usePathname: () => '/', useRouter: () => ({ replace: () => undefined }) }));
vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ user: null, loading: false }) }));

const { safeRedirect } = await import('./useRequireAuth');

describe('safeRedirect', () => {
  it.each([
    ['/portfolio', '/portfolio'],
    ['/markets?tab=crypto#top', '/markets?tab=crypto#top'],
    ['/', '/'],
  ])('allows same-site path %s', (input, expected) => {
    expect(safeRedirect(input)).toBe(expected);
  });

  it.each([
    'javascript:alert(1)',
    'JavaScript:alert(1)',
    '//evil.com',
    '//evil.com/path',
    '/\\evil.com',
    '/\\/evil.com',
    'https://evil.com',
    'evil.com',
    ' /portfolio',
    'data:text/html,hi',
  ])('rejects %s', (input) => {
    expect(safeRedirect(input)).toBe('/');
  });

  it('returns the fallback for empty input', () => {
    expect(safeRedirect(null)).toBe('/');
    expect(safeRedirect(undefined, '/home')).toBe('/home');
    expect(safeRedirect('', '/home')).toBe('/home');
  });
});
