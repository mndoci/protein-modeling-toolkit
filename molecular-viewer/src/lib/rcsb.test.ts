import { describe, expect, it, vi } from 'vitest';
import { FetchStructureError, fetchPdb, normalizePdbId, rcsbUrl } from './rcsb';

function response(status: number, body = ''): Response {
  return new Response(body, { status });
}

describe('normalizePdbId', () => {
  it('upper-cases and trims valid IDs', () => {
    expect(normalizePdbId(' 1crn ')).toBe('1CRN');
    expect(normalizePdbId('4HHB')).toBe('4HHB');
  });

  it.each(['', 'CRN1', '0ABC', '1CR', '1CRNN', '1C-N', '../x'])('rejects %j', (bad) => {
    expect(normalizePdbId(bad)).toBeNull();
  });
});

describe('fetchPdb', () => {
  it('downloads the PDB-format file from RCSB', async () => {
    const fetchImpl = vi.fn(async () => response(200, 'ATOM ...'));
    await expect(fetchPdb('1ubq', fetchImpl)).resolves.toEqual({
      id: '1UBQ',
      text: 'ATOM ...',
      format: 'pdb',
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl).toHaveBeenCalledWith(rcsbUrl('1UBQ'), expect.anything());
    expect(rcsbUrl('1UBQ')).toBe('https://files.rcsb.org/download/1UBQ.pdb');
  });

  it('rejects an invalid ID without touching the network', async () => {
    const fetchImpl = vi.fn();
    await expect(fetchPdb('hello', fetchImpl)).rejects.toThrow(/not a valid PDB ID/);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('falls back to mmCIF when the PDB file is 404', async () => {
    const fetchImpl = vi.fn(async (url: RequestInfo | URL) =>
      String(url).endsWith('.pdb') ? response(404) : response(200, 'data_4V6X'),
    );
    await expect(fetchPdb('4v6x', fetchImpl)).resolves.toEqual({
      id: '4V6X',
      text: 'data_4V6X',
      format: 'cif',
    });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(fetchImpl).toHaveBeenLastCalledWith(rcsbUrl('4V6X', 'cif'), expect.anything());
  });

  it('reports a missing entry when both files are 404', async () => {
    const fetchImpl = vi.fn(async () => response(404));
    await expect(fetchPdb('9ZZZ', fetchImpl)).rejects.toThrow('No entry 9ZZZ on RCSB.');
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('keeps the HTTP error message when the mmCIF fallback fails', async () => {
    const fetchImpl = vi.fn(async (url: RequestInfo | URL) =>
      response(String(url).endsWith('.pdb') ? 404 : 503),
    );
    await expect(fetchPdb('4V6X', fetchImpl)).rejects.toThrow('RCSB returned HTTP 503 for 4V6X.');
  });

  it('keeps the network error message when the mmCIF fallback fails', async () => {
    const fetchImpl = vi.fn(async (url: RequestInfo | URL) => {
      if (String(url).endsWith('.pdb')) return response(404);
      throw new TypeError('Failed to fetch');
    });
    await expect(fetchPdb('4V6X', fetchImpl)).rejects.toThrow(/Could not reach RCSB/);
  });

  it('passes the abort signal to both requests', async () => {
    const signal = new AbortController().signal;
    const fetchImpl = vi.fn(async (url: RequestInfo | URL, _init?: RequestInit) =>
      String(url).endsWith('.pdb') ? response(404) : response(200, 'data_X'),
    );
    await fetchPdb('4V6X', fetchImpl, signal);
    expect(fetchImpl.mock.calls.map((c) => c[1]?.signal)).toEqual([signal, signal]);
  });

  it('reports other HTTP errors', async () => {
    const fetchImpl = vi.fn(async () => response(503));
    await expect(fetchPdb('1CRN', fetchImpl)).rejects.toThrow('RCSB returned HTTP 503 for 1CRN.');
  });

  it('wraps network failures', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    });
    const err = await fetchPdb('1CRN', fetchImpl).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(FetchStructureError);
    expect((err as Error).message).toMatch(/Could not reach RCSB/);
  });

  it('lets an abort propagate unchanged', async () => {
    const abort = new DOMException('aborted', 'AbortError');
    const fetchImpl = vi.fn(async () => {
      throw abort;
    });
    await expect(fetchPdb('1CRN', fetchImpl)).rejects.toBe(abort);
  });
});
