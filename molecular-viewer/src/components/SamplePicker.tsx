import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { SAMPLES, sampleThumbnail, type Sample } from '../lib/samples';
import { CheckIcon, ChevronIcon } from './Icons';

interface Props {
  /** The sample currently loaded, if the loaded structure is one. */
  currentId: string | null;
  onPick: (sample: Sample) => void;
  disabled?: boolean;
}

function Thumb({ id }: { id: string }) {
  const src = sampleThumbnail(id);
  return src ? <img className="thumb" src={src} alt="" width={40} height={40} /> : <span className="thumb" />;
}

/**
 * The sample picker: a button that opens a listbox of the bundled samples,
 * each with a preview image and a one-line description. Picking one loads
 * it straight away. Follows the WAI-ARIA "select-only combobox" keyboard
 * model: arrows / Home / End move, Enter or Space picks, Escape closes.
 */
export function SamplePicker({ currentId, onPick, disabled = false }: Props) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const listId = useId();
  const optionId = (i: number) => `${listId}-opt-${i}`;
  const current = SAMPLES.find((s) => s.id === currentId) ?? null;

  function openMenu(at?: number) {
    const selected = SAMPLES.findIndex((s) => s.id === currentId);
    setActive(at ?? (selected >= 0 ? selected : 0));
    setOpen(true);
  }

  function close(refocus = true) {
    setOpen(false);
    if (refocus) buttonRef.current?.focus();
  }

  function pick(index: number) {
    close();
    onPick(SAMPLES[index]);
  }

  // Focus the list when it opens so the keyboard drives it.
  useEffect(() => {
    if (open) listRef.current?.focus();
  }, [open]);

  // Keep the active option scrolled into view.
  useEffect(() => {
    if (open) document.getElementById(optionId(active))?.scrollIntoView?.({ block: 'nearest' });
  }, [open, active]);

  // A click anywhere else closes the menu.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) close(false);
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [open]);

  function onButtonKey(e: KeyboardEvent) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      openMenu();
    }
  }

  function onListKey(e: KeyboardEvent) {
    const last = SAMPLES.length - 1;
    const moves: Record<string, number> = {
      ArrowDown: Math.min(last, active + 1),
      ArrowUp: Math.max(0, active - 1),
      Home: 0,
      End: last,
      PageDown: Math.min(last, active + 4),
      PageUp: Math.max(0, active - 4),
    };
    if (e.key in moves) {
      e.preventDefault();
      setActive(moves[e.key]);
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      pick(active);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      close();
    } else if (e.key === 'Tab') {
      close(false);
    }
  }

  return (
    <div className={`picker${open ? ' open' : ''}`} ref={rootRef}>
      <button
        ref={buttonRef}
        type="button"
        className="picker-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        disabled={disabled}
        onClick={() => (open ? close() : openMenu())}
        onKeyDown={onButtonKey}
      >
        {current ? <Thumb id={current.id} /> : <span className="thumb thumb-empty" aria-hidden="true" />}
        <span className="picker-label">
          <small>Sample</small>
          {current ? (
            <b>
              <em>{current.id}</em> {current.name}
            </b>
          ) : (
            <b>Choose a sample</b>
          )}
        </span>
        <ChevronIcon />
      </button>
      {open ? (
        <div className="picker-popover">
          <ul
            ref={listRef}
            id={listId}
            className="picker-menu"
            role="listbox"
            aria-label="Sample structures"
            tabIndex={-1}
            aria-activedescendant={optionId(active)}
            onKeyDown={onListKey}
          >
            {SAMPLES.map((s, i) => (
              <li
                key={s.id}
                id={optionId(i)}
                role="option"
                aria-selected={s.id === currentId}
                className={`picker-option${i === active ? ' active' : ''}`}
                onPointerMove={() => setActive(i)}
                onClick={() => pick(i)}
              >
                <Thumb id={s.id} />
                <span className="picker-text">
                  <b>
                    <em>{s.id}</em> {s.name}
                  </b>
                  <small>{s.tagline}</small>
                </span>
                {s.id === currentId ? <CheckIcon /> : null}
              </li>
            ))}
          </ul>
          <p className="picker-hint">
            Or drop a <b>.pdb</b> / <b>.cif</b> file anywhere on the page
          </p>
        </div>
      ) : null}
    </div>
  );
}
