import type { StructureInfo } from '../lib/structure';

/** Summary panel: title, format and counts for the loaded structure. */
export function StructureInfoPanel({ name, info }: { name: string; info: StructureInfo }) {
  return (
    <section className="panel" aria-labelledby="info-heading">
      <h2 id="info-heading">Structure info</h2>
      <dl className="info-list">
        <dt>Name</dt>
        <dd data-testid="info-name">{name}</dd>
        {info.title ? (
          <>
            <dt>Title</dt>
            <dd data-testid="info-title">{info.title}</dd>
          </>
        ) : null}
        <dt>Format</dt>
        <dd>{info.format === 'cif' ? 'mmCIF' : 'PDB'}</dd>
        <dt>Chains</dt>
        <dd data-testid="info-chains">{info.chains.length}</dd>
        <dt>Residues</dt>
        <dd data-testid="info-residues">{info.residues}</dd>
        <dt>Atoms</dt>
        <dd data-testid="info-atoms">{info.atoms}</dd>
        {info.hetAtoms > 0 ? (
          <>
            <dt>Hetero atoms</dt>
            <dd data-testid="info-het">{info.hetAtoms}</dd>
          </>
        ) : null}
      </dl>
      {info.chains.length > 1 ? (
        <table className="chain-table">
          <caption>Residues per chain</caption>
          <thead>
            <tr>
              <th scope="col">Chain</th>
              <th scope="col">Residues</th>
            </tr>
          </thead>
          <tbody>
            {info.chains.map((c) => (
              <tr key={c.id}>
                <td>{c.id}</td>
                <td>{c.residues}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
    </section>
  );
}
