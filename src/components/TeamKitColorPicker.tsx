'use client';

import React from 'react';
import { useTranslation } from 'react-i18next';
import { HiOutlineXMark, HiOutlineSwatch } from 'react-icons/hi2';
import { TEAM_KIT_COLORS } from '@/config/palette';
import { labelStyle } from '@/styles/modalStyles';

/**
 * Pick a team's kit colour.
 *
 * A ROW OF SWATCHES, not an `<input type="color">`. Football kits come from a
 * small conventional range, the OS colour input is a poor experience on a
 * phone, and a freeform hex lets a coach pick something that disappears
 * against slate. The fixed set in TEAM_KIT_COLORS is checked to read on the
 * app's dark surfaces.
 *
 * Clearing is a first-class choice, not the absence of one: most teams will
 * never set a colour, and a control you cannot undo is a trap.
 *
 * CUSTOM is the escape hatch, not the default. The presets cover the kits a
 * Finnish junior club actually plays in and guarantee the colour survives on
 * a dark surface; but a club with a genuinely odd strip should not be told
 * their colour does not exist, so a swatch opens the native picker. It sits
 * last because a curated choice should be the easy one.
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

export const TeamKitColorPicker: React.FC<TeamKitColorPickerProps> = ({
  value,
  onChange,
  disabled,
}) => {
  const { t } = useTranslation();
  const label = t('unifiedTeamModal.kitColorLabel', 'Kit colour');
  // A stored colour that is not one of the presets came from the custom picker.
  const isCustom =
    !!value && !TEAM_KIT_COLORS.some((c) => c.hex.toLowerCase() === value.toLowerCase());

  return (
    <div>
      <span className={labelStyle} id="kit-colour-label">
        {label}
      </span>
      <div
        role="radiogroup"
        aria-labelledby="kit-colour-label"
        className="flex flex-wrap items-center gap-2"
      >
        {TEAM_KIT_COLORS.map((c) => {
          const selected = (value ?? '').toLowerCase() === c.hex.toLowerCase();
          return (
            <button
              key={c.id}
              type="button"
              role="radio"
              aria-checked={selected}
              aria-label={t(`unifiedTeamModal.kitColor.${c.id}` as 'unifiedTeamModal.kitColorLabel', c.id)}
              disabled={disabled}
              onClick={() => onChange(c.hex)}
              // The ring, not a border, marks the choice: a border would change
              // the swatch's size and make the row jump as you tap along it.
              className={`w-9 h-9 rounded-full transition-shadow focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-400 disabled:opacity-50 ${
                selected ? 'ring-2 ring-white ring-offset-2 ring-offset-slate-800' : 'ring-1 ring-white/20'
              }`}
              style={{ backgroundColor: c.hex }}
            />
          );
        })}
        {/* Custom. Rendered as a label wrapping a visually-hidden colour input
            so the swatch keeps the size and ring of its neighbours - styling
            <input type="color"> directly is unreliable across browsers. */}
        <label
          className={`w-9 h-9 rounded-full flex items-center justify-center cursor-pointer transition-shadow focus-within:ring-2 focus-within:ring-purple-400 ${
            isCustom ? 'ring-2 ring-white ring-offset-2 ring-offset-slate-800' : 'ring-1 ring-white/20'
          } ${disabled ? 'opacity-50 pointer-events-none' : ''}`}
          style={isCustom ? { backgroundColor: value } : undefined}
          title={t('unifiedTeamModal.kitColorCustom', 'Custom colour')}
        >
          {!isCustom && <HiOutlineSwatch className="w-5 h-5 text-slate-300" />}
          <input
            type="color"
            className="sr-only"
            disabled={disabled}
            aria-label={t('unifiedTeamModal.kitColorCustom', 'Custom colour')}
            value={value ?? '#7E22CE'}
            onChange={(e) => onChange(e.target.value.toUpperCase())}
          />
        </label>

        <button
          type="button"
          role="radio"
          aria-checked={!value}
          aria-label={t('unifiedTeamModal.kitColorNone', 'No colour')}
          disabled={disabled}
          onClick={() => onChange(undefined)}
          className={`w-9 h-9 rounded-full flex items-center justify-center text-slate-400 transition-shadow focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-400 disabled:opacity-50 ${
            !value ? 'ring-2 ring-white ring-offset-2 ring-offset-slate-800' : 'ring-1 ring-white/20'
          }`}
        >
          <HiOutlineXMark className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
};

export default TeamKitColorPicker;
