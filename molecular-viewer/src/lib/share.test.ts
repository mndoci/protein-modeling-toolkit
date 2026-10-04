import { describe, expect, it } from 'vitest';
import { buildShareUrl, parseShareQuery } from './share';
import { DEFAULT_DISPLAY, type DisplayOptions } from './styles';

const BASE = 'https://viewer.example/app/?old=1#frag';
const view: DisplayOptions = { representation: 'surface', colorScheme: 'chain', showLigands: false, showWater: true };

describe('buildShareUrl', () => {
  it('encodes a sample and every display option, replacing any old query and hash', () => {
    const url = new URL(buildShareUrl(BASE, { kind: 'sample', id: '4HHB' }, view)!);
    expect(url.origin + url.pathname).toBe('https://viewer.example/app/');
    expect(url.hash).toBe('');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      sample: '4HHB',
      style: 'surface',
      color: 'chain',
      ligands: '0',
      water: '1',
    });
  });

  it('encodes a fetched PDB entry', () => {
    const url = new URL(buildShareUrl(BASE, { kind: 'pdb', id: '1UBQ' }, DEFAULT_DISPLAY)!);
    expect(url.searchParams.get('pdb')).toBe('1UBQ');
    expect(url.searchParams.has('sample')).toBe(false);
  });

  it('cannot share a file opened from the computer', () => {
    expect(buildShareUrl(BASE, { kind: 'file' }, DEFAULT_DISPLAY)).toBeNull();
  });
});

describe('parseShareQuery', () => {
  it('round-trips what buildShareUrl writes', () => {
    for (const source of [{ kind: 'sample', id: '1BNA' }, { kind: 'pdb', id: '2LZM' }] as const) {
      const url = new URL(buildShareUrl(BASE, source, view)!);
      expect(parseShareQuery(url.search)).toEqual({ source, display: view });
    }
  });

  it('returns only the options the link sets', () => {
    expect(parseShareQuery('?sample=1crn&color=spectrum')).toEqual({
      source: { kind: 'sample', id: '1CRN' },
      display: { colorScheme: 'spectrum' },
    });
    expect(parseShareQuery('?pdb=1ubq&ligands=true&water=false')?.display).toEqual({
      showLigands: true,
      showWater: false,
    });
  });

  it('ignores unknown or malformed values instead of trusting them', () => {
    expect(parseShareQuery('?pdb=1UBQ&style=<script>&color=neon&water=maybe')).toEqual({
      source: { kind: 'pdb', id: '1UBQ' },
      display: {},
    });
  });

  it('needs a valid structure to open anything', () => {
    expect(parseShareQuery('')).toBeNull();
    expect(parseShareQuery('?style=stick')).toBeNull();
    expect(parseShareQuery('?pdb=../../etc')).toBeNull();
    expect(parseShareQuery('?pdb=12345')).toBeNull();
    // An unknown sample falls back to a valid pdb= if one is given.
    expect(parseShareQuery('?sample=ZZZZ')).toBeNull();
    expect(parseShareQuery('?sample=ZZZZ&pdb=1CRN')?.source).toEqual({ kind: 'pdb', id: '1CRN' });
  });
});
