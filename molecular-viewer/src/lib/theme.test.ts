import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { THEME_STORAGE_KEY, VIEWER_BACKGROUND, applyTheme, getInitialTheme, saveTheme } from './theme';

function mockPrefersDark(dark: boolean) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({ matches: dark && query.includes('dark'), media: query })),
  );
}

beforeEach(() => {
  window.localStorage.clear();
  delete document.documentElement.dataset.theme;
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('getInitialTheme', () => {
  it('follows the operating-system preference when nothing is saved', () => {
    mockPrefersDark(true);
    expect(getInitialTheme()).toBe('dark');
    mockPrefersDark(false);
    expect(getInitialTheme()).toBe('light');
  });

  it('prefers a saved choice over the operating system', () => {
    mockPrefersDark(true);
    window.localStorage.setItem(THEME_STORAGE_KEY, 'light');
    expect(getInitialTheme()).toBe('light');
    mockPrefersDark(false);
    window.localStorage.setItem(THEME_STORAGE_KEY, 'dark');
    expect(getInitialTheme()).toBe('dark');
  });

  it('ignores a corrupt saved value', () => {
    mockPrefersDark(false);
    window.localStorage.setItem(THEME_STORAGE_KEY, 'purple');
    expect(getInitialTheme()).toBe('light');
  });

  it('falls back to light when matchMedia is unavailable', () => {
    vi.stubGlobal('matchMedia', undefined);
    expect(getInitialTheme()).toBe('light');
  });

  it('survives localStorage throwing', () => {
    mockPrefersDark(true);
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(getInitialTheme()).toBe('dark');
  });
});

describe('applyTheme / saveTheme', () => {
  it('applyTheme sets the data-theme attribute without saving anything', () => {
    applyTheme('dark');
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBeNull();
    applyTheme('light');
    expect(document.documentElement.dataset.theme).toBe('light');
  });

  it('saveTheme remembers an explicit choice', () => {
    saveTheme('dark');
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark');
  });

  it('saveTheme does not throw when storage is unavailable', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota');
    });
    expect(() => saveTheme('dark')).not.toThrow();
  });
});

describe('VIEWER_BACKGROUND', () => {
  it('has a light and a clearly different dark background', () => {
    expect(VIEWER_BACKGROUND.light).toBe('#ffffff');
    expect(VIEWER_BACKGROUND.dark).not.toBe(VIEWER_BACKGROUND.light);
  });
});
