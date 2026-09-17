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
  /** The team's kit colour, when they have one. Undefined for most teams. */
  teamColor?: string;
}

const GameInfoBar: React.FC<GameInfoBarProps> = React.memo(({
  teamName,
  opponentName,
  homeScore,
  awayScore,
  onTeamNameChange,
  onOpponentNameChange,
  homeOrAway,
  teamColor,
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

  const inputClasses = "bg-transparent border-none outline-none text-slate-100 text-sm font-medium px-1 py-0.5 focus:bg-slate-700 rounded";

  const leftTeamName = homeOrAway === 'home' ? teamName : opponentName;
  const rightTeamName = homeOrAway === 'home' ? opponentName : teamName;
  // THE KIT COLOUR BELONGS TO THE TEAM, NOT TO A SIDE OF THE BAR. The sides
  // swap with homeOrAway, and the underline used to be nailed to the left span
  // - so in an away game the coach's own colours were drawn under the
  // OPPONENT'S name. Derive both from the same condition so they cannot drift
  // apart again.
  const ownTeamStyle = teamColor ? { boxShadow: `inset 0 -3px 0 0 ${teamColor}` } : undefined;
  const leftTeamStyle = homeOrAway === 'home' ? ownTeamStyle : undefined;
  const rightTeamStyle = homeOrAway === 'home' ? undefined : ownTeamStyle;
  const leftScore = homeScore;
  const rightScore = awayScore;

  return (
    <div
      className="relative bg-gradient-to-b from-slate-800 to-slate-800/85 px-3 py-0.5 text-slate-200 flex items-center text-sm shadow-md min-h-[2.25rem]"
      style={{ fontFamily: 'Rajdhani, sans-serif' }}
    >
      {/* Modal background effects for unified feel */}
      <div className="absolute inset-0 bg-gradient-to-b from-sky-400/10 via-transparent to-transparent pointer-events-none" />
      <div className="absolute inset-0 bg-indigo-600/10 mix-blend-soft-light pointer-events-none" />

      {/* Center Content: Teams and Score */}
      <div className="relative flex-1 flex items-center justify-center space-x-2.5 font-semibold z-10 max-w-full">
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
              className={`${inputClasses} text-right max-w-[120px] w-full`}
            />
          ) : (
            <span
              className="block truncate cursor-pointer hover:bg-slate-700/50 px-1 py-0.5 rounded"
              onTouchEnd={() => handleTap('left')}
              onDoubleClick={() => handleStartEdit('left')}
              title={leftTeamName}
              // The kit colour as an underline rather than a dot or a filled
              // background: it has to sit beside an editable name without
              // competing with it, and a rule under the word reads as "these
              // are their colours" the way a scarf does.
              style={leftTeamStyle}
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
        <SteadyDigits className="bg-slate-700 px-2.5 py-0.5 rounded text-amber-300 text-xl font-black leading-none flex-shrink-0">
          {`${leftScore} - ${rightScore}`}
        </SteadyDigits>

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
              className={`${inputClasses} text-left max-w-[120px] w-full`}
            />
          ) : (
            <span
              className="block truncate cursor-pointer hover:bg-slate-700/50 px-1 py-0.5 rounded"
              onTouchEnd={() => handleTap('right')}
              onDoubleClick={() => handleStartEdit('right')}
              title={rightTeamName}
              style={rightTeamStyle}
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
