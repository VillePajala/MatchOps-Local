'use client';

import React, { useEffect, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CollapsibleModalHeader, modalContainerStyle } from '@/styles/modalStyles';
import packageJson from '../../package.json';
import { MODAL_BACKDROP, Z_LAYER } from '@/styles/modalStyles';
import { useAppLayout } from '@/hooks/useAppLayout';
import {
  HiOutlineSquares2X2,
  HiOutlinePlusCircle,
  HiOutlineClipboard,
  HiBars3,
  HiOutlineTrash,
  HiOutlineBackspace,
  HiOutlineArrowUturnLeft,
  HiOutlineArrowUturnRight,
  HiOutlineXMark,
  HiOutlineChevronDown,
} from 'react-icons/hi2';

interface InstructionsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

/**
 * "How it works" guide, rebuilt for the two-level app structure:
 *  - Home (the club hub) with its four tabs + gear, and
 *  - Match Mode (the field) with its tools.
 * Opened from the Home gear sheet. The old version described a single-screen
 * "open the Menu" layout that the two-level restructure replaced.
 */
/**
 * One guide section: the title is a full-width row that expands the section's
 * content on tap, so the whole guide reads as a short list of titles first.
 */
const GuideSection: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  return (
    <section className="s1-list">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={panelId}
        className="w-full min-h-14 flex items-center justify-between gap-3 px-[18px] py-3 text-left font-ui text-base font-semibold text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-action rounded-[22px]"
      >
        <span className="min-w-0">{title}</span>
        <HiOutlineChevronDown
          aria-hidden="true"
          className={`w-5 h-5 shrink-0 text-ink-3 transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>
      {open && (
        <div id={panelId} className="px-[18px] pb-4 pt-1 space-y-3 border-t border-hairline">
          {children}
        </div>
      )}
    </section>
  );
};

const InstructionsModal: React.FC<InstructionsModalProps> = ({ isOpen, onClose }) => {
  const { t } = useTranslation();
  // Basic layout has no tabs: describe its short Home instead (R8). Unknown
  // (loading) is treated as full, matching the app's default.
  const isBasic = useAppLayout() === 'basic';

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const list = 'font-ui text-[15px] leading-6 text-ink-2 space-y-2 list-disc pl-5 marker:text-ink-3';

  return (
    <div className={`${MODAL_BACKDROP} ${Z_LAYER.modal}`} role="dialog" aria-modal="true" aria-label={t('instructionsModal.title')}>
      <div className={`${modalContainerStyle} h-full w-full relative`}>
        <CollapsibleModalHeader
          title={t('instructionsModal.title')}
          onClose={onClose}
          closeLabel={t('common.doneButton', 'Done')}
        />

        <div className="flex-1 overflow-y-auto min-h-0 px-4 pt-2 pb-8 space-y-3 font-ui">
          {/* === HOME: the club hub === */}
          <GuideSection title={t('appGuide.homeTitle', 'Home — your club hub')}>
            {isBasic ? (
              <>
                <p className="font-ui text-[15px] leading-snug text-ink-2">{t('appGuide.homeBasicIntro', 'The Basic Home is short: you see the next game and can start it. A match opens on its own field.')}</p>
                <div>
                  <ul className={list}>
                    <li>{t('appGuide.homeBasicNextGame', 'Next game card: the date, opponent and plan. Tap "Start match" on game day or "Mark absences" before it; "Show plan" opens the plan.')}</li>
                    <li>{t('appGuide.homeBasicNewGame', 'New game: pick a date and an opponent and you get a ready plan.')}</li>
                    <li>{t('appGuide.homeBasicTeam', 'Team row: opens the player list where you edit names, numbers and the keeper, and add or remove players.')}</li>
                    <li>{t('appGuide.homeBasicAll', 'All features: shows what the Full view adds and switches to it. You can switch back in Settings.')}</li>
                    <li>{t('appGuide.homeGearBasic', 'The gear icon (top-left): settings (including Basic/Full view), backups, your account and this guide.')}</li>
                {/* The one behaviour in the app that changes what a coach
                    typed. Unexplained it looks like a bug, so it is explained
                    here rather than left to be discovered. */}
                <li>{t('appGuide.opponentNames', 'Opponent names: type a team you have played before and the field settles on the spelling you already used, so one team stays one team in your statistics. If that earlier spelling is the wrong one, choose "use mine instead" and it is corrected in every past game too.')}</li>
                  </ul>
                </div>
              </>
            ) : (
              <>
            <p className="font-ui text-[15px] leading-snug text-ink-2">{t('appGuide.homeIntro', 'The Home screen has four tabs plus the gear menu. Everything about your club lives here; a match opens on its own field.')}</p>
            <div>
              <ul className={list}>
                <li>{t('appGuide.homeGamesTab', 'Games: your landing view with a summary of your league and recent games — start a new match, continue where you left off, open saved games and the match planner.')}</li>
                <li>{t('appGuide.homeTeamTab', 'Club: your players, teams, staff, the warmup plan, the rules for your age group and coaching materials.')}</li>
                <li>{t('appGuide.homeCompetitionsTab', 'Competitions: set up leagues and tournaments to group your games.')}</li>
                <li>{t('appGuide.homeStatsTab', 'Stats: league, tournament, overall and player statistics (available once you\'ve played a game).')}</li>
                <li>{t('appGuide.homeGear', 'The gear icon (top-left): the compact/full home cards toggle, settings, backups, your account and this guide.')}</li>
                {/* The one behaviour in the app that changes what a coach
                    typed. Unexplained it looks like a bug, so it is explained
                    here rather than left to be discovered. */}
                <li>{t('appGuide.opponentNames', 'Opponent names: type a team you have played before and the field settles on the spelling you already used, so one team stays one team in your statistics. If that earlier spelling is the wrong one, choose "use mine instead" and it is corrected in every past game too.')}</li>
                <li>{t('appGuide.externalGames', "Added stats: a game not recorded in the app as a match can be added to a player's stats from the Add to player stats row on the Stats tab or from the player's menu on the Club tab. Positions, sport and gender place it in the right stats.")}</li>
              </ul>
            </div>
              </>
            )}
          </GuideSection>

          {/* === PLAN === */}
          <GuideSection title={t('firstGameGuide.planTitle', 'Plan the game')}>
            <div>
              <ul className={list}>
                <li>{t('firstGameGuide.planPlanner', 'The match planner makes a plan for who plays when, from your squad. Open it from the next-game card on Home. Tap two players to swap them.')}</li>
                <li>{t('firstGameGuide.planAttendance', 'Who is here? Before kick-off, tap the players who are absent - the plan is re-made without them.')}</li>
              </ul>
            </div>
          </GuideSection>

          {/* === MATCH MODE: the field === */}
          <GuideSection title={t('firstGameGuide.fieldTitle', 'The match view')}>
            <div>
              <ul className={list}>
                <li>{t('firstGameGuide.fieldLayout', 'The score row and the player bar are above the pitch, the control bar below it.')}</li>
                <li>{t('firstGameGuide.fieldPlace', 'Place a player: tap them in the player bar, then tap the pitch. Bench players show as outlined discs.')}</li>
                <li>{t('firstGameGuide.doubleTapRemove', 'Double-tap a player on the pitch to remove them')}</li>
                <li>{t('firstGameGuide.goalieInstructions', 'Set goalies by tapping a player disc in the player bar')}</li>
                <li>
                  <span className="text-ink">{t('firstGameGuide.fieldButtons', 'The control bar has five buttons: field tools, tactics board, the clock in the middle, reset field and the menu.')}</span>
                  <HiOutlineSquares2X2 aria-hidden className="inline-block align-[-2px] ml-2 text-ink-2" size={18} />
                  <HiOutlineClipboard aria-hidden className="inline-block align-[-2px] ml-1 text-ink-2" size={18} />
                  <HiOutlineTrash aria-hidden className="inline-block align-[-2px] ml-1 text-ink-2" size={18} />
                  <HiBars3 aria-hidden className="inline-block align-[-2px] ml-1 text-ink-2" size={18} />
                </li>
              </ul>
            </div>
          </GuideSection>

          <GuideSection title={t('firstGameGuide.clockTitle', 'Clock and goals')}>
            <div>
              <ul className={list}>
                <li>{t('firstGameGuide.clockNext', 'Tap the clock to open the large clock. The next planned change is shown there as a block.')}</li>
                <li>{t('firstGameGuide.clockGoal', 'Our goal: tap "Goal for us". The goal is logged and the score moves at once. Then pick the scorer from "Who scored?" (all squad players) or tap "Skip".')}</li>
                <li>{t('firstGameGuide.clockOpponent', 'Opponent goal: tap "Opponent +1".')}</li>
                <li>{t('firstGameGuide.clockReset', 'In the full layout, "Reset sub timer" restarts the change timer.')}</li>
                <li>{t('firstGameGuide.dictationTip', 'Hold the microphone button on the large clock to dictate a voice note - it stays on your phone.')}</li>
              </ul>
            </div>
          </GuideSection>

          <GuideSection title={t('firstGameGuide.finishTitle', 'Finishing the match')}>
            <div>
              <ul className={list}>
                <li>{t('firstGameGuide.finishStart', 'At full time tap "Finish this game".')}</li>
                <li>{t('firstGameGuide.finishSheet', 'Match sheet: a copy-ready text of the match data that you can paste into any system.')}</li>
                <li>{t('firstGameGuide.finishReport', 'Match report: your own text - write it, dictate it or make an AI draft. "Share match report" sends it on.')}</li>
              </ul>
            </div>
          </GuideSection>

          <GuideSection title={t('firstGameGuide.drawingTools', 'Drawing & Tactical Tools')}>
            <p className="font-ui text-[15px] leading-snug text-ink-2">{t('firstGameGuide.drawingToolsNote', 'After clicking Tactics Board, you can:')}</p>
            <div>
              <ul className={list}>
                <li>
                  <span className="text-ink">{t('firstGameGuide.undoRedoTip', 'Undo/Redo actions:')}</span>
                  <span className="inline-flex items-center ml-2 gap-1 align-[-2px]">
                    <HiOutlineArrowUturnLeft aria-hidden className="text-ink-2" size={16} />
                    <HiOutlineArrowUturnRight aria-hidden className="text-ink-2" size={16} />
                  </span>
                </li>
                <li>
                  <span className="text-ink">{t('firstGameGuide.addHomeDiscTip', 'Add home disc (tactics mode):')}</span>
                  <HiOutlinePlusCircle aria-hidden className="inline-block align-[-2px] ml-2 text-ink-2" size={18} />
                </li>
                <li>
                  <span className="text-ink">{t('firstGameGuide.addOpponentTip', 'Add opponents/discs:')}</span>
                  <HiOutlinePlusCircle aria-hidden className="inline-block align-[-2px] ml-2 text-ink-2" size={18} />
                </li>
                <li>{t('firstGameGuide.drawLinesTip', 'Draw lines and arrows with your finger')}</li>
                <li>
                  <span className="text-ink">{t('firstGameGuide.clearDrawingsTip', 'Clear drawings:')}</span>
                  <HiOutlineBackspace aria-hidden className="inline-block align-[-2px] ml-2 text-ink-2" size={18} />
                </li>
                <li>
                  <span className="text-ink">{t('firstGameGuide.closeToolsTip', 'Exit tools:')}</span>
                  <HiOutlineXMark aria-hidden className="inline-block align-[-2px] ml-2 text-ink-2" size={18} />
                </li>
              </ul>
            </div>
          </GuideSection>

          {/* === IN-MATCH MENU (slim - match-scope only) === */}
          <GuideSection title={t('appGuide.matchMenuTitle', 'The match menu')}>
            <p className="font-ui text-[15px] leading-snug text-ink-2">
              {t('appGuide.matchMenuNote', 'While in a match, the menu holds match-day actions:')}
              <HiBars3 aria-hidden className="inline-block align-[-2px] ml-2 text-ink-2" size={18} />
            </p>
            <div>
              <ul className={list}>
                <li>{t('firstGameGuide.gameSettingsTip', 'Edit match details')}</li>
                <li>{t('firstGameGuide.assessPlayersTip', 'Finish the game: match sheet, match report, positions played and stats')}</li>
                <li>{t('firstGameGuide.backHomeTip', 'Return to the Home screen (Koti) — the phone back button does the same')}</li>
              </ul>
            </div>
          </GuideSection>

          {/* Tips */}
          <GuideSection title={t('instructionsModal.tips.title')}>
            <div>
              <ul className={list}>
                <li>{t('instructionsModal.tips.tip1')}</li>
                {!isBasic && <li>{t('instructionsModal.tips.tip2')}</li>}
                <li>{t('instructionsModal.tips.tip3')}</li>
              </ul>
            </div>
          </GuideSection>

          <p className="text-sm text-ink-3 text-center pt-2">v{packageJson.version}</p>
        </div>
      </div>
    </div>
  );
};

export default InstructionsModal;
