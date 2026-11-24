/**
 * Settings -> Data, "Privacy" (privacy 2026-11):
 * - the ONE switch "Error reporting and usage statistics" (Sentry + onboarding
 *   milestones), per account, on by default - the objection mechanism the
 *   privacy policy points to;
 * - a ready-made notice the coach can copy and send to players' families
 *   (informing them is the coach's / club's duty, see the Terms).
 */

'use client';

import React, { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useToast } from '@/contexts/ToastProvider';
import {
  useDiagnosticsPreferenceSync,
  useSetDiagnosticsEnabled,
} from '@/hooks/useDiagnosticsPreference';
import {
  groupedListStyle,
  listRowStyle,
  sectionLabelStyle,
  subtextStyle,
  secondaryButtonStyle,
  switchInputStyle,
  textareaStyle,
} from '@/styles/modalStyles';

const PrivacySettingsSection: React.FC = () => {
  const { t } = useTranslation();
  const { showToast } = useToast();
  const accountValue = useDiagnosticsPreferenceSync();
  const setDiagnosticsEnabled = useSetDiagnosticsEnabled();
  const [saving, setSaving] = useState(false);

  const handleToggle = async (enabled: boolean) => {
    setSaving(true);
    try {
      const ok = await setDiagnosticsEnabled(enabled);
      if (!ok) {
        showToast(t('settingsModal.saveSettingError', 'Failed to save setting. Please try again.'), 'error');
      }
    } finally {
      setSaving(false);
    }
  };

  const familyNotice = t(
    'privacySettings.familyNoticeText',
    "Hi! As the coach I use the MatchOps app to run the team. The controller of the players' data is me as the coach - or the club, if I use the app as part of the club's activity. In the app I store each player's first name or nickname, shirt number, positions, playing time and planned playing time, goals, assists and other match events, and short coaching notes. I use this information only to coach the team: line-ups, planning playing time and match statistics. It is kept on my phone and in my coaching account, on a server in the EU (Stockholm, Sweden). It is not shared with anyone else, sold or used for advertising, and I do not record health information. I keep it while I coach the team and delete it when it is no longer needed. You can ask me at any time what has been stored about your child and ask me to correct or delete it - deletion requests go to me, the coach. You also have the right to lodge a complaint with the supervisory authority, the Office of the Data Protection Ombudsman in Finland (tietosuoja.fi).",
  );

  const copyFamilyNotice = useCallback(async () => {
    try {
      if (!navigator.clipboard?.writeText) throw new Error('clipboard unavailable');
      await navigator.clipboard.writeText(familyNotice);
      showToast(t('aiSettings.copied', 'Copied.'), 'success');
    } catch {
      showToast(t('aiSettings.copyFailed', 'Could not copy. Select the text and copy it manually.'), 'error');
    }
  }, [familyNotice, showToast, t]);

  return (
    <section className="space-y-2" data-testid="privacy-settings-section">
      <h3 className={`${sectionLabelStyle} px-1`}>
        {t('privacySettings.title', 'Privacy')}
      </h3>
      <div className={groupedListStyle}>
        <div className={`${listRowStyle} py-3 pr-4`}>
          <div className="flex-1 min-w-0">
            <label htmlFor="diagnostics-enabled-toggle" className="block font-ui text-base font-medium text-ink cursor-pointer">
              {t('privacySettings.diagnosticsLabel', 'Error reporting and usage statistics')}
            </label>
            <p className={`${subtextStyle} mt-1`}>
              {t('privacySettings.diagnosticsHint', 'Sends error reports to help fix bugs and records when you reach the first onboarding steps. Never your game data. Turning this off stops both for your account.')}
            </p>
          </div>
          <input
            type="checkbox"
            role="switch"
            id="diagnostics-enabled-toggle"
            data-testid="diagnostics-enabled-toggle"
            checked={accountValue ?? true}
            disabled={accountValue === undefined || saving}
            onChange={(e) => void handleToggle(e.target.checked)}
            className={switchInputStyle}
          />
        </div>
        <details className={`${listRowStyle} flex-col items-stretch py-3 pr-4`}>
          <summary className="font-ui text-base font-medium text-ink cursor-pointer min-h-8 flex items-center">
            {t('privacySettings.familyNoticeTitle', 'Notice to players\' families')}
          </summary>
          <p className={`${subtextStyle} mt-2 mb-2`}>
            {t('privacySettings.familyNoticeHint', 'A ready-made message you can send to families: what the app stores about players, why, where and for how long, and who to ask.')}
          </p>
          <textarea
            readOnly
            value={familyNotice}
            rows={8}
            className={textareaStyle}
            aria-label={t('privacySettings.familyNoticeTitle', 'Notice to players\' families')}
          />
          <button
            type="button"
            onClick={() => void copyFamilyNotice()}
            className={`${secondaryButtonStyle} mt-2 self-start min-h-10! px-4! text-sm!`}
            data-testid="copy-family-notice"
          >
            {t('aiSettings.copy', 'Copy')}
          </button>
        </details>
      </div>
    </section>
  );
};

export default PrivacySettingsSection;
