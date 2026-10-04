/** Text for the hover label: which residue (or ligand) is under the pointer. */
import { NUCLEOTIDE_RESN, NOT_LIGAND_RESN, WATER_RESN } from './styles';

/** The fields of a 3Dmol AtomSpec the label uses. */
export interface HoveredAtom {
  chain?: string;
  resn?: string;
  resi?: number | string;
  /** 3Dmol secondary structure: 'h', 's', 'c', or an arrow/tube marker. */
  ss?: string;
  hetflag?: boolean;
  /** Atom name, e.g. CA or FE. */
  atom?: string;
}

export interface HoverLabel {
  /** The bold part, e.g. "Chain A · HIS 87". */
  title: string;
  /** What kind of thing it is, e.g. "α-helix" or "ligand · atom FE". */
  detail: string;
}

function secondaryName(ss: string | undefined): string {
  switch (ss) {
    case 'h':
    case 'tube start':
      return 'α-helix';
    case 's':
    case 'arrow start':
    case 'arrow end':
      return 'β-strand';
    default:
      return 'coil';
  }
}

export function describeAtom(atom: HoveredAtom): HoverLabel {
  const resn = (atom.resn ?? '').trim() || '?';
  const resi = atom.resi ?? '?';
  const chain = (atom.chain ?? '').trim();
  const where = chain ? `Chain ${chain} · ` : '';

  if (WATER_RESN.includes(resn)) return { title: `Water ${resi}`, detail: chain ? `chain ${chain}` : 'solvent' };
  if (atom.hetflag && !NOT_LIGAND_RESN.includes(resn)) {
    return {
      title: `${where}${resn} ${resi}`,
      detail: atom.atom ? `ligand · atom ${atom.atom}` : 'ligand',
    };
  }
  if (NUCLEOTIDE_RESN.includes(resn)) return { title: `${where}${resn} ${resi}`, detail: 'nucleotide' };
  return { title: `${where}${resn} ${resi}`, detail: secondaryName(atom.ss) };
}
