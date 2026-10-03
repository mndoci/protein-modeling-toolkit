import { describe, expect, it } from 'vitest';
import { COLOR_SCHEMES, REPRESENTATIONS, buildStyle } from './styles';

describe('buildStyle', () => {
  it('maps each representation to the matching 3Dmol style key', () => {
    for (const rep of REPRESENTATIONS) {
      expect(Object.keys(buildStyle(rep, 'chain'))).toEqual([rep]);
    }
  });

  it('maps colour schemes to 3Dmol colour options', () => {
    expect(buildStyle('cartoon', 'chain')).toEqual({ cartoon: { colorscheme: 'chain' } });
    expect(buildStyle('cartoon', 'secondary')).toEqual({ cartoon: { colorscheme: 'ssJmol' } });
    expect(buildStyle('cartoon', 'spectrum')).toEqual({ cartoon: { color: 'spectrum' } });
  });

  it('keeps representation-specific sizing alongside the colour', () => {
    expect(buildStyle('stick', 'spectrum')).toEqual({ stick: { radius: 0.2, color: 'spectrum' } });
    expect(buildStyle('sphere', 'chain')).toEqual({ sphere: { scale: 0.9, colorscheme: 'chain' } });
    expect(buildStyle('line', 'secondary')).toEqual({ line: { linewidth: 1, colorscheme: 'ssJmol' } });
  });

  it('covers every combination', () => {
    expect(REPRESENTATIONS.length * COLOR_SCHEMES.length).toBe(12);
    for (const rep of REPRESENTATIONS) {
      for (const scheme of COLOR_SCHEMES) {
        expect(buildStyle(rep, scheme)[rep]).toBeTypeOf('object');
      }
    }
  });
});
