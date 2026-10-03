import { describe, expect, it } from 'vitest';
import {
  CHAIN_COLORS,
  COLOR_SCHEMES,
  DEFAULT_DISPLAY,
  NUCLEOTIDE_RESN,
  REPRESENTATIONS,
  SS_COLORS,
  buildStyle,
  buildStyleOps,
  chainColor,
  ssColor,
  type DisplayOptions,
} from './styles';

const opts = (patch: Partial<DisplayOptions> = {}): DisplayOptions => ({ ...DEFAULT_DISPLAY, ...patch });

/** The colour a built style would give an atom. */
function paint(style: Record<string, unknown>, rep: string, atom: object): unknown {
  const spec = style[rep] as { colorfunc: (a: object) => string };
  return spec.colorfunc(atom);
}

describe('ssColor', () => {
  it('maps helix, sheet and coil codes to the palette', () => {
    expect(ssColor('h')).toBe(SS_COLORS.helix);
    expect(ssColor('s')).toBe(SS_COLORS.sheet);
    expect(ssColor('c')).toBe(SS_COLORS.coil);
  });

  it("colours 3Dmol's internal arrow and tube codes like their parent element", () => {
    // Without this, every arrowhead renders in the coil colour.
    expect(ssColor('arrow start')).toBe(SS_COLORS.sheet);
    expect(ssColor('arrow end')).toBe(SS_COLORS.sheet);
    expect(ssColor('tube start')).toBe(SS_COLORS.helix);
  });

  it('falls back to coil for atoms with no secondary structure', () => {
    expect(ssColor(undefined)).toBe(SS_COLORS.coil);
    expect(ssColor('')).toBe(SS_COLORS.coil);
  });

  it('uses three distinct colours', () => {
    expect(new Set(Object.values(SS_COLORS)).size).toBe(3);
  });
});

describe('chainColor', () => {
  const chains = ['A', 'B', 'C'];

  it('gives each chain its own colour, in file order', () => {
    expect(chainColor('A', chains)).toBe(CHAIN_COLORS[0]);
    expect(chainColor('B', chains)).toBe(CHAIN_COLORS[1]);
    expect(chainColor('C', chains)).toBe(CHAIN_COLORS[2]);
  });

  it('wraps around when there are more chains than colours', () => {
    const many = Array.from({ length: CHAIN_COLORS.length + 2 }, (_, i) => `c${i}`);
    expect(chainColor(many[CHAIN_COLORS.length], many)).toBe(CHAIN_COLORS[0]);
  });

  it('does not throw for an unknown or missing chain', () => {
    expect(chainColor('Z', chains)).toBe(CHAIN_COLORS[0]);
    expect(chainColor(undefined, chains)).toBe(CHAIN_COLORS[0]);
    expect(chainColor('A', [])).toBe(CHAIN_COLORS[0]);
  });
});

describe('buildStyle', () => {
  it('maps each representation to the matching 3Dmol style key', () => {
    for (const rep of REPRESENTATIONS) {
      expect(Object.keys(buildStyle(rep, 'chain'))).toEqual([rep]);
    }
  });

  it('draws a polished cartoon: oval cross-section, strand arrows, moderate thickness', () => {
    expect(buildStyle('cartoon', 'spectrum')).toEqual({
      cartoon: { style: 'oval', arrows: true, thickness: 0.3, color: 'spectrum' },
    });
  });

  it('colours by secondary structure through the palette', () => {
    const style = buildStyle('cartoon', 'secondary');
    expect(paint(style, 'cartoon', { ss: 'h' })).toBe(SS_COLORS.helix);
    expect(paint(style, 'cartoon', { ss: 'arrow start' })).toBe(SS_COLORS.sheet);
  });

  it('colours by chain in the order the chains were given', () => {
    const style = buildStyle('stick', 'chain', ['B', 'A']);
    expect(paint(style, 'stick', { chain: 'B' })).toBe(CHAIN_COLORS[0]);
    expect(paint(style, 'stick', { chain: 'A' })).toBe(CHAIN_COLORS[1]);
  });

  it('keeps representation-specific sizing alongside the colour', () => {
    expect(buildStyle('stick', 'spectrum')).toEqual({ stick: { radius: 0.2, color: 'spectrum' } });
    expect(buildStyle('sphere', 'spectrum')).toEqual({ sphere: { scale: 0.9, color: 'spectrum' } });
    expect(buildStyle('line', 'spectrum')).toEqual({ line: { linewidth: 1, color: 'spectrum' } });
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

describe('buildStyleOps', () => {
  it('always starts by setting the main style on everything', () => {
    for (const rep of REPRESENTATIONS) {
      const [first] = buildStyleOps(opts({ representation: rep }));
      expect(first.mode).toBe('set');
      expect(first.sel).toEqual({});
      expect(Object.keys(first.style)).toEqual([rep]);
    }
  });

  it('hides water by default and shows it as small blue spheres on request', () => {
    const hidden = buildStyleOps(opts()).at(-1)!;
    expect(hidden).toEqual({ mode: 'set', sel: { resn: ['HOH', 'WAT', 'DOD'] }, style: {} });

    const shown = buildStyleOps(opts({ showWater: true })).at(-1)!;
    expect(shown.style).toEqual({ sphere: { radius: 0.3, color: '#5aa9e6' } });
  });

  it('layers ligands over the cartoon as ball-and-stick, leaving the cartoon in place', () => {
    const ligands = buildStyleOps(opts()).find((o) => o.sel.hetflag === true)!;
    expect(ligands.mode).toBe('add'); // "add" keeps the cartoon on modified residues
    expect(Object.keys(ligands.style).sort()).toEqual(['sphere', 'stick']);
    expect(ligands.sel).toEqual({ hetflag: true, not: { resn: ['HOH', 'WAT', 'DOD', 'MSE'] } });
  });

  it('does not treat selenomethionine or water as a ligand', () => {
    const ligands = buildStyleOps(opts()).find((o) => o.sel.hetflag === true)!;
    const excluded = (ligands.sel.not as { resn: string[] }).resn;
    expect(excluded).toEqual(expect.arrayContaining(['MSE', 'HOH']));
  });

  it('omits the ligand layer when ligands are off', () => {
    const ops = buildStyleOps(opts({ showLigands: false }));
    expect(ops.some((o) => o.sel.hetflag === true)).toBe(false);
  });

  it('in non-cartoon styles, clears ligands when off instead of adding a layer when on', () => {
    const on = buildStyleOps(opts({ representation: 'stick' }));
    expect(on.some((o) => o.sel.hetflag === true)).toBe(false); // stick already draws them

    const off = buildStyleOps(opts({ representation: 'stick', showLigands: false }));
    const clear = off.find((o) => o.sel.hetflag === true)!;
    expect(clear).toMatchObject({ mode: 'set', style: {} });
  });

  it('draws nucleic-acid bases as sticks in cartoon view only, never the backbone', () => {
    const bases = buildStyleOps(opts()).find((o) => o.sel.resn === NUCLEOTIDE_RESN)!;
    expect(bases.mode).toBe('add');
    const skipped = (bases.sel.not as { atom: string[] }).atom;
    expect(skipped).toEqual(expect.arrayContaining(['P', "O5'", "C3'", "C1'"]));
    expect(skipped).not.toContain('N9'); // base atoms must stay selected
    expect(skipped).not.toContain('N1');

    const stick = buildStyleOps(opts({ representation: 'stick' }));
    expect(stick.some((o) => o.sel.resn === NUCLEOTIDE_RESN)).toBe(false);
  });

  it('recognises DNA and RNA residue names', () => {
    expect(NUCLEOTIDE_RESN).toEqual(expect.arrayContaining(['DA', 'DC', 'DG', 'DT', 'A', 'U']));
  });
});
