import { describe, expect, it } from 'vitest';
import { describeAtom } from './hover';

describe('describeAtom', () => {
  it('names the chain, residue and secondary structure of a protein atom', () => {
    expect(describeAtom({ chain: 'A', resn: 'HIS', resi: 87, ss: 'h' })).toEqual({
      title: 'Chain A · HIS 87',
      detail: 'α-helix',
    });
    expect(describeAtom({ chain: 'B', resn: 'VAL', resi: 5, ss: 's' }).detail).toBe('β-strand');
    expect(describeAtom({ chain: 'B', resn: 'GLY', resi: 6, ss: 'c' }).detail).toBe('coil');
  });

  it("reads 3Dmol's arrow and tube markers as their parent element", () => {
    expect(describeAtom({ resn: 'ALA', resi: 1, ss: 'arrow start' }).detail).toBe('β-strand');
    expect(describeAtom({ resn: 'ALA', resi: 1, ss: 'arrow end' }).detail).toBe('β-strand');
    expect(describeAtom({ resn: 'ALA', resi: 1, ss: 'tube start' }).detail).toBe('α-helix');
  });

  it('labels ligands with the atom under the pointer', () => {
    expect(describeAtom({ chain: 'A', resn: 'HEM', resi: 142, hetflag: true, atom: 'FE' })).toEqual({
      title: 'Chain A · HEM 142',
      detail: 'ligand · atom FE',
    });
  });

  it('labels water, and treats selenomethionine as protein, not a ligand', () => {
    expect(describeAtom({ chain: 'A', resn: 'HOH', resi: 301, hetflag: true })).toEqual({
      title: 'Water 301',
      detail: 'chain A',
    });
    expect(describeAtom({ chain: 'A', resn: 'MSE', resi: 1, hetflag: true, ss: 'h' }).detail).toBe(
      'α-helix',
    );
  });

  it('labels nucleotides', () => {
    expect(describeAtom({ chain: 'A', resn: 'DG', resi: 4 })).toEqual({
      title: 'Chain A · DG 4',
      detail: 'nucleotide',
    });
  });

  it('copes with missing fields', () => {
    expect(describeAtom({})).toEqual({ title: '? ?', detail: 'coil' });
  });
});
