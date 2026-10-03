import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';
import { createViewerMock, viewerMock } from './test/viewerMock';
import CRAMBIN from './assets/samples/1CRN.pdb?raw';
import { SAMPLES } from './lib/samples';
import { THEME_STORAGE_KEY } from './lib/theme';

type User = ReturnType<typeof userEvent.setup>;

function setup(fetchImpl: typeof fetch = vi.fn()) {
  const user = userEvent.setup();
  render(<App fetchImpl={fetchImpl} />);
  return { user, fetchImpl };
}

function infoValue(testId: string) {
  return screen.getByTestId(testId).textContent;
}

/** Pick a sample (default: the first, 1CRN) and wait for it to appear. */
async function loadSample(user: User, option?: string) {
  if (option) await user.selectOptions(screen.getByLabelText('Sample structure'), option);
  await user.click(screen.getByRole('button', { name: 'Load sample' }));
  await screen.findByTestId('info-name');
}

const anyFn = expect.any(Function);

describe('App', () => {
  beforeEach(() => {
    window.localStorage.clear();
    delete document.documentElement.dataset.theme;
  });

  it('starts empty with accessible, labelled controls', () => {
    setup();
    expect(screen.getByRole('heading', { level: 1, name: 'Molecular Viewer' })).toBeInTheDocument();
    expect(screen.getByLabelText('Upload a PDB or mmCIF file')).toHaveAttribute('type', 'file');
    expect(screen.getByLabelText('PDB ID from RCSB')).toBeInTheDocument();
    expect(screen.getByLabelText('Sample structure')).toHaveValue('1CRN');
    expect(screen.getByLabelText('Style')).toHaveValue('cartoon');
    expect(screen.getByLabelText('Color')).toHaveValue('secondary');
    expect(screen.getByLabelText('Show ligands')).toBeChecked();
    expect(screen.getByLabelText('Show water')).not.toBeChecked();
    expect(screen.getByRole('button', { name: 'Fetch' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Reset view' })).toBeDisabled();
    expect(screen.getByRole('img', { name: '3D view (no structure loaded)' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Structure info' })).not.toBeInTheDocument();
    expect(createViewerMock).toHaveBeenCalledTimes(1);
    expect(viewerMock.addModel).not.toHaveBeenCalled();
  });

  it('loads the bundled 1CRN sample and shows its structure info', async () => {
    const { user } = setup();
    await loadSample(user);

    expect(infoValue('info-name')).toBe('1CRN (crambin)');
    expect(infoValue('info-chains')).toBe('1');
    expect(infoValue('info-residues')).toBe('46');
    expect(infoValue('info-atoms')).toBe('327');
    expect(infoValue('info-title')).toMatch(/CRAMBIN$/);
    expect(screen.queryByTestId('info-het')).not.toBeInTheDocument();

    expect(viewerMock.addModel).toHaveBeenCalledWith(CRAMBIN, 'pdb');
    expect(viewerMock.setStyle).toHaveBeenCalledWith(
      {},
      { cartoon: { style: 'oval', arrows: true, thickness: 0.3, colorfunc: anyFn } },
    );
    expect(viewerMock.zoomTo).toHaveBeenCalled();
    expect(viewerMock.render).toHaveBeenCalled();
    expect(screen.getByRole('img', { name: /3D view of 1CRN \(crambin\)/ })).toBeInTheDocument();
  });

  it('describes the selected sample and offers every bundled sample', async () => {
    const { user } = setup();
    const picker = screen.getByLabelText('Sample structure');
    expect(within(picker).getAllByRole('option')).toHaveLength(SAMPLES.length);
    expect(screen.getByTestId('sample-blurb')).toHaveTextContent(SAMPLES[0].blurb);

    await user.selectOptions(picker, '4HHB');
    expect(screen.getByTestId('sample-blurb')).toHaveTextContent(/Four chains/);
    // Choosing a sample does not load it until the button is pressed.
    expect(viewerMock.addModel).not.toHaveBeenCalled();
  });

  it('applies a sample\'s showcase view: hemoglobin is coloured by chain, with 4 chains', async () => {
    const { user } = setup();
    await loadSample(user, '4HHB');

    expect(infoValue('info-name')).toBe('4HHB (hemoglobin)');
    expect(infoValue('info-chains')).toBe('4');
    expect(screen.getByLabelText('Color')).toHaveValue('chain');
    expect(screen.getByLabelText('Style')).toHaveValue('cartoon');
    expect(viewerMock.addModel).toHaveBeenCalledWith(expect.stringContaining('HEME'), 'pdb');
    // Ligands (the hemes) are layered on as ball-and-stick.
    expect(viewerMock.addStyle).toHaveBeenCalledWith(
      { hetflag: true, not: { resn: ['HOH', 'WAT', 'DOD', 'MSE'] } },
      expect.objectContaining({ stick: expect.any(Object), sphere: expect.any(Object) }),
    );
  });

  it('turns the DNA sample side-on so the double helix is visible', async () => {
    const { user } = setup();
    await loadSample(user, '1BNA');
    expect(viewerMock.rotate).toHaveBeenCalledWith(90, 'x');
  });

  it("replaces earlier view settings with the sample's own showcase view", async () => {
    const { user } = setup();
    await user.selectOptions(screen.getByLabelText('Style'), 'stick');
    await user.selectOptions(screen.getByLabelText('Color'), 'Spectrum (N to C)');
    await user.click(screen.getByLabelText('Show water'));

    await loadSample(user, '4HHB');
    expect(screen.getByLabelText('Style')).toHaveValue('cartoon');
    expect(screen.getByLabelText('Color')).toHaveValue('chain');
    expect(screen.getByLabelText('Show water')).not.toBeChecked();
  });

  it('restyles without reloading when style or colour changes', async () => {
    const { user } = setup();
    await loadSample(user);
    viewerMock.addModel.mockClear();

    viewerMock.setStyle.mockClear();
    await user.selectOptions(screen.getByLabelText('Style'), 'stick');
    expect(viewerMock.setStyle).toHaveBeenCalledWith({}, { stick: { radius: 0.2, colorfunc: anyFn } });

    viewerMock.setStyle.mockClear();
    await user.selectOptions(screen.getByLabelText('Color'), 'Spectrum (N to C)');
    expect(viewerMock.setStyle).toHaveBeenCalledWith({}, { stick: { radius: 0.2, color: 'spectrum' } });

    viewerMock.setStyle.mockClear();
    await user.selectOptions(screen.getByLabelText('Style'), 'sphere');
    await user.selectOptions(screen.getByLabelText('Color'), 'chain');
    expect(viewerMock.setStyle).toHaveBeenCalledWith({}, { sphere: { scale: 0.9, colorfunc: anyFn } });

    viewerMock.setStyle.mockClear();
    await user.selectOptions(screen.getByLabelText('Style'), 'line');
    expect(viewerMock.setStyle).toHaveBeenCalledWith({}, { line: { linewidth: 1, colorfunc: anyFn } });

    expect(viewerMock.addModel).not.toHaveBeenCalled();
  });

  it('toggles water and ligand display without reloading', async () => {
    const { user } = setup();
    await loadSample(user, '1MBN');
    viewerMock.addModel.mockClear();

    viewerMock.setStyle.mockClear();
    await user.click(screen.getByLabelText('Show water'));
    expect(viewerMock.setStyle).toHaveBeenLastCalledWith(
      { resn: ['HOH', 'WAT', 'DOD'] },
      { sphere: { radius: 0.3, color: '#5aa9e6' } },
    );

    viewerMock.addStyle.mockClear();
    await user.click(screen.getByLabelText('Show ligands'));
    expect(screen.getByLabelText('Show ligands')).not.toBeChecked();
    // With ligands off in cartoon view, no ligand layer is added (only the nucleotide-base layer).
    expect(viewerMock.addStyle).not.toHaveBeenCalledWith(
      expect.objectContaining({ hetflag: true }),
      expect.anything(),
    );
    expect(viewerMock.addModel).not.toHaveBeenCalled();
  });

  it('re-centres the camera on Reset view', async () => {
    const { user } = setup();
    await loadSample(user);
    viewerMock.zoomTo.mockClear();
    await user.click(screen.getByRole('button', { name: 'Reset view' }));
    expect(viewerMock.zoomTo).toHaveBeenCalledTimes(1);
  });

  it('Reset view also undoes rotation, and re-applies a sample\'s own starting turn', async () => {
    const { user } = setup();
    await loadSample(user, '1BNA');
    viewerMock.setView.mockClear();
    viewerMock.rotate.mockClear();
    await user.click(screen.getByRole('button', { name: 'Reset view' }));
    expect(viewerMock.setView).toHaveBeenCalledWith([0, 0, 0, 0, 0, 0, 0, 1]);
    expect(viewerMock.rotate).toHaveBeenCalledWith(90, 'x');
  });

  it('does not re-frame on a later load just because Reset was pressed earlier', async () => {
    const { user } = setup();
    await loadSample(user);
    await user.click(screen.getByRole('button', { name: 'Reset view' }));
    viewerMock.zoomTo.mockClear();
    await loadSample(user, '1UBQ');
    expect(viewerMock.zoomTo).toHaveBeenCalledTimes(1); // the load's own framing only
  });

  it('labels only the Fetch button "Fetching…" during a fetch, not while a sample loads', async () => {
    let finish!: (r: Response) => void;
    const fetchImpl = vi.fn(() => new Promise<Response>((r) => (finish = r)));
    const { user } = setup(fetchImpl as unknown as typeof fetch);
    await user.type(screen.getByLabelText('PDB ID from RCSB'), '1CRN');
    await user.click(screen.getByRole('button', { name: 'Fetch' }));
    expect(screen.getByRole('button', { name: 'Fetching…' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Load sample' })).toBeDisabled();
    finish(new Response(CRAMBIN, { status: 200 }));
    await screen.findByTestId('info-name');

    // fireEvent is synchronous: we see the UI while the sample is still loading.
    fireEvent.click(screen.getByRole('button', { name: 'Load sample' }));
    expect(screen.getByRole('button', { name: 'Load sample' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Fetching…' })).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Load sample' })).toBeEnabled());
  });

  describe('dark mode', () => {
    it('starts light and toggles the theme, the page and the 3D background', async () => {
      const { user } = setup();
      const toggle = screen.getByRole('switch', { name: 'Dark mode' });
      expect(toggle).toHaveAttribute('aria-checked', 'false');
      expect(document.documentElement.dataset.theme).toBe('light');
      expect(createViewerMock).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ backgroundColor: '#ffffff' }),
      );

      await user.click(toggle);
      expect(toggle).toHaveAttribute('aria-checked', 'true');
      expect(document.documentElement.dataset.theme).toBe('dark');
      expect(viewerMock.setBackgroundColor).toHaveBeenLastCalledWith('#0f1720', 1);
      expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark');

      await user.click(toggle);
      expect(document.documentElement.dataset.theme).toBe('light');
      expect(viewerMock.setBackgroundColor).toHaveBeenLastCalledWith('#ffffff', 1);
    });

    it('restores a saved dark theme on load, including the viewer background', () => {
      window.localStorage.setItem(THEME_STORAGE_KEY, 'dark');
      setup();
      expect(screen.getByRole('switch', { name: 'Dark mode' })).toHaveAttribute('aria-checked', 'true');
      expect(document.documentElement.dataset.theme).toBe('dark');
      expect(createViewerMock).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ backgroundColor: '#0f1720' }),
      );
    });

    it('does not save a theme the user never chose, so the OS setting keeps applying', () => {
      setup();
      expect(document.documentElement.dataset.theme).toBe('light');
      expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBeNull();
    });

    it('does not reload the structure when the theme changes', async () => {
      const { user } = setup();
      await loadSample(user);
      viewerMock.addModel.mockClear();
      await user.click(screen.getByRole('switch', { name: 'Dark mode' }));
      expect(viewerMock.addModel).not.toHaveBeenCalled();
    });
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
    await loadSample(user);
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
    await loadSample(user);
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
