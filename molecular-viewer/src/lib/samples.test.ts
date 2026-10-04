import { describe, expect, it } from 'vitest';
import { SAMPLES, findSample, loadSampleText, sampleThumbnail } from './samples';
import { parseStructure } from './structure';

/**
 * Expected facts, counted independently of the parser straight from the PDB
 * files (ATOM records' chain IDs and distinct residues; ATOM + HETATM totals).
 */
const EXPECTED: Record<string, { chains: string[]; residues: number; atoms: number; het: number }> = {
  '1CRN': { chains: ['A'], residues: 46, atoms: 327, het: 0 },
  '1UBQ': { chains: ['A'], residues: 76, atoms: 660, het: 58 },
  '1MBN': { chains: ['A'], residues: 153, atoms: 1260, het: 44 },
  '4HHB': { chains: ['A', 'B', 'C', 'D'], residues: 574, atoms: 4779, het: 395 },
  '1EMA': { chains: ['A'], residues: 221, atoms: 1866, het: 149 },
  '1TIM': { chains: ['A', 'B'], residues: 494, atoms: 3740, het: 0 },
  '1HSG': { chains: ['A', 'B'], residues: 198, atoms: 1686, het: 172 },
  '1BNA': { chains: ['A', 'B'], residues: 24, atoms: 566, het: 80 },
};

describe('sample catalogue', () => {
  it('has unique IDs, names and blurbs for every sample', () => {
    const ids = SAMPLES.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const s of SAMPLES) {
      expect(s.id).toMatch(/^[1-9][A-Z0-9]{3}$/);
      expect(s.name.length).toBeGreaterThan(2);
      expect(s.blurb.length).toBeGreaterThan(20);
    }
  });

  it('expects data for exactly the catalogued samples', () => {
    expect(Object.keys(EXPECTED).sort()).toEqual(SAMPLES.map((s) => s.id).sort());
  });

  it('shows variety: several colour schemes, multi-chain, ligands and a non-protein', () => {
    const schemes = new Set(SAMPLES.map((s) => s.view.colorScheme));
    expect(schemes.size).toBeGreaterThanOrEqual(3);
    expect(SAMPLES.some((s) => EXPECTED[s.id].chains.length > 1)).toBe(true);
    expect(SAMPLES.some((s) => EXPECTED[s.id].het > 0 && s.view.showLigands)).toBe(true);
    expect(findSample('1BNA')?.rotation).toEqual({ angle: 90, axis: 'x' });
  });

  it('finds samples by ID', () => {
    expect(findSample('4HHB')?.name).toBe('Hemoglobin');
    expect(findSample('NOPE')).toBeUndefined();
  });

  it('gives every sample a short menu tagline and a bundled preview image', () => {
    for (const s of SAMPLES) {
      expect(s.tagline.length).toBeGreaterThan(5);
      expect(s.tagline.length).toBeLessThanOrEqual(32); // one line in the menu
      expect(sampleThumbnail(s.id)).toMatch(new RegExp(`${s.id}.*\\.jpg|^data:image/jpeg`));
    }
    expect(sampleThumbnail('NOPE')).toBeUndefined();
  });
});

/** Ligand copies and waters, counted from the files with awk (distinct chain + residue number). */
const HET: Record<string, { ligands: Record<string, number>; waters: number }> = {
  '1CRN': { ligands: {}, waters: 0 },
  '1UBQ': { ligands: {}, waters: 58 },
  '1MBN': { ligands: { HEM: 1, OH: 1 }, waters: 0 },
  '4HHB': { ligands: { HEM: 4, PO4: 2 }, waters: 221 },
  '1EMA': { ligands: { CRO: 1 }, waters: 95 },
  '1TIM': { ligands: {}, waters: 0 },
  '1HSG': { ligands: { MK1: 1 }, waters: 127 },
  '1BNA': { ligands: {}, waters: 80 },
};

describe.each(SAMPLES.map((s) => s.id))('bundled sample %s', (id) => {
  it('loads, parses, and matches the counts taken from the file', async () => {
    const text = await loadSampleText(id);
    const info = parseStructure(text, 'pdb');
    const want = EXPECTED[id];
    expect(info.chains.map((c) => c.id)).toEqual(want.chains);
    expect(info.residues).toBe(want.residues);
    expect(info.atoms).toBe(want.atoms);
    expect(info.hetAtoms).toBe(want.het);
    expect(Object.fromEntries(info.ligands.map((l) => [l.resn, l.count]))).toEqual(HET[id].ligands);
    expect(info.waters).toBe(HET[id].waters);
  });

  it('is the structure it claims to be', async () => {
    const text = await loadSampleText(id);
    expect(text).toMatch(new RegExp(`^HEADER .*${id}\\s*$`, 'm'));
  });
});

describe('loadSampleText', () => {
  it('rejects an unknown sample', async () => {
    await expect(loadSampleText('ZZZZ')).rejects.toThrow(/No bundled file for sample ZZZZ/);
  });
});
