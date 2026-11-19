'use client';

import React, { useState, useEffect, useRef } from 'react';
import SteadyDigits from '@/components/SteadyDigits';

interface GameInfoBarProps {
  teamName: string;
  opponentName: string;
  homeScore: number;
  awayScore: number;
  onTeamNameChange: (newName: string) => void;
  onOpponentNameChange: (newName: string) => void;
  homeOrAway: 'home' | 'away';
}

const GameInfoBar: React.FC<GameInfoBarProps> = React.memo(({
  teamName,
  opponentName,
  homeScore,
  awayScore,
  onTeamNameChange,
  onOpponentNameChange,
  homeOrAway,
}) => {
  const [editingField, setEditingField] = useState<'left' | 'right' | null>(null);
  const [editValue, setEditValue] = useState<string>('');
  const teamInputRef = useRef<HTMLInputElement>(null);
  const opponentInputRef = useRef<HTMLInputElement>(null);
  const [lastTapInfo, setLastTapInfo] = useState<{ time: number; target: 'left' | 'right' | null }>({ time: 0, target: null });

  useEffect(() => {
    if (editingField === 'left') {
      teamInputRef.current?.focus();
      teamInputRef.current?.select();
    } else if (editingField === 'right') {
      opponentInputRef.current?.focus();
      opponentInputRef.current?.select();
    }
  }, [editingField]);

  const handleStartEdit = (side: 'left' | 'right') => {
    setEditingField(side);
    setEditValue(side === 'left' ? teamName : opponentName);
  };

  const handleCancelEdit = () => {
    setEditingField(null);
    setEditValue('');
  };

  const handleSaveEdit = () => {
    if (!editingField) return;
    const trimmedValue = editValue.trim();
    if (trimmedValue) {
      if (editingField === 'left') {
        if (homeOrAway === 'home') {
          onTeamNameChange(trimmedValue);
        } else {
          onOpponentNameChange(trimmedValue);
        }
      } else {
        if (homeOrAway === 'home') {
          onOpponentNameChange(trimmedValue);
        } else {
          onTeamNameChange(trimmedValue);
        }
      }
    }
    handleCancelEdit();
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setEditValue(e.target.value);
  };

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleSaveEdit();
    } else if (e.key === 'Escape') {
      handleCancelEdit();
    }
  };

  const handleTap = (side: 'left' | 'right') => {
    const now = Date.now();
    const DOUBLE_TAP_DELAY = 300;

    if (lastTapInfo.target === side && (now - lastTapInfo.time) < DOUBLE_TAP_DELAY) {
      handleStartEdit(side);
      setLastTapInfo({ time: 0, target: null });
    } else {
      setLastTapInfo({ time: now, target: side });
    }
  };

  const inputClasses = "bg-transparent border-none outline-none text-ink text-sm font-semibold px-1.5 py-0.5 rounded-lg focus:bg-white/10 focus:shadow-[inset_0_0_0_1.5px_var(--color-action)]";

  const leftTeamName = homeOrAway === 'home' ? teamName : opponentName;
  const rightTeamName = homeOrAway === 'home' ? opponentName : teamName;
  // NO KIT-COLOUR RULE UNDER THE OWN-TEAM NAME. It used to underline whichever
  // side was the coach's own team. The owner reads the bar by the names - they
  // wrote them - so a colour saying "this one is yours" earned nothing, and the
  // prop went with it rather than lingering unused. The kit colour is still the
  // field's, where it distinguishes players at a glance.
  const leftScore = homeScore;
  const rightScore = awayScore;

  return (
    // The score row of the match view's top panel: on the panel's own glass,
    // so no background here - only a hairline under it, above the player bar.
    // Compact: 42px tall with 30px numerals and 14px names, so the pitch below
    // the panel keeps as much height as it can. The names give way first
    // (they truncate) - never the score.
    <div className="relative mx-3 h-[42px] flex items-center font-ui text-[14px] text-ink-2 shadow-[inset_0_-1px_0_var(--color-hairline)]">
      {/* Center Content: Teams and Score */}
      <div className="relative flex-1 min-w-0 flex items-center justify-center gap-2.5 font-semibold z-10 max-w-full">
        {/* Left Team Name */}
        <div className="flex-1 basis-0 min-w-0 text-right overflow-hidden" title={editingField !== 'left' ? "Double-click to edit" : undefined}>
          {editingField === 'left' ? (
            <input
              ref={teamInputRef}
              type="text"
              value={editValue}
              onChange={handleInputChange}
              onBlur={handleSaveEdit}
              onKeyDown={handleInputKeyDown}
              className={`${inputClasses} text-right w-full min-w-0`}
            />
          ) : (
            <span
              className="block truncate cursor-pointer hover:bg-white/[0.06] px-1 py-0.5 rounded-md"
              onTouchEnd={() => handleTap('left')}
              onDoubleClick={() => handleStartEdit('left')}
              title={leftTeamName}
            >
              {leftTeamName}
            </span>
          )}
        </div>

        {/* Score. The fixed centre of the bar: the flanking name blocks share
            equal flex basis, so the number stays put whatever the teams are
            called. Centring the whole string instead let the score slide
            around as names changed length - a scoreboard's number does not
            move because the away side has a long name.

            Numerals as display type, applied in the one place it was most
            obviously missing. This was text-sm - the same size as body copy -
            while the match timer, the home dashboard tiles and the player
            totals all sit at text-2xl or larger. The app was presenting "how
            many teams you have" as more important than "what the score is".
            The chip must not jump width between 0-0 and 10-9 - which is what
            the tabular-nums here used to promise and never delivered, because
            Rajdhani ships no tnum feature and the class was inert. SteadyDigits
            boxes each digit instead (see that component for the measurements). */}
        <span className="flex items-center gap-[7px] flex-shrink-0 whitespace-nowrap font-display italic font-extrabold text-[30px] leading-none text-ink pr-0.5">
          <SteadyDigits>{String(leftScore)}</SteadyDigits>
          <span className="text-lg font-bold text-ink-3" aria-hidden="true">–</span>
          <span className="sr-only">-</span>
          <SteadyDigits>{String(rightScore)}</SteadyDigits>
        </span>

        {/* Right Team Name */}
        <div className="flex-1 basis-0 min-w-0 text-left overflow-hidden" title={editingField !== 'right' ? "Double-click to edit" : undefined}>
          {editingField === 'right' ? (
            <input
              ref={opponentInputRef}
              type="text"
              value={editValue}
              onChange={handleInputChange}
              onBlur={handleSaveEdit}
              onKeyDown={handleInputKeyDown}
              className={`${inputClasses} text-left w-full min-w-0`}
            />
          ) : (
            <span
              className="block truncate cursor-pointer hover:bg-white/[0.06] px-1 py-0.5 rounded-md"
              onTouchEnd={() => handleTap('right')}
              onDoubleClick={() => handleStartEdit('right')}
              title={rightTeamName}
            >
              {rightTeamName}
            </span>
          )}
        </div>
      </div>
    </div>
  );
});

GameInfoBar.displayName = 'GameInfoBar';

export default GameInfoBar; 
