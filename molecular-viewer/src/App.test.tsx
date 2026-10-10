import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';
import { createViewerMock, viewerMock, SurfaceType } from './test/viewerMock';
import CRAMBIN from './assets/samples/1CRN.pdb?raw';
import { SAMPLES } from './lib/samples';
import { LIGAND_STICKS } from './lib/styles';
import { THEME_STORAGE_KEY } from './lib/theme';

type User = ReturnType<typeof userEvent.setup>;

function setup(fetchImpl: typeof fetch = vi.fn(), initialSearch = '') {
  const user = userEvent.setup();
  const view = render(<App fetchImpl={fetchImpl} initialSearch={initialSearch} />);
  return { user, fetchImpl, container: view.container };
}

const text = (testId: string) => screen.getByTestId(testId).textContent;
const pickerButton = () => screen.getByRole('button', { name: /^Sample/ });
const radio = (name: string) => screen.getByRole('radio', { name });
const toggle = (name: string) => screen.getByRole('switch', { name });

/** Pick a sample from the header menu (default: the first, 1CRN) and wait for it. */
async function loadSample(user: User, id = SAMPLES[0].id) {
  await user.click(pickerButton());
  await user.click(screen.getByRole('option', { name: new RegExp(`^${id} `) }));
  const sample = SAMPLES.find((s) => s.id === id)!;
  await waitFor(() => expect(text('info-name')).toBe(sample.name));
}

const anyFn = expect.any(Function);
const LIGAND_SEL = { hetflag: true, not: { resn: ['HOH', 'WAT', 'DOD', 'MSE'] } };

describe('App', () => {
  beforeEach(() => {
    window.localStorage.clear();
    delete document.documentElement.dataset.theme;
  });

  it('starts empty with accessible, labelled controls', () => {
    setup();
    expect(screen.getByRole('heading', { level: 1, name: 'Molecular Viewer' })).toBeInTheDocument();
    expect(screen.getByLabelText('Open file')).toHaveAttribute('type', 'file');
    expect(screen.getByLabelText('PDB ID from RCSB')).toBeInTheDocument();
    expect(pickerButton()).toHaveAttribute('aria-expanded', 'false');
    expect(pickerButton()).toHaveTextContent('Choose a sample');
    expect(screen.getByRole('button', { name: 'Fetch' })).toBeDisabled();
    for (const name of ['Reset view', 'Save image', 'Copy share link']) {
      expect(screen.getByRole('button', { name })).toBeDisabled();
    }
    expect(screen.getByRole('img', { name: '3D view (no structure loaded)' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Pick a sample to get started' })).toBeInTheDocument();
    // Nothing to describe or restyle yet.
    expect(screen.queryByTestId('info-name')).not.toBeInTheDocument();
    expect(screen.queryByTestId('legend')).not.toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Display options' })).not.toBeInTheDocument();
    expect(createViewerMock).toHaveBeenCalledTimes(1);
    expect(viewerMock.addModel).not.toHaveBeenCalled();
  });

  it('loads 1CRN from the empty-state button and describes it', async () => {
    const { user } = setup();
    await user.click(screen.getByRole('button', { name: 'Load 1CRN Crambin' }));
    await waitFor(() => expect(text('info-name')).toBe('Crambin'));

    expect(text('info-chains')).toBe('1 chain');
    expect(text('info-residues')).toBe('46 residues');
    expect(text('info-atoms')).toBe('327 atoms');
    expect(text('info-title')).toBe(SAMPLES[0].blurb);
    expect(screen.queryByTestId('info-ligand')).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Pick a sample to get started' })).not.toBeInTheDocument();

    expect(viewerMock.addModel).toHaveBeenCalledWith(CRAMBIN, 'pdb');
    expect(viewerMock.setStyle).toHaveBeenCalledWith(
      {},
      { cartoon: { style: 'oval', arrows: true, thickness: 0.3, colorfunc: anyFn } },
    );
    expect(viewerMock.zoomTo).toHaveBeenCalled();
    expect(viewerMock.render).toHaveBeenCalled();
    expect(screen.getByRole('img', { name: /3D view of 1CRN \(Crambin\)/ })).toBeInTheDocument();
    expect(pickerButton()).toHaveTextContent('1CRN Crambin');
    expect(screen.getByRole('button', { name: 'Reset view' })).toBeEnabled();
  });

  describe('sample menu', () => {
    it('lists every sample with its tagline and marks the loaded one', async () => {
      const { user } = setup();
      await user.click(pickerButton());
      const list = screen.getByRole('listbox', { name: 'Sample structures' });
      const options = within(list).getAllByRole('option');
      expect(options).toHaveLength(SAMPLES.length);
      SAMPLES.forEach((s, i) => expect(options[i]).toHaveTextContent(s.tagline));
      expect(options.every((o) => o.getAttribute('aria-selected') === 'false')).toBe(true);
      expect(list.parentElement).toHaveTextContent(/drop a \.pdb \/ \.cif file anywhere on the page/i);

      await user.click(options[3]); // 4HHB
      expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
      await waitFor(() => expect(text('info-name')).toBe('Hemoglobin'));
      await user.click(pickerButton());
      expect(screen.getByRole('option', { name: /^4HHB / })).toHaveAttribute('aria-selected', 'true');
    });

    it('works from the keyboard: arrows move, Enter picks, Escape closes', async () => {
      const { user } = setup();
      pickerButton().focus();
      await user.keyboard('{ArrowDown}');
      const list = screen.getByRole('listbox');
      expect(list).toHaveFocus();
      const activeId = () => list.getAttribute('aria-activedescendant');
      const optionIds = within(list).getAllByRole('option').map((o) => o.id);
      expect(activeId()).toBe(optionIds[0]);

      await user.keyboard('{ArrowDown}{ArrowDown}');
      expect(activeId()).toBe(optionIds[2]);
      await user.keyboard('{End}');
      expect(activeId()).toBe(optionIds.at(-1));
      await user.keyboard('{Escape}');
      expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
      expect(pickerButton()).toHaveFocus();
      expect(viewerMock.addModel).not.toHaveBeenCalled();

      await user.keyboard('{ArrowDown}{ArrowDown}{Enter}'); // 1UBQ
      await waitFor(() => expect(text('info-name')).toBe('Ubiquitin'));
      expect(pickerButton()).toHaveFocus();
    });

    it('closes when you click elsewhere', async () => {
      const { user } = setup();
      await user.click(pickerButton());
      expect(screen.getByRole('listbox')).toBeInTheDocument();
      await user.click(screen.getByRole('heading', { level: 1 }));
      expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    });
  });

  it("applies a sample's showcase view: hemoglobin is coloured by chain, with 4 chains", async () => {
    const { user } = setup();
    await loadSample(user, '4HHB');

    expect(text('info-chains')).toBe('4 chains');
    expect(screen.getAllByTestId('info-ligand').map((l) => l.textContent)).toEqual(['4 × HEM', '2 × PO4']);
    expect(text('info-waters')).toBe('221 waters');
    expect(radio('Chain')).toBeChecked();
    expect(radio('Cartoon')).toBeChecked();
    expect(viewerMock.addModel).toHaveBeenCalledWith(expect.stringContaining('HEME'), 'pdb');
    // The hemes are drawn as ball-and-stick in element colours.
    expect(viewerMock.setStyle).toHaveBeenCalledWith(LIGAND_SEL, LIGAND_STICKS);
  });

  it('turns the DNA sample side-on so the double helix is visible', async () => {
    const { user } = setup();
    await loadSample(user, '1BNA');
    expect(viewerMock.rotate).toHaveBeenCalledWith(90, 'x');
  });

  it('turns HIV-1 protease to look into the cleft that holds the inhibitor', async () => {
    const { user } = setup();
    await loadSample(user, '1HSG');
    expect(viewerMock.rotate).toHaveBeenCalledWith(173.9, { x: 0.6855, y: -0.3796, z: -0.6213 });
  });

  it('turns first, then fits, then zooms out to clear the display bar', async () => {
    // jsdom lays nothing out, so give the stage and the display bar real boxes.
    const rects: Record<string, Partial<DOMRect>> = {
      stage: { left: 0, top: 61, right: 1300, bottom: 800 },
      'display-bar': { left: 220, top: 737, right: 1080, bottom: 784 },
    };
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
      const key = Object.keys(rects).find((k) => this.classList.contains(k));
      return { left: 0, top: 0, right: 0, bottom: 0, ...(key ? rects[key] : {}) } as DOMRect;
    });
    try {
      const { user } = setup();
      await loadSample(user, '1BNA');
      const order = (fn: { mock: { invocationCallOrder: number[] } }) => fn.mock.invocationCallOrder.at(-1)!;
      expect(order(viewerMock.rotate)).toBeLessThan(order(viewerMock.zoomTo));
      expect(order(viewerMock.zoomTo)).toBeLessThan(order(viewerMock.zoom));
      const [scale] = viewerMock.zoom.mock.lastCall as [number];
      expect(scale).toBeCloseTo((739 - 2 * 75) / 739, 6);
    } finally {
      vi.restoreAllMocks();
    }
  });

  it("replaces earlier view settings with the sample's own showcase view", async () => {
    const { user } = setup();
    await loadSample(user, '1CRN');
    await user.click(radio('Stick'));
    await user.click(radio('Rainbow'));
    await user.click(toggle('Water'));

    await loadSample(user, '4HHB');
    expect(radio('Cartoon')).toBeChecked();
    expect(radio('Chain')).toBeChecked();
    expect(toggle('Water')).not.toBeChecked();
  });

  it('restyles without reloading when style or colour changes', async () => {
    const { user } = setup();
    await loadSample(user);
    viewerMock.addModel.mockClear();

    viewerMock.setStyle.mockClear();
    await user.click(radio('Stick'));
    expect(viewerMock.setStyle).toHaveBeenCalledWith({}, { stick: { radius: 0.2, colorfunc: anyFn } });

    // Rainbow outside a cartoon is spelled out per residue (3Dmol only does it for cartoons).
    viewerMock.setStyle.mockClear();
    await user.click(radio('Rainbow'));
    const [, style] = viewerMock.setStyle.mock.calls.find(([sel]) => Object.keys(sel).length === 0)!;
    const paint = (style as { stick: { colorfunc: (a: object) => string } }).stick.colorfunc;
    expect(paint({ resi: 1 })).not.toBe(paint({ resi: 46 }));

    viewerMock.setStyle.mockClear();
    await user.click(radio('Sphere'));
    await user.click(radio('Chain'));
    expect(viewerMock.setStyle).toHaveBeenCalledWith({}, { sphere: { scale: 0.9, colorfunc: anyFn } });

    viewerMock.setStyle.mockClear();
    await user.click(radio('Line'));
    expect(viewerMock.setStyle).toHaveBeenCalledWith({}, { line: { linewidth: 1, colorfunc: anyFn } });

    expect(viewerMock.addModel).not.toHaveBeenCalled();
  });

  it('toggles water and ligand display without reloading', async () => {
    const { user } = setup();
    await loadSample(user, '1MBN');
    viewerMock.addModel.mockClear();

    viewerMock.setStyle.mockClear();
    await user.click(toggle('Water'));
    expect(viewerMock.setStyle).toHaveBeenLastCalledWith(
      { resn: ['HOH', 'WAT', 'DOD'] },
      { sphere: { radius: 0.3, color: '#5aa9e6' } },
    );

    viewerMock.setStyle.mockClear();
    await user.click(toggle('Ligands'));
    expect(toggle('Ligands')).not.toBeChecked();
    expect(viewerMock.setStyle).not.toHaveBeenCalledWith(LIGAND_SEL, expect.anything());
    expect(viewerMock.addModel).not.toHaveBeenCalled();
  });

  describe('legend', () => {
    it('follows the colour mode', async () => {
      const { user } = setup();
      await loadSample(user, '4HHB');
      const legend = () => screen.getByTestId('legend');
      expect(within(legend()).getByRole('heading')).toHaveTextContent('By chain');
      for (const c of ['A', 'B', 'C', 'D']) expect(legend()).toHaveTextContent(`Chain ${c}`);
      // Hemes are on, so the element key is shown.
      expect(legend()).toHaveTextContent(/Ligands:\s*C\s*N\s*O/);

      await user.click(radio('Structure'));
      expect(within(legend()).getByRole('heading')).toHaveTextContent('By secondary structure');
      expect(within(legend()).getAllByRole('listitem').map((li) => li.textContent)).toEqual([
        'Helix',
        'Sheet',
        'Coil',
      ]);

      await user.click(radio('Rainbow'));
      expect(legend()).toHaveTextContent(/N terminus\s*C terminus/);

      await user.click(toggle('Ligands'));
      expect(legend()).not.toHaveTextContent('Ligands:');
    });

    it('leaves out the ligand key for a structure with no ligands', async () => {
      const { user } = setup();
      await loadSample(user, '1CRN');
      expect(screen.getByTestId('legend')).not.toHaveTextContent('Ligands:');
    });
  });

  describe('hover label', () => {
    const hoverCallbacks = () => {
      const call = viewerMock.setHoverable.mock.calls.at(-1)! as unknown[];
      return { over: call[2] as (a: object) => void, out: call[3] as () => void };
    };

    it('names the residue under the pointer and hides when it leaves', async () => {
      const { user } = setup();
      await loadSample(user, '4HHB');
      expect(viewerMock.setHoverable).toHaveBeenCalledWith({}, true, anyFn, anyFn);

      act(() => hoverCallbacks().over({ chain: 'A', resn: 'HIS', resi: 87, ss: 'h' }));
      expect(screen.getByTestId('hover-tip')).toHaveTextContent('Chain A · HIS 87 · α-helix');

      act(() => hoverCallbacks().out());
      expect(screen.queryByTestId('hover-tip')).not.toBeInTheDocument();
    });

    it('stays hidden while dragging to rotate', async () => {
      const { user } = setup();
      await loadSample(user);
      fireEvent.pointerDown(screen.getByTestId('viewer-canvas'));
      act(() => hoverCallbacks().over({ chain: 'A', resn: 'THR', resi: 1 }));
      expect(screen.queryByTestId('hover-tip')).not.toBeInTheDocument();
      fireEvent.pointerUp(screen.getByTestId('viewer-canvas'));
      act(() => hoverCallbacks().over({ chain: 'A', resn: 'THR', resi: 1 }));
      expect(screen.getByTestId('hover-tip')).toBeInTheDocument();
    });
  });

  describe('surface style', () => {
    it('draws a translucent polymer surface over the cartoon, with a progress note', async () => {
      let finish!: () => void;
      const { user } = setup();
      await loadSample(user, '1HSG');
      viewerMock.addSurface.mockImplementation(() => new Promise<void>((r) => (finish = r)));

      await user.click(radio('Surface'));
      expect(viewerMock.addSurface).toHaveBeenCalledWith(
        SurfaceType.MS,
        expect.objectContaining({ opacity: expect.any(Number), colorfunc: anyFn }),
        { hetflag: false },
      );
      // The inhibitor stays visible as sticks inside the surface.
      expect(viewerMock.setStyle).toHaveBeenCalledWith(LIGAND_SEL, LIGAND_STICKS);
      expect(screen.getByRole('status')).toHaveTextContent('Computing surface…');

      await act(async () => finish());
      expect(screen.queryByRole('status')).not.toBeInTheDocument();
    });

    it('removes the surface when switching to another style', async () => {
      const { user } = setup();
      await loadSample(user);
      await user.click(radio('Surface'));
      viewerMock.addSurface.mockClear();
      viewerMock.removeAllSurfaces.mockClear();
      await user.click(radio('Cartoon'));
      expect(viewerMock.removeAllSurfaces).toHaveBeenCalled();
      expect(viewerMock.addSurface).not.toHaveBeenCalled();
    });
  });

  describe('toolbar', () => {
    afterEach(() => {
      vi.restoreAllMocks();
      delete (document as { fullscreenEnabled?: boolean }).fullscreenEnabled;
    });

    it('re-centres the camera on Reset view', async () => {
      const { user } = setup();
      await loadSample(user);
      viewerMock.zoomTo.mockClear();
      await user.click(screen.getByRole('button', { name: 'Reset view' }));
      expect(viewerMock.zoomTo).toHaveBeenCalledTimes(1);
    });

    it("Reset view also undoes rotation, and re-applies a sample's own starting turn", async () => {
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

    it('saves the current view as a PNG named after the structure', async () => {
      const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
        this: HTMLAnchorElement,
      ) {
        expect(this.download).toBe('4HHB.png');
        expect(this.href).toBe('data:image/png;base64,AAAA');
      });
      const { user } = setup();
      await loadSample(user, '4HHB');
      await user.click(screen.getByRole('button', { name: 'Save image' }));
      expect(viewerMock.pngURI).toHaveBeenCalled();
      expect(click).toHaveBeenCalledTimes(1);
      expect(await screen.findByText('Saved 4HHB.png')).toBeInTheDocument();
    });

    it('copies a link to the current view', async () => {
      const { user } = setup();
      const write = vi.spyOn(navigator.clipboard, 'writeText');
      await loadSample(user, '1EMA');
      await user.click(radio('Stick'));
      await user.click(screen.getByRole('button', { name: 'Copy share link' }));

      const url = new URL(write.mock.calls[0][0]);
      expect(url.searchParams.get('sample')).toBe('1EMA');
      expect(url.searchParams.get('style')).toBe('stick');
      expect(url.searchParams.get('color')).toBe('secondary');
      expect(await screen.findByText('Link copied to the clipboard')).toBeInTheDocument();
    });

    it('shows the link instead when the clipboard is unavailable', async () => {
      const { user } = setup();
      vi.spyOn(navigator.clipboard, 'writeText').mockRejectedValue(new Error('denied'));
      await loadSample(user, '1CRN');
      await user.click(screen.getByRole('button', { name: 'Copy share link' }));
      expect(await screen.findByText(/^Copy this link: .*\?sample=1CRN/)).toBeInTheDocument();
    });

    it('cannot share a file opened from the computer', async () => {
      const { user } = setup();
      await user.upload(screen.getByLabelText('Open file'), new File([CRAMBIN], 'crambin.pdb'));
      await waitFor(() => expect(text('info-name')).toBe('crambin.pdb'));
      const share = screen.getByRole('button', { name: 'Copy share link' });
      expect(share).toBeDisabled();
      expect(share).toHaveAttribute('title', expect.stringMatching(/file opened from your computer/));
    });

    it('offers full screen only where the browser supports it', async () => {
      setup();
      expect(screen.queryByRole('button', { name: 'Full screen' })).not.toBeInTheDocument();
    });

    it('enters full screen on the viewer stage', async () => {
      Object.defineProperty(document, 'fullscreenEnabled', { value: true, configurable: true });
      const request = vi.fn(async () => undefined);
      HTMLElement.prototype.requestFullscreen = request;
      const { user, container } = setup();
      await user.click(screen.getByRole('button', { name: 'Full screen' }));
      expect(request).toHaveBeenCalledTimes(1);
      expect(request.mock.contexts[0]).toBe(container.querySelector('main.stage'));
    });
  });

  describe('shared links', () => {
    it('opens a shared sample with its display options', async () => {
      setup(vi.fn(), '?sample=4HHB&style=stick&color=spectrum&water=1');
      await waitFor(() => expect(text('info-name')).toBe('Hemoglobin'));
      expect(radio('Stick')).toBeChecked();
      expect(radio('Rainbow')).toBeChecked();
      expect(toggle('Water')).toBeChecked();
      expect(toggle('Ligands')).toBeChecked(); // not in the link: the sample's own setting
    });

    it('fetches a shared PDB entry', async () => {
      const fetchImpl = vi.fn(async () => new Response(CRAMBIN, { status: 200 }));
      setup(fetchImpl, '?pdb=1crn&color=chain');
      await waitFor(() => expect(text('info-name')).toBe('1CRN'));
      expect(fetchImpl).toHaveBeenCalledWith('https://files.rcsb.org/download/1CRN.pdb', expect.anything());
      expect(radio('Chain')).toBeChecked();
    });

    it('ignores a link with nothing valid to open', () => {
      const fetchImpl = vi.fn();
      setup(fetchImpl, '?pdb=<script>&sample=nope');
      expect(fetchImpl).not.toHaveBeenCalled();
      expect(screen.getByRole('heading', { name: 'Pick a sample to get started' })).toBeInTheDocument();
    });
  });

  it('labels only the Fetch button "Fetching…" during a fetch, not while a sample loads', async () => {
    let finish!: (r: Response) => void;
    const fetchImpl = vi.fn(() => new Promise<Response>((r) => (finish = r)));
    const { user } = setup(fetchImpl as unknown as typeof fetch);
    await user.type(screen.getByLabelText('PDB ID from RCSB'), '1CRN');
    await user.click(screen.getByRole('button', { name: 'Fetch' }));
    expect(screen.getByRole('button', { name: 'Fetching…' })).toBeDisabled();
    expect(screen.getByRole('status')).toHaveTextContent('Fetching 1CRN from RCSB…');
    finish(new Response(CRAMBIN, { status: 200 }));
    await waitFor(() => expect(text('info-name')).toBe('1CRN'));

    // fireEvent is synchronous: we see the UI while the sample is still loading.
    fireEvent.click(pickerButton());
    fireEvent.click(screen.getByRole('option', { name: /^1UBQ / }));
    expect(screen.getByRole('status')).toHaveTextContent('Loading 1UBQ Ubiquitin…');
    expect(screen.getByRole('button', { name: 'Fetch' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Fetching…' })).not.toBeInTheDocument();
    await waitFor(() => expect(text('info-name')).toBe('Ubiquitin'));
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('ignores a second sample pick while one is still loading', async () => {
    setup();
    fireEvent.click(pickerButton());
    fireEvent.click(screen.getByRole('option', { name: /^1UBQ / }));
    fireEvent.click(pickerButton());
    fireEvent.click(screen.getByRole('option', { name: /^4HHB / }));
    await waitFor(() => expect(text('info-name')).toBe('Ubiquitin'));
    // Give an (incorrectly) accepted second pick time to land.
    await act(() => new Promise((r) => setTimeout(r, 150)));
    expect(text('info-name')).toBe('Ubiquitin');
    expect(viewerMock.addModel).toHaveBeenCalledTimes(1);
  });

  describe('dark mode', () => {
    it('starts light and toggles the theme, the page and the 3D background', async () => {
      const { user } = setup();
      const button = toggle('Dark mode');
      expect(button).toHaveAttribute('aria-checked', 'false');
      expect(button).toHaveAttribute('title', 'Switch to dark mode');
      expect(document.documentElement.dataset.theme).toBe('light');
      expect(createViewerMock).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ backgroundColor: '#ffffff' }),
      );

      await user.click(button);
      expect(button).toHaveAttribute('aria-checked', 'true');
      expect(button).toHaveAttribute('title', 'Switch to light mode');
      expect(document.documentElement.dataset.theme).toBe('dark');
      expect(viewerMock.setBackgroundColor).toHaveBeenLastCalledWith('#0f1720', 1);
      expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark');

      await user.click(button);
      expect(document.documentElement.dataset.theme).toBe('light');
      expect(viewerMock.setBackgroundColor).toHaveBeenLastCalledWith('#ffffff', 1);
    });

    it('restores a saved dark theme on load, including the viewer background', () => {
      window.localStorage.setItem(THEME_STORAGE_KEY, 'dark');
      setup();
      expect(toggle('Dark mode')).toHaveAttribute('aria-checked', 'true');
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
      await user.click(toggle('Dark mode'));
      expect(viewerMock.addModel).not.toHaveBeenCalled();
    });
  });

  it('fetches a structure by PDB ID', async () => {
    const fetchImpl = vi.fn(async () => new Response(CRAMBIN, { status: 200 }));
    const { user } = setup(fetchImpl);
    await user.type(screen.getByLabelText('PDB ID from RCSB'), '1crn');
    await user.click(screen.getByRole('button', { name: 'Fetch' }));

    await waitFor(() => expect(text('info-name')).toBe('1CRN'));
    expect(fetchImpl).toHaveBeenCalledWith('https://files.rcsb.org/download/1CRN.pdb', expect.anything());
    expect(text('info-atoms')).toBe('327 atoms');
    expect(text('info-title')).toMatch(/CRAMBIN$/); // a fetched entry shows its own TITLE
    expect(viewerMock.addModel).toHaveBeenCalledWith(CRAMBIN, 'pdb');
    expect(pickerButton()).toHaveTextContent('Choose a sample');
  });

  it('submits the fetch form with Enter', async () => {
    const fetchImpl = vi.fn(async () => new Response(CRAMBIN, { status: 200 }));
    const { user } = setup(fetchImpl);
    await user.type(screen.getByLabelText('PDB ID from RCSB'), '1CRN{Enter}');
    await waitFor(() => expect(text('info-name')).toBe('1CRN'));
  });

  it('shows an alert when the fetch fails and keeps the current structure', async () => {
    const fetchImpl = vi.fn(async () => new Response('', { status: 404 }));
    const { user } = setup(fetchImpl);
    await loadSample(user);
    await user.type(screen.getByLabelText('PDB ID from RCSB'), '9ZZZ');
    await user.click(screen.getByRole('button', { name: 'Fetch' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/No PDB-format file for 9ZZZ/);
    expect(text('info-name')).toBe('Crambin');

    await user.click(screen.getByRole('button', { name: 'Dismiss error' }));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
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
    await user.upload(screen.getByLabelText('Open file'), file);

    await waitFor(() => expect(text('info-name')).toBe('crambin.pdb'));
    expect(text('info-residues')).toBe('46 residues');
    expect(viewerMock.addModel).toHaveBeenCalledWith(CRAMBIN, 'pdb');
  });

  it('loads an uploaded mmCIF file as cif and lists its chains in the legend', async () => {
    const cif = [
      'data_DEMO',
      "_struct.title 'Two chain demo'",
      'loop_',
      '_atom_site.group_PDB',
      '_atom_site.label_comp_id',
      '_atom_site.auth_asym_id',
      '_atom_site.auth_seq_id',
      'ATOM GLY A 1',
      'ATOM ALA A 2',
      'ATOM GLY B 1',
      'HETATM HEM C 100',
      '#',
    ].join('\n');
    const { user } = setup();
    await user.upload(screen.getByLabelText('Open file'), new File([cif], 'demo.cif'));

    await waitFor(() => expect(text('info-name')).toBe('demo.cif'));
    expect(viewerMock.addModel).toHaveBeenCalledWith(cif, 'cif');
    expect(text('info-chains')).toBe('2 chains');
    expect(text('info-title')).toBe('Two chain demo');
    expect(text('info-ligand')).toBe('HEM');
    expect(screen.getByText('mmCIF')).toBeInTheDocument();

    await user.click(radio('Chain'));
    const items = within(screen.getByTestId('legend')).getAllByRole('listitem');
    expect(items.map((li) => li.textContent)).toEqual(['Chain A · 2 res', 'Chain B · 1 res']);
  });

  it('opens a .pdb or .cif file dropped anywhere on the page', async () => {
    const { container } = setup();
    const app = container.querySelector('.app')!;
    const file = new File([CRAMBIN], 'dropped.pdb');
    const dataTransfer = { types: ['Files'], files: [file], dropEffect: 'none' };

    fireEvent.dragEnter(app, { dataTransfer });
    expect(screen.getByText('Drop a .pdb or .cif file to open it')).toBeInTheDocument();
    fireEvent.dragOver(app, { dataTransfer });
    fireEvent.drop(app, { dataTransfer });

    expect(screen.queryByText('Drop a .pdb or .cif file to open it')).not.toBeInTheDocument();
    await waitFor(() => expect(text('info-name')).toBe('dropped.pdb'));

    // The overlay's enter/leave count starts over after a drop.
    fireEvent.dragEnter(app, { dataTransfer });
    fireEvent.dragLeave(app, { dataTransfer });
    expect(screen.queryByText('Drop a .pdb or .cif file to open it')).not.toBeInTheDocument();
  });

  it('ignores drags that carry no files, such as selected text', () => {
    const { container } = setup();
    fireEvent.dragEnter(container.querySelector('.app')!, { dataTransfer: { types: ['text/plain'] } });
    expect(screen.queryByText('Drop a .pdb or .cif file to open it')).not.toBeInTheDocument();
  });

  it('refuses an upload over 50 MB without reading it', async () => {
    const { user } = setup();
    const big = new File(['x'], 'huge.pdb');
    Object.defineProperty(big, 'size', { value: 51 * 1024 * 1024 });
    const read = vi.spyOn(big, 'text');
    await user.upload(screen.getByLabelText('Open file'), big);
    expect(await screen.findByRole('alert')).toHaveTextContent('huge.pdb is larger than 50 MB.');
    expect(read).not.toHaveBeenCalled();
  });

  it('reports an unreadable upload without replacing the current structure', async () => {
    const { user } = setup();
    await loadSample(user);
    viewerMock.addModel.mockClear();
    await user.upload(screen.getByLabelText('Open file'), new File(['hello world'], 'notes.pdb'));

    expect(await screen.findByRole('alert')).toHaveTextContent(/Could not read notes.pdb/);
    expect(text('info-name')).toBe('Crambin');
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
