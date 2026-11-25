'use client';

/**
 * The kick-off time field: the phone's own time picker (`<input type="time">`),
 * used by the new-game form, game settings and "Create all games".
 *
 * Value is "HH:MM" (24 h) or '' for "no time yet" - the same format
 * `game.gameTime` stores, so callers pass it straight through.
 *
 * WHY THE HINT. An empty time field renders blank on Android Chrome (desktop
 * Chrome draws "--:--", Android draws nothing), so an unset kick-off looked
 * like a broken box. While the field is empty and not being edited, a hint
 * sits on top of it and the browser's own empty-state text is made
 * transparent, so every browser shows the same "--:--". Focus hides the hint
 * and hands the field back to the browser's picker.
 */

import React, { useState } from 'react';
import { inputBaseStyle, inputErrorStyle } from '@/styles/modalStyles';

export interface TimeInputProps {
  id: string;
  /** "HH:MM" or '' */
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  /** Shown while empty. Defaults to "--:--". */
  emptyHint?: string;
  invalid?: boolean;
  'aria-label'?: string;
  'aria-describedby'?: string;
  name?: string;
}

const TimeInput: React.FC<TimeInputProps> = ({
  id,
  value,
  onChange,
  onBlur,
  onKeyDown,
  emptyHint = '--:--',
  invalid = false,
  name,
  ...aria
}) => {
  const [focused, setFocused] = useState(false);
  const showHint = !value && !focused;
  return (
    <div className="relative">
      <input
        id={id}
        name={name}
        type="time"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => {
          setFocused(false);
          onBlur?.();
        }}
        onKeyDown={onKeyDown}
        aria-invalid={invalid || undefined}
        aria-label={aria['aria-label']}
        aria-describedby={aria['aria-describedby']}
        className={`${inputBaseStyle} ${invalid ? inputErrorStyle : ''} [color-scheme:dark] tabular-nums ${
          showHint ? 'text-transparent [&::-webkit-datetime-edit]:text-transparent' : ''
        }`}
        autoComplete="off"
      />
      {showHint && (
        <span
          aria-hidden="true"
          data-testid={`${id}-empty-hint`}
          className="pointer-events-none absolute inset-y-0 left-3.5 right-10 flex items-center font-ui text-base font-normal text-ink-3 tabular-nums truncate"
        >
          {emptyHint}
        </span>
      )}
    </div>
  );
};

export default TimeInput;
