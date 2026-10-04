import { describe, expect, it } from 'vitest';
import CRAMBIN from '../assets/samples/1CRN.pdb?raw';
import {
  StructureParseError,
  detectFormat,
  parseCif,
  parsePdb,
  parseStructure,
} from './structure';

/** Fixed-column PDB ATOM/HETATM line builder for synthetic fixtures. */
function atomLine(
  record: 'ATOM  ' | 'HETATM',
  serial: number,
  name: string,
  resName: string,
  chain: string,
  resSeq: number,
  iCode = ' ',
): string {
  return (
    record +
    String(serial).padStart(5) +
    ' ' +
    name.padEnd(4) +
    ' ' +
    resName.padStart(3) +
    ' ' +
    chain +
    String(resSeq).padStart(4) +
    iCode +
    '   ' +
    '   0.000   0.000   0.000  1.00  0.00           C'
  );
}

/** Re-express a PDB file's first model as an mmCIF _atom_site loop. */
function pdbToCif(pdb: string): string {
  const rows: string[] = [];
  for (const line of pdb.split('\n')) {
    const rec = line.slice(0, 6);
    if (rec !== 'ATOM  ' && rec !== 'HETATM') continue;
    const name = line.slice(12, 16).trim();
    const quoted = name.includes("'") ? `"${name}"` : name;
    const ins = line.slice(26, 27).trim() || '?';
    rows.push(
      [rec.trim(), line.slice(6, 11).trim(), quoted, line.slice(17, 20).trim(),
        line.slice(21, 22), line.slice(22, 26).trim(), ins, '1'].join(' '),
    );
  }
  return [
    'data_TEST',
    '_struct.title "Converted fixture"',
    '#',
    'loop_',
    '_atom_site.group_PDB',
    '_atom_site.id',
    '_atom_site.label_atom_id',
    '_atom_site.label_comp_id',
    '_atom_site.auth_asym_id',
    '_atom_site.auth_seq_id',
    '_atom_site.pdbx_PDB_ins_code',
    '_atom_site.pdbx_PDB_model_num',
    ...rows,
    '#',
  ].join('\n');
}

describe('parsePdb on the bundled 1CRN (crambin)', () => {
  const info = parsePdb(CRAMBIN);

  it('counts 1 chain, 46 residues and 327 atoms', () => {
    expect(info.chains).toEqual([{ id: 'A', residues: 46 }]);
    expect(info.residues).toBe(46);
    expect(info.atoms).toBe(327);
    expect(info.hetAtoms).toBe(0);
    expect(info.format).toBe('pdb');
  });

  it('joins multi-line TITLE records', () => {
    expect(info.title).toBe(
      'WATER STRUCTURE OF A HYDROPHOBIC PROTEIN AT ATOMIC RESOLUTION. ' +
        'PENTAGON RINGS OF WATER MOLECULES IN CRYSTALS OF CRAMBIN',
    );
  });
});

describe('parsePdb edge cases', () => {
  it('reads only the first MODEL of an NMR ensemble', () => {
    const model = [atomLine('ATOM  ', 1, 'CA', 'GLY', 'A', 1), atomLine('ATOM  ', 2, 'CA', 'ALA', 'A', 2)];
    const text = ['MODEL        1', ...model, 'ENDMDL', 'MODEL        2', ...model, 'ENDMDL'].join('\n');
    const info = parsePdb(text);
    expect(info.atoms).toBe(2);
    expect(info.residues).toBe(2);
  });

  it('counts HETATM separately and excludes them from residue counts', () => {
    const text = [
      atomLine('ATOM  ', 1, 'CA', 'GLY', 'A', 1),
      atomLine('HETATM', 2, 'O', 'HOH', 'A', 101),
      atomLine('HETATM', 3, 'O', 'HOH', 'A', 102),
    ].join('\n');
    const info = parsePdb(text);
    expect(info).toMatchObject({ atoms: 3, hetAtoms: 2, residues: 1 });
  });

  it('treats insertion codes as distinct residues and keeps chain order', () => {
    const text = [
      atomLine('ATOM  ', 1, 'CA', 'GLY', 'B', 52),
      atomLine('ATOM  ', 2, 'CA', 'GLY', 'B', 52, 'A'),
      atomLine('ATOM  ', 3, 'N', 'GLY', 'B', 52, 'A'),
      atomLine('ATOM  ', 4, 'CA', 'SER', 'A', 1),
    ].join('\r\n');
    const info = parsePdb(text);
    expect(info.chains).toEqual([
      { id: 'B', residues: 2 },
      { id: 'A', residues: 1 },
    ]);
  });

  it('rejects text with no atom records', () => {
    expect(() => parsePdb('HEADER    NOTHING HERE\nEND\n')).toThrow(StructureParseError);
    expect(() => parsePdb('')).toThrow(/No atom records/);
  });

  it('groups ligands by name and copy, and counts waters, leaving out selenomethionine', () => {
    const text = [
      atomLine('ATOM  ', 1, 'CA', 'GLY', 'A', 5),
      atomLine('ATOM  ', 2, 'CA', 'ALA', 'A', 60),
      atomLine('HETATM', 3, 'SE', 'MSE', 'A', 61),
      atomLine('HETATM', 4, 'FE', 'HEM', 'A', 142),
      atomLine('HETATM', 5, 'NA', 'HEM', 'A', 142),
      atomLine('HETATM', 6, 'FE', 'HEM', 'B', 142),
      atomLine('HETATM', 7, 'P', 'PO4', 'B', 200),
      atomLine('HETATM', 8, 'O', 'HOH', 'A', 301),
      atomLine('HETATM', 9, 'O', 'HOH', 'A', 302),
    ].join('\n');
    const info = parsePdb(text);
    expect(info.ligands).toEqual([
      { resn: 'HEM', count: 2 },
      { resn: 'PO4', count: 1 },
    ]);
    expect(info.waters).toBe(2);
    expect(info.residueRange).toEqual([5, 60]); // polymer only, not ligand numbers
  });

  it('has no residue range when there is no polymer', () => {
    const info = parsePdb(atomLine('HETATM', 1, 'O', 'HOH', 'A', 1));
    expect(info.residueRange).toBeNull();
    expect(info.waters).toBe(1);
  });
});

describe('parseCif', () => {
  it('agrees with parsePdb on 1CRN re-expressed as mmCIF', () => {
    const fromCif = parseCif(pdbToCif(CRAMBIN));
    const fromPdb = parsePdb(CRAMBIN);
    expect(fromCif.chains).toEqual(fromPdb.chains);
    expect(fromCif.atoms).toBe(327);
    expect(fromCif.residues).toBe(46);
    expect(fromCif.title).toBe('Converted fixture');
    expect(fromCif.format).toBe('cif');
  });

  it('reads ligand names from auth_comp_id', () => {
    const cif = [
      'data_X',
      'loop_',
      '_atom_site.group_PDB',
      '_atom_site.auth_comp_id',
      '_atom_site.auth_asym_id',
      '_atom_site.auth_seq_id',
      'ATOM GLY A 3',
      'ATOM ALA A 9',
      'HETATM HEM A 100',
      'HETATM HOH A 200',
      '#',
    ].join('\n');
    const info = parseCif(cif);
    expect(info.ligands).toEqual([{ resn: 'HEM', count: 1 }]);
    expect(info.waters).toBe(1);
    expect(info.residueRange).toEqual([3, 9]);
  });

  it('handles quoted atom names, HETATM rows and skips later models', () => {
    const cif = [
      'data_X',
      'loop_',
      '_atom_site.group_PDB',
      '_atom_site.label_atom_id',
      '_atom_site.label_asym_id',
      '_atom_site.auth_asym_id',
      '_atom_site.auth_seq_id',
      '_atom_site.pdbx_PDB_model_num',
      `ATOM "C1'" A A 1 1`,
      `ATOM 'O5 X' A A 2 1`,
      'HETATM O W W 50 1',
      `ATOM "C1'" A A 1 2`,
      '#',
    ].join('\n');
    const info = parseCif(cif);
    expect(info).toMatchObject({ atoms: 3, hetAtoms: 1, residues: 2, title: null });
  });

  it('rejects an _atom_site loop without chain or residue columns', () => {
    const cif = ['data_X', 'loop_', '_atom_site.group_PDB', '_atom_site.id', 'ATOM 1', '#'].join('\n');
    expect(() => parseCif(cif)).toThrow(/missing required columns/);
  });

  it('rejects a file with no _atom_site loop', () => {
    expect(() => parseCif('data_X\n_entry.id X\n')).toThrow(StructureParseError);
  });
});

describe('detectFormat / parseStructure', () => {
  it('prefers the file extension', () => {
    expect(detectFormat('anything', 'x.cif')).toBe('cif');
    expect(detectFormat('anything', 'X.MMCIF')).toBe('cif');
    expect(detectFormat('data_X', 'x.pdb')).toBe('pdb');
    expect(detectFormat('data_X', 'pdb1crn.ent')).toBe('pdb');
  });

  it('sniffs content when there is no useful extension', () => {
    expect(detectFormat('\n  data_1CRN\n#')).toBe('cif');
    expect(detectFormat(CRAMBIN, 'structure.txt')).toBe('pdb');
  });

  it('dispatches on format', () => {
    expect(parseStructure(CRAMBIN, 'pdb').atoms).toBe(327);
    expect(parseStructure(pdbToCif(CRAMBIN), 'cif').atoms).toBe(327);
  });
});
