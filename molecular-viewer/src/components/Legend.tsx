import type { ChainSummary } from '../lib/structure';
import {
  COLOR_SCHEME_TITLES,
  LIGAND_ELEMENT_COLORS,
  SS_COLORS,
  chainColor,
  spectrumColor,
  type ColorScheme,
} from '../lib/styles';

/** At most this many chains are listed; the rest are summarised. */
const MAX_CHAINS = 8;

interface Props {
  scheme: ColorScheme;
  chains: readonly ChainSummary[];
  /** Show the ligand element key (only when ligands are drawn and present). */
  ligands: boolean;
}

function Swatch({ color }: { color: string }) {
  return <span className="swatch" style={{ background: color }} aria-hidden="true" />;
}

const GRADIENT = `linear-gradient(to right, ${[0, 0.25, 0.5, 0.75, 1].map(spectrumColor).join(', ')})`;

/** Explains what the colours in the 3D view mean, for the active colour mode. */
export function Legend({ scheme, chains, ligands }: Props) {
  const ids = chains.map((c) => c.id);
  return (
    <section className="legend glass" aria-labelledby="legend-heading" data-testid="legend">
      <h2 id="legend-heading">{COLOR_SCHEME_TITLES[scheme]}</h2>
      {scheme === 'chain' ? (
        <ul>
          {chains.slice(0, MAX_CHAINS).map((c) => (
            <li key={c.id}>
              <Swatch color={chainColor(c.id, ids)} />
              Chain {c.id} <span className="muted">· {c.residues} res</span>
            </li>
          ))}
          {chains.length > MAX_CHAINS ? (
            <li className="muted">+{chains.length - MAX_CHAINS} more chains</li>
          ) : null}
        </ul>
      ) : null}
      {scheme === 'secondary' ? (
        <ul>
          <li>
            <Swatch color={SS_COLORS.helix} />
            Helix
          </li>
          <li>
            <Swatch color={SS_COLORS.sheet} />
            Sheet
          </li>
          <li>
            <Swatch color={SS_COLORS.coil} />
            Coil
          </li>
        </ul>
      ) : null}
      {scheme === 'spectrum' ? (
        <div className="gradient">
          <span className="gradient-bar" style={{ backgroundImage: GRADIENT }} aria-hidden="true" />
          <span className="gradient-ends">
            <span>N terminus</span>
            <span>C terminus</span>
          </span>
        </div>
      ) : null}
      {ligands ? (
        <p className="legend-ligands">
          Ligands:
          {(['C', 'N', 'O'] as const).map((el) => (
            <span key={el} className="element">
              <Swatch color={LIGAND_ELEMENT_COLORS[el]} />
              {el}
            </span>
          ))}
        </p>
      ) : null}
    </section>
  );
}
