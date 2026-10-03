import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import App from './App';
import { createViewerMock, viewerMock } from './test/viewerMock';
import CRAMBIN from './assets/1CRN.pdb?raw';

function setup(fetchImpl: typeof fetch = vi.fn()) {
  const user = userEvent.setup();
  render(<App fetchImpl={fetchImpl} />);
  return { user, fetchImpl };
}

function infoValue(testId: string) {
  return screen.getByTestId(testId).textContent;
}

describe('App', () => {
  it('starts empty with accessible, labelled controls', () => {
    setup();
    expect(screen.getByRole('heading', { level: 1, name: 'Molecular Viewer' })).toBeInTheDocument();
    expect(screen.getByLabelText('Upload a PDB or mmCIF file')).toHaveAttribute('type', 'file');
    expect(screen.getByLabelText('PDB ID from RCSB')).toBeInTheDocument();
    expect(screen.getByLabelText('Style')).toHaveValue('cartoon');
    expect(screen.getByLabelText('Color')).toHaveValue('secondary');
    expect(screen.getByRole('button', { name: 'Fetch' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Reset view' })).toBeDisabled();
    expect(screen.getByRole('img', { name: '3D view (no structure loaded)' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Structure info' })).not.toBeInTheDocument();
    expect(createViewerMock).toHaveBeenCalledTimes(1);
    expect(viewerMock.addModel).not.toHaveBeenCalled();
  });

  it('loads the bundled 1CRN sample and shows its structure info', async () => {
    const { user } = setup();
    await user.click(screen.getByRole('button', { name: /Load sample/ }));

    expect(infoValue('info-name')).toBe('1CRN (crambin)');
    expect(infoValue('info-chains')).toBe('1');
    expect(infoValue('info-residues')).toBe('46');
    expect(infoValue('info-atoms')).toBe('327');
    expect(infoValue('info-title')).toMatch(/CRAMBIN$/);
    expect(screen.queryByTestId('info-het')).not.toBeInTheDocument();

    expect(viewerMock.addModel).toHaveBeenCalledWith(CRAMBIN, 'pdb');
    expect(viewerMock.setStyle).toHaveBeenLastCalledWith({}, { cartoon: { colorscheme: 'ssJmol' } });
    expect(viewerMock.zoomTo).toHaveBeenCalled();
    expect(viewerMock.render).toHaveBeenCalled();
    expect(screen.getByRole('img', { name: /3D view of 1CRN \(crambin\)/ })).toBeInTheDocument();
  });

  it('restyles without reloading when style or colour changes', async () => {
    const { user } = setup();
    await user.click(screen.getByRole('button', { name: /Load sample/ }));
    viewerMock.addModel.mockClear();

    await user.selectOptions(screen.getByLabelText('Style'), 'stick');
    expect(viewerMock.setStyle).toHaveBeenLastCalledWith({}, { stick: { radius: 0.2, colorscheme: 'ssJmol' } });

    await user.selectOptions(screen.getByLabelText('Color'), 'Spectrum (N to C)');
    expect(viewerMock.setStyle).toHaveBeenLastCalledWith({}, { stick: { radius: 0.2, color: 'spectrum' } });

    await user.selectOptions(screen.getByLabelText('Style'), 'sphere');
    await user.selectOptions(screen.getByLabelText('Color'), 'chain');
    expect(viewerMock.setStyle).toHaveBeenLastCalledWith({}, { sphere: { scale: 0.9, colorscheme: 'chain' } });

    await user.selectOptions(screen.getByLabelText('Style'), 'line');
    expect(viewerMock.setStyle).toHaveBeenLastCalledWith({}, { line: { linewidth: 1, colorscheme: 'chain' } });

    expect(viewerMock.addModel).not.toHaveBeenCalled();
  });

  it('re-centres the camera on Reset view', async () => {
    const { user } = setup();
    await user.click(screen.getByRole('button', { name: /Load sample/ }));
    viewerMock.zoomTo.mockClear();
    await user.click(screen.getByRole('button', { name: 'Reset view' }));
    expect(viewerMock.zoomTo).toHaveBeenCalledTimes(1);
  });

  it('fetches a structure by PDB ID', async () => {
    const fetchImpl = vi.fn(async () => new Response(CRAMBIN, { status: 200 }));
    const { user } = setup(fetchImpl);
    await user.type(screen.getByLabelText('PDB ID from RCSB'), '1crn');
    await user.click(screen.getByRole('button', { name: 'Fetch' }));

    await waitFor(() => expect(infoValue('info-name')).toBe('1CRN'));
    expect(fetchImpl).toHaveBeenCalledWith('https://files.rcsb.org/download/1CRN.pdb', expect.anything());
    expect(infoValue('info-atoms')).toBe('327');
    expect(viewerMock.addModel).toHaveBeenCalledWith(CRAMBIN, 'pdb');
  });

  it('submits the fetch form with Enter', async () => {
    const fetchImpl = vi.fn(async () => new Response(CRAMBIN, { status: 200 }));
    const { user } = setup(fetchImpl);
    await user.type(screen.getByLabelText('PDB ID from RCSB'), '1CRN{Enter}');
    await waitFor(() => expect(infoValue('info-name')).toBe('1CRN'));
  });

  it('shows an alert when the fetch fails and keeps the current structure', async () => {
    const fetchImpl = vi.fn(async () => new Response('', { status: 404 }));
    const { user } = setup(fetchImpl);
    await user.click(screen.getByRole('button', { name: /Load sample/ }));
    await user.type(screen.getByLabelText('PDB ID from RCSB'), '9ZZZ');
    await user.click(screen.getByRole('button', { name: 'Fetch' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/No PDB-format file for 9ZZZ/);
    expect(infoValue('info-name')).toBe('1CRN (crambin)');
  });

  it('rejects an invalid PDB ID with a helpful message', async () => {
    const { user, fetchImpl } = setup();
    await user.type(screen.getByLabelText('PDB ID from RCSB'), 'abcd');
    await user.click(screen.getByRole('button', { name: 'Fetch' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/not a valid PDB ID/);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('loads an uploaded PDB file', async () => {
    const { user } = setup();
    const file = new File([CRAMBIN], 'crambin.pdb', { type: 'chemical/x-pdb' });
    await user.upload(screen.getByLabelText('Upload a PDB or mmCIF file'), file);

    await waitFor(() => expect(infoValue('info-name')).toBe('crambin.pdb'));
    expect(infoValue('info-residues')).toBe('46');
    expect(viewerMock.addModel).toHaveBeenCalledWith(CRAMBIN, 'pdb');
  });

  it('loads an uploaded mmCIF file as cif and lists multiple chains', async () => {
    const cif = [
      'data_DEMO',
      "_struct.title 'Two chain demo'",
      'loop_',
      '_atom_site.group_PDB',
      '_atom_site.auth_asym_id',
      '_atom_site.auth_seq_id',
      'ATOM A 1',
      'ATOM A 2',
      'ATOM B 1',
      'HETATM C 100',
      '#',
    ].join('\n');
    const { user } = setup();
    await user.upload(
      screen.getByLabelText('Upload a PDB or mmCIF file'),
      new File([cif], 'demo.cif'),
    );

    await waitFor(() => expect(infoValue('info-name')).toBe('demo.cif'));
    expect(viewerMock.addModel).toHaveBeenCalledWith(cif, 'cif');
    expect(infoValue('info-chains')).toBe('2');
    expect(infoValue('info-het')).toBe('1');
    const table = screen.getByRole('table', { name: 'Residues per chain' });
    expect(within(table).getAllByRole('row')).toHaveLength(3);
  });

  it('reports an unreadable upload without replacing the current structure', async () => {
    const { user } = setup();
    await user.click(screen.getByRole('button', { name: /Load sample/ }));
    viewerMock.addModel.mockClear();
    await user.upload(
      screen.getByLabelText('Upload a PDB or mmCIF file'),
      new File(['hello world'], 'notes.pdb'),
    );

    expect(await screen.findByRole('alert')).toHaveTextContent(/Could not read notes.pdb/);
    expect(infoValue('info-name')).toBe('1CRN (crambin)');
    expect(viewerMock.addModel).not.toHaveBeenCalled();
  });

  it('shows a WebGL error when the viewer cannot be created', () => {
    createViewerMock.mockImplementationOnce(() => {
      throw new Error('WebGL not supported');
    });
    setup();
    expect(screen.getByRole('alert')).toHaveTextContent(/does not support WebGL/);
  });
});
