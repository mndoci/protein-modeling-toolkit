/** Map the UI's style / colour choices onto a 3Dmol.js style spec. */

export const REPRESENTATIONS = ['cartoon', 'stick', 'sphere', 'line'] as const;
export type Representation = (typeof REPRESENTATIONS)[number];

export const COLOR_SCHEMES = ['chain', 'secondary', 'spectrum'] as const;
export type ColorScheme = (typeof COLOR_SCHEMES)[number];

export const REPRESENTATION_LABELS: Record<Representation, string> = {
  cartoon: 'Cartoon',
  stick: 'Stick',
  sphere: 'Sphere',
  line: 'Line',
};

export const COLOR_SCHEME_LABELS: Record<ColorScheme, string> = {
  chain: 'By chain',
  secondary: 'By secondary structure',
  spectrum: 'Spectrum (N to C)',
};

/** 3Dmol.js colour options for each scheme. */
function colorSpec(scheme: ColorScheme): Record<string, unknown> {
  switch (scheme) {
    case 'chain':
      return { colorscheme: 'chain' };
    case 'secondary':
      return { colorscheme: 'ssJmol' };
    case 'spectrum':
      return { color: 'spectrum' };
  }
}

/** Build the AtomStyleSpec passed to viewer.setStyle({}, spec). */
export function buildStyle(rep: Representation, scheme: ColorScheme): Record<string, unknown> {
  const color = colorSpec(scheme);
  switch (rep) {
    case 'cartoon':
      return { cartoon: { ...color } };
    case 'stick':
      return { stick: { radius: 0.2, ...color } };
    case 'sphere':
      return { sphere: { scale: 0.9, ...color } };
    case 'line':
      return { line: { linewidth: 1, ...color } };
  }
}
