/**
 * Bundled sample structures, each chosen to show off a different capability.
 * The PDB files live in src/assets/samples/ and are loaded on demand, so they
 * add nothing to the initial download and work with no network.
 */
import type { DisplayOptions } from './styles';

export interface Sample {
  /** PDB ID; also the file name in src/assets/samples/. */
  id: string;
  /** Short name shown in the picker and the info panel. */
  name: string;
  /** One or two sentences on what the structure is and what to look at. */
  blurb: string;
  /** How the structure is displayed when the sample is loaded. */
  view: DisplayOptions;
  /** Optional initial turn so the structure is seen from its best side. */
  rotation?: { angle: number; axis: 'x' | 'y' | 'z' };
}

const cartoon = (
  colorScheme: DisplayOptions['colorScheme'],
  showLigands = true,
): DisplayOptions => ({ representation: 'cartoon', colorScheme, showLigands, showWater: false });

export const SAMPLES: readonly Sample[] = [
  {
    id: '1CRN',
    name: 'crambin',
    blurb: 'A tiny 46-residue seed protein at ultra-high resolution. Two helices and a short β-sheet.',
    view: cartoon('secondary'),
  },
  {
    id: '1UBQ',
    name: 'ubiquitin',
    blurb: 'The classic α/β fold: a twisted β-sheet packed against a single helix. Arrowheads show strand direction.',
    view: cartoon('secondary'),
  },
  {
    id: '1MBN',
    name: 'myoglobin',
    blurb: 'An all-helical oxygen-storage protein. Coloured N to C terminus, with the heme group shown as sticks.',
    view: cartoon('spectrum'),
  },
  {
    id: '4HHB',
    name: 'hemoglobin',
    blurb: 'Four chains (two α, two β), each holding a heme. Coloured by chain to show the assembly.',
    view: cartoon('chain'),
  },
  {
    id: '1EMA',
    name: 'green fluorescent protein',
    blurb: 'A β-barrel wrapped around a self-made chromophore (sticks, at the centre of the barrel).',
    view: cartoon('secondary'),
  },
  {
    id: '1TIM',
    name: 'triose phosphate isomerase',
    blurb: 'A two-subunit enzyme built on the TIM barrel, a ring of eight β-strands wrapped in helices. Spectrum colouring runs blue (N) to red (C).',
    view: cartoon('spectrum'),
  },
  {
    id: '1HSG',
    name: 'HIV-1 protease + inhibitor',
    blurb: 'A two-chain drug target with the inhibitor indinavir (sticks) bound between the chains. Rotate to find it.',
    view: cartoon('chain'),
  },
  {
    id: '1BNA',
    name: 'B-DNA dodecamer',
    blurb: 'Not a protein: a DNA double helix, with the base pairs drawn as sticks between the backbones.',
    view: cartoon('chain'),
    // Looking straight down the helix axis hides the double helix; turn it side-on.
    rotation: { angle: 90, axis: 'x' },
  },
];

export function findSample(id: string): Sample | undefined {
  return SAMPLES.find((s) => s.id === id);
}

/** Lazy loaders: Vite splits each PDB file into its own chunk. */
const loaders = import.meta.glob('../assets/samples/*.pdb', {
  query: '?raw',
  import: 'default',
}) as Record<string, () => Promise<string>>;

/** Fetch the bundled PDB text for a sample. */
export async function loadSampleText(id: string): Promise<string> {
  const load = loaders[`../assets/samples/${id}.pdb`];
  if (!load) throw new Error(`No bundled file for sample ${id}.`);
  return load();
}
