/** Fetch structures from the RCSB Protein Data Bank. */

/** A classic 4-character PDB ID: a digit followed by three alphanumerics. */
const PDB_ID_RE = /^[1-9][A-Za-z0-9]{3}$/;

export function normalizePdbId(input: string): string | null {
  const id = input.trim().toUpperCase();
  return PDB_ID_RE.test(id) ? id : null;
}

export type StructureFormat = 'pdb' | 'cif';

export function rcsbUrl(id: string, format: StructureFormat = 'pdb'): string {
  return `https://files.rcsb.org/download/${encodeURIComponent(id)}.${format}`;
}

export class FetchStructureError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FetchStructureError';
  }
}

/**
 * Download a structure: the PDB-format file, or on a 404 only, the mmCIF file
 * (large entries have no PDB file). Throws FetchStructureError with a
 * user-readable message on an invalid ID, a missing entry, or a failure.
 */
export async function fetchPdb(
  input: string,
  fetchImpl: typeof fetch = fetch,
  signal?: AbortSignal,
): Promise<{ id: string; text: string; format: StructureFormat }> {
  const id = normalizePdbId(input);
  if (!id) {
    throw new FetchStructureError(
      `"${input.trim()}" is not a valid PDB ID (expected 4 characters, e.g. 1CRN).`,
    );
  }
  for (const format of ['pdb', 'cif'] as const) {
    let response: Response;
    try {
      response = await fetchImpl(rcsbUrl(id, format), { signal });
    } catch (err) {
      if ((err as Error).name === 'AbortError') throw err;
      throw new FetchStructureError(`Could not reach RCSB to download ${id}. Check your connection.`);
    }
    if (response.status === 404) continue;
    if (!response.ok) {
      throw new FetchStructureError(`RCSB returned HTTP ${response.status} for ${id}.`);
    }
    return { id, text: await response.text(), format };
  }
  throw new FetchStructureError(`No entry ${id} on RCSB.`);
}
