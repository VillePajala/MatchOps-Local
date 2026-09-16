'use client';

import React from 'react';
import { useTranslation } from 'react-i18next';
import { HiOutlineXMark } from 'react-icons/hi2';
import { TEAM_KIT_COLORS } from '@/config/palette';
import { labelStyle } from '@/styles/modalStyles';

/**
 * Pick a team's kit colour.
 *
 * A GRID OF SWATCHES, and nothing else. There used to be an
 * `<input type="color">` here as an escape hatch for a club with an odd
 * strip. On a phone that input hands the coach the operating system's colour
 * dialog - a system panel in the middle of a dark, carefully styled app - and
 * it looked exactly as out of place as that sounds. The fix was not to dress
 * it better but to make it unnecessary: TEAM_KIT_COLORS now carries
 * twenty-three colours, which covers the range football kits actually come in.
 *
 * Every swatch is checked to read on the app's dark surfaces, which a freeform
 * hex never was - a coach could pick something that vanished against slate.
 *
 * Clearing is a first-class choice, not the absence of one: most teams will
 * never set a colour, and a control you cannot undo is a trap. It takes the
 * last cell of the grid, so the four rows are exactly full.
 *
 * A COLOUR SAVED BEFORE THIS still shows. Dropping the custom input would
 * otherwise have made any hex outside the list read as "no colour chosen"
 * while the value sat in the database unchanged - the team would look unset
 * and one careless tap would have cleared it for real. Such a colour is
 * appended as its own swatch instead, selected, so nothing saved is lost.
 *
 * @module TeamKitColorPicker
 * @category Components
 */
export interface TeamKitColorPickerProps {
  /** Currently stored hex, or undefined for no colour. */
  value: string | undefined;
  onChange: (hex: string | undefined) => void;
  disabled?: boolean;
}

/** One circle. Identical geometry for every cell so the grid cannot jitter. */
const swatchBase =
  'w-9 h-9 rounded-full transition-shadow focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 disabled:opacity-50';
// The ring marks the choice, not a border: a border would change the swatch's
// size and make the grid shift as you tap along it.
const selectedRing = 'ring-2 ring-white ring-offset-2 ring-offset-slate-800';
const restingRing = 'ring-1 ring-white/20';

export const TeamKitColorPicker: React.FC<TeamKitColorPickerProps> = ({
  value,
  onChange,
  disabled,
}) => {
  const { t } = useTranslation();
  const label = t('unifiedTeamModal.kitColorLabel', 'Kit colour');
  const current = (value ?? '').toLowerCase();
  const isPreset = TEAM_KIT_COLORS.some((c) => c.hex.toLowerCase() === current);
  // A colour chosen with the old custom picker. Shown so it is not silently
  // lost; not added to the presets, which stay a curated set.
  const legacyCustom = value && !isPreset ? value : null;

  return (
    <div>
      <span className={labelStyle} id="kit-colour-label">
        {label}
      </span>
      {/* Six across, so twenty-three colours plus the clear button are exactly
          four rows with no ragged last line. */}
      <div
        role="radiogroup"
        aria-labelledby="kit-colour-label"
        className="grid grid-cols-6 gap-2 justify-items-center max-w-xs"
      >
        {TEAM_KIT_COLORS.map((c) => {
          const selected = current === c.hex.toLowerCase();
          return (
            <button
              key={c.id}
              type="button"
              role="radio"
              aria-checked={selected}
              aria-label={t(
                `unifiedTeamModal.kitColor.${c.id}` as 'unifiedTeamModal.kitColorLabel',
                c.id,
              )}
              disabled={disabled}
              onClick={() => onChange(c.hex)}
              className={`${swatchBase} ${selected ? selectedRing : restingRing}`}
              style={{ backgroundColor: c.hex }}
            />
          );
        })}

        {legacyCustom && (
          <button
            type="button"
            role="radio"
            aria-checked
            aria-label={t('unifiedTeamModal.kitColorCustom', 'Custom colour')}
            disabled={disabled}
            data-testid="kit-colour-legacy"
            onClick={() => onChange(legacyCustom)}
            className={`${swatchBase} ${selectedRing}`}
            style={{ backgroundColor: legacyCustom }}
          />
        )}

        <button
          type="button"
          role="radio"
          aria-checked={!value}
          aria-label={t('unifiedTeamModal.kitColorNone', 'No colour')}
          disabled={disabled}
          onClick={() => onChange(undefined)}
          className={`${swatchBase} flex items-center justify-center text-slate-400 ${
            !value ? selectedRing : restingRing
          }`}
        >
          <HiOutlineXMark className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
};

export default TeamKitColorPicker;
