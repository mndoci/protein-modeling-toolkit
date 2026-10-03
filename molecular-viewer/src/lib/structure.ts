/**
 * Lightweight, dependency-free structure parsing used for the info panel.
 *
 * 3Dmol.js does the actual rendering; this module only extracts summary
 * facts (chains, residues, atoms, title) so they can be shown to the user
 * and unit-tested without WebGL.
 */

export type StructureFormat = 'pdb' | 'cif';

export interface ChainSummary {
  id: string;
  residues: number;
}

export interface StructureInfo {
  title: string | null;
  format: StructureFormat;
  atoms: number;
  residues: number;
  chains: ChainSummary[];
  /** Number of HETATM records (ligands, waters, ions). */
  hetAtoms: number;
}

/** Guess the file format from a file name, falling back to content sniffing. */
export function detectFormat(text: string, fileName?: string): StructureFormat {
  const name = fileName?.toLowerCase() ?? '';
  if (name.endsWith('.cif') || name.endsWith('.mmcif')) return 'cif';
  if (name.endsWith('.pdb') || name.endsWith('.ent')) return 'pdb';
  // mmCIF files begin with a data_ block and use _atom_site loops.
  const head = text.trimStart().slice(0, 2000);
  if (head.startsWith('data_') || head.includes('_atom_site.')) return 'cif';
  return 'pdb';
}

export class StructureParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StructureParseError';
  }
}

interface AtomRecord {
  het: boolean;
  chain: string;
  /** Unique residue key within a chain: sequence number + insertion code. */
  residueKey: string;
}

function summarize(
  atoms: AtomRecord[],
  title: string | null,
  format: StructureFormat,
): StructureInfo {
  if (atoms.length === 0) {
    throw new StructureParseError('No atom records found -- is this a PDB or mmCIF file?');
  }
  const chainOrder: string[] = [];
  const chainResidues = new Map<string, Set<string>>();
  let hetAtoms = 0;
  for (const atom of atoms) {
    if (atom.het) {
      hetAtoms += 1;
      continue; // residue/chain counts describe the polymer only
    }
    let set = chainResidues.get(atom.chain);
    if (!set) {
      set = new Set();
      chainResidues.set(atom.chain, set);
      chainOrder.push(atom.chain);
    }
    set.add(atom.residueKey);
  }
  const chains = chainOrder.map((id) => ({ id, residues: chainResidues.get(id)!.size }));
  return {
    title,
    format,
    atoms: atoms.length,
    residues: chains.reduce((sum, c) => sum + c.residues, 0),
    chains,
    hetAtoms,
  };
}

/** Parse the first model of a PDB-format file. */
export function parsePdb(text: string): StructureInfo {
  const atoms: AtomRecord[] = [];
  const titleParts: string[] = [];
  for (const line of text.split(/\r?\n/)) {
    const record = line.slice(0, 6);
    if (record === 'ENDMDL') break; // first model only
    if (record === 'TITLE ') {
      titleParts.push(line.slice(10).trim());
    } else if (record === 'ATOM  ' || record === 'HETATM') {
      atoms.push({
        het: record === 'HETATM',
        chain: line.slice(21, 22).trim() || '_',
        residueKey: line.slice(22, 27).trim(),
      });
    }
  }
  const title = titleParts.join(' ').replace(/\s+/g, ' ').trim() || null;
  return summarize(atoms, title, 'pdb');
}

/** Split one mmCIF data line into tokens, honouring single/double quotes. */
function tokenizeCifLine(line: string): string[] {
  const tokens: string[] = [];
  const re = /'([^']*)'(?=\s|$)|"([^"]*)"(?=\s|$)|(\S+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(line)) !== null) {
    tokens.push(m[1] ?? m[2] ?? m[3]);
  }
  return tokens;
}

/** Parse the first model of an mmCIF file (the _atom_site loop). */
export function parseCif(text: string): StructureInfo {
  const lines = text.split(/\r?\n/);
  let title: string | null = null;
  const atoms: AtomRecord[] = [];

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (line.startsWith('_struct.title')) {
      const rest = line.slice('_struct.title'.length).trim();
      const raw = rest || (lines[i + 1] ?? '').trim();
      title = raw.replace(/^['"]|['"]$/g, '').trim() || null;
    }
    if (line.trim() !== 'loop_' || !(lines[i + 1] ?? '').startsWith('_atom_site.')) continue;

    // Read the column headers of the _atom_site loop.
    const columns: string[] = [];
    let j = i + 1;
    while (j < lines.length && lines[j].startsWith('_atom_site.')) {
      columns.push(lines[j].trim().slice('_atom_site.'.length));
      j += 1;
    }
    const col = (name: string) => columns.indexOf(name);
    const iGroup = col('group_PDB');
    const iChain = col('auth_asym_id') >= 0 ? col('auth_asym_id') : col('label_asym_id');
    const iSeq = col('auth_seq_id') >= 0 ? col('auth_seq_id') : col('label_seq_id');
    const iIns = col('pdbx_PDB_ins_code');
    const iModel = col('pdbx_PDB_model_num');
    if (iGroup < 0 || iChain < 0 || iSeq < 0) {
      throw new StructureParseError('mmCIF _atom_site loop is missing required columns.');
    }

    let firstModel: string | null = null;
    for (; j < lines.length; j += 1) {
      const row = lines[j].trim();
      if (row === '' || row === '#' || row.startsWith('_') || row === 'loop_') break;
      const t = tokenizeCifLine(row);
      if (t.length < columns.length) continue;
      if (iModel >= 0) {
        firstModel ??= t[iModel];
        if (t[iModel] !== firstModel) continue;
      }
      const ins = iIns >= 0 && t[iIns] !== '?' && t[iIns] !== '.' ? t[iIns] : '';
      atoms.push({
        het: t[iGroup] === 'HETATM',
        chain: t[iChain],
        residueKey: `${t[iSeq]}${ins}`,
      });
    }
    i = j;
  }
  return summarize(atoms, title, 'cif');
}

export function parseStructure(text: string, format: StructureFormat): StructureInfo {
  return format === 'cif' ? parseCif(text) : parsePdb(text);
}
