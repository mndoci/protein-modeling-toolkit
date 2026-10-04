/**
 * Shareable links: the loaded structure and display options, encoded in the
 * page URL's query string, e.g. `?pdb=1UBQ&style=cartoon&color=chain`.
 */
import { findSample } from './samples';
import { normalizePdbId } from './rcsb';
import {
  COLOR_SCHEMES,
  REPRESENTATIONS,
  type ColorScheme,
  type DisplayOptions,
  type Representation,
} from './styles';

/** Where a structure came from. Uploaded files cannot be shared by link. */
export type StructureSource =
  | { kind: 'sample'; id: string }
  | { kind: 'pdb'; id: string }
  | { kind: 'file' };

export interface SharedView {
  source: Exclude<StructureSource, { kind: 'file' }>;
  /** Only the options the link actually set; the rest keep their defaults. */
  display: Partial<DisplayOptions>;
}

const flag = (on: boolean) => (on ? '1' : '0');

/** A link to this exact view, or null when the structure is a local file. */
export function buildShareUrl(
  base: string,
  source: StructureSource,
  display: DisplayOptions,
): string | null {
  if (source.kind === 'file') return null;
  const url = new URL(base);
  url.search = '';
  url.hash = '';
  url.searchParams.set(source.kind, source.id);
  url.searchParams.set('style', display.representation);
  url.searchParams.set('color', display.colorScheme);
  url.searchParams.set('ligands', flag(display.showLigands));
  url.searchParams.set('water', flag(display.showWater));
  return url.toString();
}

function parseFlag(value: string | null): boolean | undefined {
  if (value === '1' || value === 'true') return true;
  if (value === '0' || value === 'false') return false;
  return undefined;
}

/**
 * Read a shared view from a query string. Unknown or malformed values are
 * ignored rather than trusted, so a hand-edited link can never inject
 * anything but a valid sample, PDB ID or display option.
 */
export function parseShareQuery(search: string): SharedView | null {
  const params = new URLSearchParams(search);
  let source: SharedView['source'] | null = null;

  const sampleId = params.get('sample')?.toUpperCase();
  const pdb = params.get('pdb');
  if (sampleId && findSample(sampleId)) {
    source = { kind: 'sample', id: sampleId };
  } else if (pdb) {
    const id = normalizePdbId(pdb);
    if (id) source = { kind: 'pdb', id };
  }
  if (!source) return null;

  const display: Partial<DisplayOptions> = {};
  const style = params.get('style');
  if (style && (REPRESENTATIONS as readonly string[]).includes(style)) {
    display.representation = style as Representation;
  }
  const color = params.get('color');
  if (color && (COLOR_SCHEMES as readonly string[]).includes(color)) {
    display.colorScheme = color as ColorScheme;
  }
  const ligands = parseFlag(params.get('ligands'));
  if (ligands !== undefined) display.showLigands = ligands;
  const water = parseFlag(params.get('water'));
  if (water !== undefined) display.showWater = water;

  return { source, display };
}
