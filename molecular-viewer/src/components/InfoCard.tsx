import type { StructureInfo } from '../lib/structure';

const fmt = new Intl.NumberFormat('en-US');
const plural = (n: number, one: string, many = `${one}s`) => `${fmt.format(n)} ${n === 1 ? one : many}`;

interface Props {
  /** Main heading, e.g. "Hemoglobin" or "1UBQ" or "crambin.pdb". */
  heading: string;
  /** Shown after the heading in muted text, e.g. the PDB ID of a sample. */
  subheading?: string;
  /** One or two sentences; falls back to the file's own TITLE. */
  description?: string;
  info: StructureInfo;
}

/** Floating card over the viewer: what is loaded and how big it is. */
export function InfoCard({ heading, subheading, description, info }: Props) {
  const text = description ?? info.title ?? null;
  const ligands = info.ligands;
  const shownLigands = ligands.slice(0, 2);
  return (
    <section className="info-card glass" aria-labelledby="info-heading">
      <h2 id="info-heading">
        <span data-testid="info-name">{heading}</span>
        {subheading ? <span className="muted"> · {subheading}</span> : null}
      </h2>
      {text ? (
        <p className="info-text" data-testid="info-title" title={text}>
          {text}
        </p>
      ) : null}
      <ul className="chips" aria-label="Structure summary">
        <li data-testid="info-chains">{plural(info.chains.length, 'chain')}</li>
        <li data-testid="info-residues">{plural(info.residues, 'residue')}</li>
        <li data-testid="info-atoms">{plural(info.atoms, 'atom')}</li>
        {shownLigands.map((l) => (
          <li key={l.resn} data-testid="info-ligand" title={`Ligand ${l.resn}`}>
            {l.count > 1 ? `${l.count} × ` : ''}
            {l.resn}
          </li>
        ))}
        {ligands.length > shownLigands.length ? (
          <li title={ligands.slice(2).map((l) => l.resn).join(', ')}>
            +{ligands.length - shownLigands.length} more ligands
          </li>
        ) : null}
        {info.waters > 0 ? <li data-testid="info-waters">{plural(info.waters, 'water')}</li> : null}
        <li className="chip-format">{info.format === 'cif' ? 'mmCIF' : 'PDB'}</li>
      </ul>
    </section>
  );
}
