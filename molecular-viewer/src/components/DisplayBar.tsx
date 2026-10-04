import { useId } from 'react';
import {
  COLOR_SCHEMES,
  COLOR_SCHEME_LABELS,
  COLOR_SCHEME_TITLES,
  REPRESENTATIONS,
  REPRESENTATION_LABELS,
  type DisplayOptions,
} from '../lib/styles';

interface Props {
  display: DisplayOptions;
  onChange: (patch: Partial<DisplayOptions>) => void;
}

/**
 * Bottom bar: one-click style and colour choices plus ligand / water
 * switches. The button groups are real radio inputs, so arrow keys move
 * between choices and screen readers announce them as a group.
 */
export function DisplayBar({ display, onChange }: Props) {
  const name = useId();
  return (
    <div className="display-bar glass" role="group" aria-label="Display options">
      <fieldset className="seg-group">
        <legend>Style</legend>
        <div className="seg">
          {REPRESENTATIONS.map((r) => (
            <label key={r} className={display.representation === r ? 'on' : undefined}>
              <input
                type="radio"
                name={`${name}-style`}
                value={r}
                checked={display.representation === r}
                onChange={() => onChange({ representation: r })}
              />
              {REPRESENTATION_LABELS[r]}
            </label>
          ))}
        </div>
      </fieldset>
      <span className="bar-divider" aria-hidden="true" />
      <fieldset className="seg-group">
        <legend>Color</legend>
        <div className="seg">
          {COLOR_SCHEMES.map((c) => (
            <label
              key={c}
              className={display.colorScheme === c ? 'on' : undefined}
              title={COLOR_SCHEME_TITLES[c]}
            >
              <input
                type="radio"
                name={`${name}-color`}
                value={c}
                checked={display.colorScheme === c}
                onChange={() => onChange({ colorScheme: c })}
              />
              {COLOR_SCHEME_LABELS[c]}
            </label>
          ))}
        </div>
      </fieldset>
      <span className="bar-divider" aria-hidden="true" />
      <label className="switch">
        <input
          type="checkbox"
          role="switch"
          checked={display.showLigands}
          onChange={(e) => onChange({ showLigands: e.target.checked })}
        />
        <span className="switch-track" aria-hidden="true" />
        Ligands
      </label>
      <label className="switch">
        <input
          type="checkbox"
          role="switch"
          checked={display.showWater}
          onChange={(e) => onChange({ showWater: e.target.checked })}
        />
        <span className="switch-track" aria-hidden="true" />
        Water
      </label>
    </div>
  );
}
