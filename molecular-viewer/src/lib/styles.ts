/** Map the UI's style / colour choices onto 3Dmol.js style operations. */

export const REPRESENTATIONS = ['cartoon', 'stick', 'sphere', 'line'] as const;
export type Representation = (typeof REPRESENTATIONS)[number];

export const COLOR_SCHEMES = ['chain', 'secondary', 'spectrum'] as const;
export type ColorScheme = (typeof COLOR_SCHEMES)[number];

export const REPRESENTATION_LABELS: Record<Representation, string> = {
  cartoon: 'Cartoon',
  stick: 'Stick',
  sphere: 'Sphere',
  line: 'Line',
};

export const COLOR_SCHEME_LABELS: Record<ColorScheme, string> = {
  chain: 'By chain',
  secondary: 'By secondary structure',
  spectrum: 'Spectrum (N to C)',
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

const WATER_COLOR = '#5aa9e6';

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
const NOT_LIGAND_RESN = [...WATER_RESN, 'MSE'];

const HET_NOT_WATER = { hetflag: true, not: { resn: NOT_LIGAND_RESN } };

/** 3Dmol colour options for one scheme. */
function colorSpec(scheme: ColorScheme, chains: readonly string[]): Record<string, unknown> {
  switch (scheme) {
    case 'chain':
      return { colorfunc: (atom: { chain?: string }) => chainColor(atom.chain, chains) };
    case 'secondary':
      return { colorfunc: (atom: { ss?: string }) => ssColor(atom.ss) };
    case 'spectrum':
      return { color: 'spectrum' };
  }
}

/** The AtomStyleSpec for the main representation. */
export function buildStyle(
  rep: Representation,
  scheme: ColorScheme,
  chains: readonly string[] = [],
): Record<string, unknown> {
  const color = colorSpec(scheme, chains);
  switch (rep) {
    case 'cartoon':
      // Oval cross-section gives round coils, arrows mark strand direction.
      return { cartoon: { style: 'oval', arrows: true, thickness: 0.3, ...color } };
    case 'stick':
      return { stick: { radius: 0.2, ...color } };
    case 'sphere':
      return { sphere: { scale: 0.9, ...color } };
    case 'line':
      return { line: { linewidth: 1, ...color } };
  }
}

/** The full, ordered list of style steps for the current display options. */
export function buildStyleOps(opts: DisplayOptions, chains: readonly string[] = []): StyleOp[] {
  const { representation, colorScheme, showLigands, showWater } = opts;
  const ops: StyleOp[] = [
    { mode: 'set', sel: {}, style: buildStyle(representation, colorScheme, chains) },
  ];

  if (representation === 'cartoon') {
    // A cartoon only traces the backbone; show nucleic-acid bases so DNA/RNA
    // reads as a ladder rather than a bare ribbon.
    ops.push({
      mode: 'add',
      sel: { resn: NUCLEOTIDE_RESN, not: { atom: NUCLEOTIDE_BACKBONE_ATOMS } },
      style: { stick: { radius: 0.16, colorscheme: 'Jmol' } },
    });
    if (showLigands) {
      ops.push({
        mode: 'add',
        sel: HET_NOT_WATER,
        style: { stick: { radius: 0.2, colorscheme: 'greenCarbon' }, sphere: { scale: 0.2, colorscheme: 'greenCarbon' } },
      });
    }
  } else if (!showLigands) {
    ops.push({ mode: 'set', sel: HET_NOT_WATER, style: {} });
  }

  ops.push({
    mode: 'set',
    sel: { resn: WATER_RESN },
    style: showWater ? { sphere: { radius: 0.3, color: WATER_COLOR } } : {},
  });
  return ops;
}
