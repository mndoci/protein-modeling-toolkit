/** Map the UI's style / colour choices onto 3Dmol.js style operations. */

export const REPRESENTATIONS = ['cartoon', 'stick', 'sphere', 'line', 'surface'] as const;
export type Representation = (typeof REPRESENTATIONS)[number];

export const COLOR_SCHEMES = ['chain', 'secondary', 'spectrum'] as const;
export type ColorScheme = (typeof COLOR_SCHEMES)[number];

export const REPRESENTATION_LABELS: Record<Representation, string> = {
  cartoon: 'Cartoon',
  stick: 'Stick',
  sphere: 'Sphere',
  line: 'Line',
  surface: 'Surface',
};

/** Short labels for the display bar's colour buttons. */
export const COLOR_SCHEME_LABELS: Record<ColorScheme, string> = {
  chain: 'Chain',
  secondary: 'Structure',
  spectrum: 'Rainbow',
};

/** Longer names, used for the legend heading and button tooltips. */
export const COLOR_SCHEME_TITLES: Record<ColorScheme, string> = {
  chain: 'By chain',
  secondary: 'By secondary structure',
  spectrum: 'Rainbow (N to C)',
};

/** Everything the user can change about how a loaded structure is drawn. */
export interface DisplayOptions {
  representation: Representation;
  colorScheme: ColorScheme;
  /** Draw non-water HETATM groups (cofactors, inhibitors, ions) as ball-and-stick. */
  showLigands: boolean;
  showWater: boolean;
}

export const DEFAULT_DISPLAY: DisplayOptions = {
  representation: 'cartoon',
  colorScheme: 'secondary',
  showLigands: true,
  showWater: false,
};

// --- Palettes -------------------------------------------------------------
// Chosen to read well on both the light and the dark viewer background.

export const SS_COLORS = {
  helix: '#e4572e',
  sheet: '#f2b134',
  coil: '#8d99a6',
} as const;

export const CHAIN_COLORS = [
  '#4e9af1',
  '#f28e2b',
  '#59c99a',
  '#e15759',
  '#b07aa1',
  '#edc948',
  '#76b7b2',
  '#ff9da7',
] as const;

export const WATER_COLOR = '#5aa9e6';

/**
 * Ligand colours by element: neutral grey carbons with the conventional
 * red oxygen / blue nitrogen, so cofactors stand out from the protein
 * without the default neon green.
 */
export const LIGAND_ELEMENT_COLORS: Record<string, string> = {
  C: '#b4bdc8',
  N: '#4f7cf0',
  O: '#e5484d',
  S: '#e8c547',
  P: '#f0913a',
  FE: '#d9772b',
  ZN: '#7d80b0',
  MG: '#62c46b',
  CA: '#62c46b',
  CL: '#3fbf7f',
};
const LIGAND_OTHER_COLOR = '#c08bd8';

export function ligandColor(elem: string | undefined): string {
  return LIGAND_ELEMENT_COLORS[(elem ?? '').toUpperCase()] ?? LIGAND_OTHER_COLOR;
}

/**
 * Colour for an atom's secondary-structure code. 3Dmol tags the residues that
 * form the head of a sheet arrow or the start of a helix tube with internal
 * codes, so those must map to the same colour as the rest of the element or
 * the arrowheads come out grey.
 */
export function ssColor(ss: string | undefined): string {
  switch (ss) {
    case 'h':
    case 'tube start':
      return SS_COLORS.helix;
    case 's':
    case 'arrow start':
    case 'arrow end':
      return SS_COLORS.sheet;
    default:
      return SS_COLORS.coil;
  }
}

/** Colour for a chain, stable for a given chain order. */
export function chainColor(chain: string | undefined, chains: readonly string[]): string {
  const index = chain === undefined ? -1 : chains.indexOf(chain);
  return CHAIN_COLORS[(index < 0 ? 0 : index) % CHAIN_COLORS.length];
}

const hex2 = (v: number) => Math.floor(v).toString(16).padStart(2, '0');

/**
 * The colour 3Dmol's cartoon `color: 'spectrum'` gives at fraction `t` of the
 * way from the N terminus (0) to the C terminus (1): its "sinebow" gradient,
 * run in reverse. Reproduced here so the legend and the surface match the
 * cartoon exactly (purple, blue, green, yellow, red).
 */
export function spectrumColor(t: number): string {
  const scale = 1 - Math.min(1, Math.max(0, t));
  const h = (5 * scale) / 6 + 0.5;
  const channel = (offset: number) => Math.sin(Math.PI * (h + offset)) ** 2 * 255;
  // 3Dmol packs the second and third channels in swapped order; so do we.
  return `#${hex2(channel(0))}${hex2(channel(2 / 3))}${hex2(channel(1 / 3))}`;
}

// --- Style operations -----------------------------------------------------

/** One step applied to the viewer, in order: `set` replaces, `add` layers on top. */
export interface StyleOp {
  mode: 'set' | 'add';
  sel: Record<string, unknown>;
  style: Record<string, unknown>;
}

const WATER_RESN = ['HOH', 'WAT', 'DOD'];
/** Residue names of DNA and RNA nucleotides as they appear in ATOM records. */
export const NUCLEOTIDE_RESN = ['DA', 'DC', 'DG', 'DT', 'DU', 'DI', 'A', 'C', 'G', 'U', 'I'];
/** Sugar-phosphate backbone atoms; what remains of a nucleotide is its base. */
const NUCLEOTIDE_BACKBONE_ATOMS = [
  'P', 'OP1', 'OP2', 'O1P', 'O2P', "O5'", "C5'", "C4'", "O4'", "C3'", "O3'", "C2'", "O2'", "C1'",
];

/**
 * Selenomethionine (MSE) is a normal residue that crystallographers label as
 * HETATM; treating it as a ligand would scatter stray sticks over the protein.
 */
export const NOT_LIGAND_RESN = [...WATER_RESN, 'MSE'];
export { WATER_RESN };

const HET_NOT_WATER = { hetflag: true, not: { resn: NOT_LIGAND_RESN } };

/** Residue-number range of the polymer, for rainbow colouring a surface. */
export type ResidueRange = readonly [number, number];

/** 3Dmol colour options for one scheme. */
function colorSpec(
  scheme: ColorScheme,
  chains: readonly string[],
  range?: ResidueRange,
): Record<string, unknown> {
  switch (scheme) {
    case 'chain':
      return { colorfunc: (atom: { chain?: string }) => chainColor(atom.chain, chains) };
    case 'secondary':
      return { colorfunc: (atom: { ss?: string }) => ssColor(atom.ss) };
    case 'spectrum':
      if (!range) return { color: 'spectrum' };
      // Only cartoons understand 'spectrum'; everything else needs the colours spelled out.
      return {
        colorfunc: (atom: { resi?: number }) => {
          const span = range[1] - range[0];
          return spectrumColor(span > 0 ? ((atom.resi ?? range[0]) - range[0]) / span : 0);
        },
      };
  }
}

const cartoonStyle = (color: Record<string, unknown>) => ({
  // Oval cross-section gives round coils, arrows mark strand direction.
  cartoon: { style: 'oval', arrows: true, thickness: 0.3, ...color },
});

/**
 * The AtomStyleSpec for the main representation. `range` is needed for
 * rainbow colouring of anything but a cartoon: 3Dmol only understands
 * `color: 'spectrum'` on cartoons, and silently falls back to element
 * colours elsewhere.
 */
export function buildStyle(
  rep: Representation,
  scheme: ColorScheme,
  chains: readonly string[] = [],
  range?: ResidueRange,
): Record<string, unknown> {
  const cartoon = rep === 'cartoon' || rep === 'surface';
  const color = colorSpec(scheme, chains, cartoon ? undefined : (range ?? [0, 1]));
  switch (rep) {
    case 'cartoon':
    case 'surface': // the surface is drawn over a cartoon; see buildSurface
      return cartoonStyle(color);
    case 'stick':
      return { stick: { radius: 0.2, ...color } };
    case 'sphere':
      return { sphere: { scale: 0.9, ...color } };
    case 'line':
      return { line: { linewidth: 1, ...color } };
  }
}

const ligandColorSpec = { colorfunc: (a: { elem?: string }) => ligandColor(a.elem) };

/** Ball-and-stick for ligands layered over a cartoon. */
export const LIGAND_STICKS = {
  stick: { radius: 0.2, ...ligandColorSpec },
  sphere: { scale: 0.2, ...ligandColorSpec },
};

/** The full, ordered list of style steps for the current display options. */
export function buildStyleOps(
  opts: DisplayOptions,
  chains: readonly string[] = [],
  range?: ResidueRange,
): StyleOp[] {
  const { representation, colorScheme, showLigands, showWater } = opts;
  const ops: StyleOp[] = [
    { mode: 'set', sel: {}, style: buildStyle(representation, colorScheme, chains, range) },
  ];

  if (representation === 'cartoon' || representation === 'surface') {
    // A cartoon only traces the backbone; show nucleic-acid bases so DNA/RNA
    // reads as a ladder rather than a bare ribbon.
    ops.push({
      mode: 'add',
      sel: { resn: NUCLEOTIDE_RESN, not: { atom: NUCLEOTIDE_BACKBONE_ATOMS } },
      style: { stick: { radius: 0.16, colorscheme: 'Jmol' } },
    });
    if (showLigands) ops.push({ mode: 'set', sel: HET_NOT_WATER, style: LIGAND_STICKS });
  } else if (showLigands) {
    // Other styles already draw ligands; just give them the ligand colours.
    ops.push({
      mode: 'set',
      sel: HET_NOT_WATER,
      style: recolor(buildStyle(representation, 'chain'), ligandColorSpec),
    });
  } else {
    ops.push({ mode: 'set', sel: HET_NOT_WATER, style: {} });
  }

  ops.push({
    mode: 'set',
    sel: { resn: WATER_RESN },
    style: showWater ? { sphere: { radius: 0.3, color: WATER_COLOR } } : {},
  });
  return ops;
}

/** Same representation, different colouring. */
function recolor(style: Record<string, unknown>, color: Record<string, unknown>) {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(style)) {
    const { color: _c, colorfunc: _f, ...rest } = value as Record<string, unknown>;
    out[key] = { ...rest, ...color };
  }
  return out;
}

/** The translucent molecular surface for the "surface" style, or null for other styles. */
export interface SurfaceSpec {
  style: Record<string, unknown>;
  sel: Record<string, unknown>;
}

export function buildSurface(
  opts: DisplayOptions,
  chains: readonly string[] = [],
  range?: ResidueRange,
): SurfaceSpec | null {
  if (opts.representation !== 'surface') return null;
  return {
    // Polymer only: ligands stay visible as sticks inside their pockets.
    sel: { hetflag: false },
    style: { opacity: 0.72, ...colorSpec(opts.colorScheme, chains, range ?? [0, 1]) },
  };
}
