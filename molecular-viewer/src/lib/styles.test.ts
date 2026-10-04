import { describe, expect, it } from 'vitest';
import {
  CHAIN_COLORS,
  COLOR_SCHEMES,
  DEFAULT_DISPLAY,
  LIGAND_ELEMENT_COLORS,
  LIGAND_STICKS,
  NUCLEOTIDE_RESN,
  REPRESENTATIONS,
  SS_COLORS,
  buildStyle,
  buildStyleOps,
  buildSurface,
  chainColor,
  ligandColor,
  spectrumColor,
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

/** The 3Dmol style key a representation draws with; a surface sits over a cartoon. */
const styleKey = (rep: string) => (rep === 'surface' ? 'cartoon' : rep);

describe('spectrumColor', () => {
  it('runs purple at the N terminus to red at the C terminus, like 3Dmol cartoons', () => {
    const n = spectrumColor(0);
    const c = spectrumColor(1);
    expect(n).toMatch(/^#[0-9a-f]{6}$/);
    // Purple: red and blue both well above green. Red: red dominant.
    const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
    const [nr, ng, nb] = rgb(n);
    expect(nr).toBeGreaterThan(ng);
    expect(nb).toBeGreaterThan(ng);
    const [cr, cg, cb] = rgb(c);
    expect(cr).toBeGreaterThan(200);
    expect(cg).toBeLessThan(120);
    expect(cb).toBeLessThan(120);
  });

  it('clamps out-of-range fractions', () => {
    expect(spectrumColor(-1)).toBe(spectrumColor(0));
    expect(spectrumColor(2)).toBe(spectrumColor(1));
  });
});

describe('ligandColor', () => {
  it('uses grey carbons with red oxygen and blue nitrogen, case-insensitively', () => {
    expect(ligandColor('C')).toBe(LIGAND_ELEMENT_COLORS.C);
    expect(ligandColor('o')).toBe(LIGAND_ELEMENT_COLORS.O);
    expect(ligandColor('Fe')).toBe(LIGAND_ELEMENT_COLORS.FE);
  });

  it('falls back to one colour for unknown or missing elements', () => {
    expect(ligandColor('XX')).toBe(ligandColor(undefined));
    expect(Object.values(LIGAND_ELEMENT_COLORS)).not.toContain(ligandColor('XX'));
  });
});

describe('buildStyle', () => {
  it('maps each representation to the matching 3Dmol style key', () => {
    for (const rep of REPRESENTATIONS) {
      expect(Object.keys(buildStyle(rep, 'chain'))).toEqual([styleKey(rep)]);
    }
  });

  it('spells out rainbow colours outside cartoons, which 3Dmol cannot do itself', () => {
    const style = buildStyle('stick', 'spectrum', [], [10, 20]);
    expect(paint(style, 'stick', { resi: 10 })).toBe(spectrumColor(0));
    expect(paint(style, 'stick', { resi: 15 })).toBe(spectrumColor(0.5));
    expect(paint(style, 'stick', { resi: 20 })).toBe(spectrumColor(1));
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
    const fn = expect.any(Function);
    expect(buildStyle('stick', 'chain')).toEqual({ stick: { radius: 0.2, colorfunc: fn } });
    expect(buildStyle('sphere', 'chain')).toEqual({ sphere: { scale: 0.9, colorfunc: fn } });
    expect(buildStyle('line', 'chain')).toEqual({ line: { linewidth: 1, colorfunc: fn } });
  });

  it('covers every combination', () => {
    expect(REPRESENTATIONS.length * COLOR_SCHEMES.length).toBe(15);
    for (const rep of REPRESENTATIONS) {
      for (const scheme of COLOR_SCHEMES) {
        expect(buildStyle(rep, scheme)[styleKey(rep)]).toBeTypeOf('object');
      }
    }
  });
});

describe('buildSurface', () => {
  it('is only drawn for the surface style', () => {
    for (const rep of REPRESENTATIONS.filter((r) => r !== 'surface')) {
      expect(buildSurface(opts({ representation: rep }))).toBeNull();
    }
  });

  it('is a translucent polymer-only surface in the active colours', () => {
    const s = buildSurface(opts({ representation: 'surface', colorScheme: 'chain' }), ['A', 'B'])!;
    expect(s.sel).toEqual({ hetflag: false }); // ligands stay visible in their pockets
    expect(s.style.opacity).toBeGreaterThan(0.5);
    expect(s.style.opacity).toBeLessThan(1);
    const color = (s.style.colorfunc as (a: object) => string)({ chain: 'B' });
    expect(color).toBe(CHAIN_COLORS[1]);
  });

  it('rainbow-colours a surface across the residue range', () => {
    const s = buildSurface(opts({ representation: 'surface', colorScheme: 'spectrum' }), [], [1, 101])!;
    const color = s.style.colorfunc as (a: object) => string;
    expect(color({ resi: 1 })).toBe(spectrumColor(0));
    expect(color({ resi: 101 })).toBe(spectrumColor(1));
  });
});

describe('buildStyleOps', () => {
  it('always starts by setting the main style on everything', () => {
    for (const rep of REPRESENTATIONS) {
      const [first] = buildStyleOps(opts({ representation: rep }));
      expect(first.mode).toBe('set');
      expect(first.sel).toEqual({});
      expect(Object.keys(first.style)).toEqual([styleKey(rep)]);
    }
  });

  it('hides water by default and shows it as small blue spheres on request', () => {
    const hidden = buildStyleOps(opts()).at(-1)!;
    expect(hidden).toEqual({ mode: 'set', sel: { resn: ['HOH', 'WAT', 'DOD'] }, style: {} });

    const shown = buildStyleOps(opts({ showWater: true })).at(-1)!;
    expect(shown.style).toEqual({ sphere: { radius: 0.3, color: '#5aa9e6' } });
  });

  it('draws ligands over the cartoon as ball-and-stick in element colours', () => {
    const ligands = buildStyleOps(opts()).find((o) => o.sel.hetflag === true)!;
    expect(ligands.mode).toBe('set');
    expect(ligands.style).toBe(LIGAND_STICKS);
    expect(ligands.sel).toEqual({ hetflag: true, not: { resn: ['HOH', 'WAT', 'DOD', 'MSE'] } });
    expect(paint(ligands.style, 'stick', { elem: 'O' })).toBe(LIGAND_ELEMENT_COLORS.O);
    expect(paint(ligands.style, 'sphere', { elem: 'N' })).toBe(LIGAND_ELEMENT_COLORS.N);
  });

  it('treats the surface style like a cartoon underneath', () => {
    const cartoon = buildStyleOps(opts()).map((o) => [o.mode, o.sel]);
    const surface = buildStyleOps(opts({ representation: 'surface' })).map((o) => [o.mode, o.sel]);
    expect(surface).toEqual(cartoon);
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

  it('in non-cartoon styles, keeps the style but recolours ligands, and clears them when off', () => {
    const on = buildStyleOps(opts({ representation: 'stick', colorScheme: 'chain' }));
    const recolor = on.find((o) => o.sel.hetflag === true)!;
    expect(recolor.mode).toBe('set');
    expect(Object.keys(recolor.style)).toEqual(['stick']);
    expect(recolor.style.stick).toMatchObject({ radius: 0.2 });
    expect(paint(recolor.style, 'stick', { elem: 'C' })).toBe(LIGAND_ELEMENT_COLORS.C);

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
