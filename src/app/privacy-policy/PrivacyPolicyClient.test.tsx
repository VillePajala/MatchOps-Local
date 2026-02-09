import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { PrivacyPolicyClient } from './PrivacyPolicyClient';

// Mock next/link
jest.mock('next/link', () => {
  return function MockLink({
    children,
    href,
  }: {
    children: React.ReactNode;
    href: string;
  }) {
    return <a href={href}>{children}</a>;
  };
});

// Mock react-i18next
jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const translations: Record<string, string> = {
        'privacyPolicy.title': 'Privacy Policy',
        'privacyPolicy.lastUpdated': 'Last updated: February 2026',
        'privacyPolicy.version': 'Policy Version: 2026-02',
        'privacyPolicy.dataController.title': 'Data Controller',
        'privacyPolicy.dataController.content': 'MatchOps is developed by Ville Pajala, based in Finland.',
        'privacyPolicy.overview.title': 'Overview',
        'privacyPolicy.overview.content': 'MatchOps is a local-first app.',
        'privacyPolicy.dataStorage.title': 'Data Storage',
        'privacyPolicy.dataStorage.localDataTitle': 'Local Data',
        'privacyPolicy.dataStorage.localDataIntro': 'All your data is stored locally.',
        'privacyPolicy.dataStorage.localDataItems.playerRosters': 'Player rosters',
        'privacyPolicy.dataStorage.localDataItems.gameRecords': 'Game records',
        'privacyPolicy.dataStorage.localDataItems.settings': 'App settings',
        'privacyPolicy.dataStorage.localDataItems.seasonData': 'Season data',
        'privacyPolicy.dataStorage.localDataItems.personnelInfo': 'Personnel information',
        'privacyPolicy.dataStorage.localDataNote': 'Data never leaves your device.',
        'privacyPolicy.dataStorage.noAccountTitle': 'No Account Required',
        'privacyPolicy.dataStorage.noAccountContent': 'No registration needed.',
        'privacyPolicy.dataStorage.cloudDataTitle': 'Cloud Sync',
        'privacyPolicy.dataStorage.cloudDataIntro': 'Cloud data is stored securely.',
        'privacyPolicy.dataStorage.cloudDataItems.syncedData': 'Data is synced',
        'privacyPolicy.dataStorage.cloudDataItems.encryption': 'Encrypted in transit',
        'privacyPolicy.dataStorage.cloudDataItems.rowLevelSecurity': 'Row-level security',
        'privacyPolicy.dataStorage.cloudDataItems.multiDevice': 'Multi-device access',
        'privacyPolicy.dataStorage.cloudDataItems.dataOwnership': 'You own your data',
        'privacyPolicy.dataStorage.cloudDataNote': 'You can delete cloud data anytime.',
        'privacyPolicy.dataStorage.dataRetentionTitle': 'Data Retention',
        'privacyPolicy.dataStorage.dataRetentionContent': 'Data retained while active.',
        'privacyPolicy.legalBasis.title': 'Legal Basis for Data Processing',
        'privacyPolicy.legalBasis.intro': 'We process data under GDPR Article 6:',
        'privacyPolicy.legalBasis.contract': 'Contract: Cloud sync service',
        'privacyPolicy.legalBasis.consent': 'Consent: Policy acceptance',
        'privacyPolicy.legalBasis.legitimateInterest': 'Legitimate interest: Error reporting via Sentry',
        'privacyPolicy.dataWeCollect.title': 'Data We Collect',
        'privacyPolicy.dataWeCollect.errorReportingTitle': 'Error Reporting (Opt-Out)',
        'privacyPolicy.dataWeCollect.errorReportingIntro': 'We collect crash reports.',
        'privacyPolicy.dataWeCollect.errorReportingItems.errorType': 'Error type',
        'privacyPolicy.dataWeCollect.errorReportingItems.deviceType': 'Device type',
        'privacyPolicy.dataWeCollect.errorReportingItems.appVersion': 'App version',
        'privacyPolicy.dataWeCollect.errorReportingItems.sessionInfo': 'Session info',
        'privacyPolicy.dataWeCollect.errorReportingNote': 'Reports help us improve.',
        'privacyPolicy.dataWeCollect.licenseValidationTitle': 'License Validation',
        'privacyPolicy.dataWeCollect.licenseValidationContent': 'For Play Store purchases.',
        'privacyPolicy.dataWeCollect.consentTrackingTitle': 'Consent Records',
        'privacyPolicy.dataWeCollect.consentTrackingIntro': 'We record consent:',
        'privacyPolicy.dataWeCollect.consentTrackingItems.timestamp': 'Timestamp',
        'privacyPolicy.dataWeCollect.consentTrackingItems.policyVersion': 'Policy version',
        'privacyPolicy.dataWeCollect.consentTrackingItems.ipAddress': 'IP address',
        'privacyPolicy.dataWeCollect.consentTrackingItems.userAgent': 'User agent',
        'privacyPolicy.dataWeCollect.consentTrackingNote': 'Required for GDPR compliance.',
        'privacyPolicy.dataWeCollect.personnelDataTitle': 'Personnel Data',
        'privacyPolicy.dataWeCollect.personnelDataIntro': 'You may optionally enter:',
        'privacyPolicy.dataWeCollect.personnelDataItems.name': 'Name and role',
        'privacyPolicy.dataWeCollect.personnelDataItems.email': 'Email (optional)',
        'privacyPolicy.dataWeCollect.personnelDataItems.phone': 'Phone (optional)',
        'privacyPolicy.dataWeCollect.personnelDataItems.certifications': 'Certifications (optional)',
        'privacyPolicy.dataWeCollect.personnelDataNote': 'Stored locally or in cloud.',
        'privacyPolicy.dataWeDoNotCollect.title': 'Data We Do Not Collect',
        'privacyPolicy.dataWeDoNotCollect.items.gameContent': 'Game content',
        'privacyPolicy.dataWeDoNotCollect.items.location': 'Location',
        'privacyPolicy.dataWeDoNotCollect.items.photos': 'Photos',
        'privacyPolicy.dataWeDoNotCollect.items.deviceIds': 'Device IDs',
        'privacyPolicy.dataWeDoNotCollect.items.playerNames': 'Player names',
        'privacyPolicy.dataWeDoNotCollect.personnelNote': 'Personnel contact info is stored by your choice.',
        'privacyPolicy.thirdPartyServices.title': 'Third-Party Services',
        'privacyPolicy.thirdPartyServices.intro': 'We use third-party services.',
        'privacyPolicy.thirdPartyServices.googlePlay': 'Google Play',
        'privacyPolicy.thirdPartyServices.googlePlayDesc': 'App distribution.',
        'privacyPolicy.thirdPartyServices.googlePlayLink': "Google's Privacy Policy",
        'privacyPolicy.thirdPartyServices.sentry': 'Sentry',
        'privacyPolicy.thirdPartyServices.sentryDesc': 'Error tracking.',
        'privacyPolicy.thirdPartyServices.sentryLink': "Sentry's Privacy Policy",
        'privacyPolicy.thirdPartyServices.supabase': 'Supabase',
        'privacyPolicy.thirdPartyServices.supabaseDesc': 'Cloud database.',
        'privacyPolicy.thirdPartyServices.supabaseLink': "Supabase's Privacy Policy",
        'privacyPolicy.thirdPartyServices.vercel': 'Vercel',
        'privacyPolicy.thirdPartyServices.vercelDesc': 'PWA hosting.',
        'privacyPolicy.thirdPartyServices.vercelLink': "Vercel's Privacy Policy",
        'privacyPolicy.yourRights.title': 'Your Rights',
        'privacyPolicy.yourRights.intro': 'Under GDPR you have the right to:',
        'privacyPolicy.yourRights.access': 'Access (Art. 15)',
        'privacyPolicy.yourRights.rectification': 'Rectification (Art. 16)',
        'privacyPolicy.yourRights.erasure': 'Erasure (Art. 17)',
        'privacyPolicy.yourRights.portability': 'Portability (Art. 20)',
        'privacyPolicy.yourRights.restriction': 'Restriction (Art. 18)',
        'privacyPolicy.yourRights.objection': 'Objection (Art. 21)',
        'privacyPolicy.yourRights.withdrawConsent': 'Withdraw consent',
        'privacyPolicy.yourRights.deleteLocal': 'For local data: Settings → Data',
        'privacyPolicy.yourRights.deleteCloud': 'For cloud data: Settings → Data',
        'privacyPolicy.yourRights.contactUs': 'All data management in Settings.',
        'privacyPolicy.yourRights.supervisoryAuthority': 'Lodge a complaint with supervisory authority',
        'privacyPolicy.yourRights.supervisoryAuthorityUrl': 'https://tietosuoja.fi/en/home',
        'privacyPolicy.childrensPrivacy.title': "Children's Privacy",
        'privacyPolicy.childrensPrivacy.content': 'We do not collect data from children under 16.',
        'privacyPolicy.dataSecurity.title': 'Data Security',
        'privacyPolicy.dataSecurity.localIntro': 'Local data is stored in IndexedDB:',
        'privacyPolicy.dataSecurity.localItems.deviceProtection': 'Device access controls',
        'privacyPolicy.dataSecurity.localItems.noAdditionalEncryption': 'No additional encryption',
        'privacyPolicy.dataSecurity.localItems.noTransmission': 'No network transmission',
        'privacyPolicy.dataSecurity.localNote': 'Your device security is primary protection.',
        'privacyPolicy.dataSecurity.cloudIntro': 'Cloud data is protected by:',
        'privacyPolicy.dataSecurity.cloudItems.tlsEncryption': 'TLS encryption',
        'privacyPolicy.dataSecurity.cloudItems.atRestEncryption': 'Encryption at rest (Frankfurt)',
        'privacyPolicy.dataSecurity.cloudItems.rowLevelSecurity': 'Row-level security',
        'privacyPolicy.dataSecurity.cloudItems.soc2': 'SOC 2 compliance',
        'privacyPolicy.dataSecurity.backupTitle': 'Backup File Security',
        'privacyPolicy.dataSecurity.backupContent': 'Backup files are not encrypted.',
        'privacyPolicy.changes.title': 'Changes',
        'privacyPolicy.changes.content': 'We may update this policy.',
        'privacyPolicy.contact.title': 'Contact',
        'privacyPolicy.contact.intro': 'Most requests handled in-app. For other questions or concerns:',
        'privacyPolicy.contact.email': 'Email',
        'privacyPolicy.footer': 'This policy applies to MatchOps.',
        'common.backButton': 'Back',
      };
      return translations[key] || key;
    },
  }),
}));

describe('PrivacyPolicyClient', () => {
  it('should render the page title', () => {
    render(<PrivacyPolicyClient />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Privacy Policy');
  });

  it('should render all main sections', () => {
    render(<PrivacyPolicyClient />);

    const sectionTitles = [
      'Data Controller',
      'Overview',
      'Data Storage',
      'Legal Basis for Data Processing',
      'Data We Collect',
      'Data We Do Not Collect',
      'Third-Party Services',
      'Your Rights',
      "Children's Privacy",
      'Data Security',
      'Changes',
      'Contact',
    ];

    sectionTitles.forEach((title) => {
      expect(screen.getByRole('heading', { name: title })).toBeInTheDocument();
    });
  });

  it('should render external privacy policy links with security attributes', () => {
    render(<PrivacyPolicyClient />);

    const googleLink = screen.getByRole('link', { name: /google's privacy policy/i });
    expect(googleLink).toHaveAttribute('href', 'https://policies.google.com/privacy');
    expect(googleLink).toHaveAttribute('target', '_blank');
    expect(googleLink).toHaveAttribute('rel', 'noopener noreferrer');

    const sentryLink = screen.getByRole('link', { name: /sentry's privacy policy/i });
    expect(sentryLink).toHaveAttribute('href', 'https://sentry.io/privacy/');
    expect(sentryLink).toHaveAttribute('target', '_blank');
    expect(sentryLink).toHaveAttribute('rel', 'noopener noreferrer');

    const supabaseLink = screen.getByRole('link', { name: /supabase's privacy policy/i });
    expect(supabaseLink).toHaveAttribute('href', 'https://supabase.com/privacy');
    expect(supabaseLink).toHaveAttribute('target', '_blank');
    expect(supabaseLink).toHaveAttribute('rel', 'noopener noreferrer');

    const vercelLink = screen.getByRole('link', { name: /vercel's privacy policy/i });
    expect(vercelLink).toHaveAttribute('href', 'https://vercel.com/legal/privacy-policy');
    expect(vercelLink).toHaveAttribute('target', '_blank');
    expect(vercelLink).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('should render contact email link', () => {
    render(<PrivacyPolicyClient />);

    const emailLink = screen.getByRole('link', { name: 'support@match-ops.com' });
    expect(emailLink).toHaveAttribute('href', 'mailto:support@match-ops.com');
  });

  it('should render supervisory authority link', () => {
    render(<PrivacyPolicyClient />);

    const supervisoryLink = screen.getByRole('link', { name: 'tietosuoja.fi' });
    expect(supervisoryLink).toHaveAttribute('href', 'https://tietosuoja.fi/en/home');
    expect(supervisoryLink).toHaveAttribute('target', '_blank');
    expect(supervisoryLink).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('should render back navigation link', () => {
    render(<PrivacyPolicyClient />);

    const backButton = screen.getByRole('button', { name: /back/i });
    expect(backButton).toBeInTheDocument();
  });
});
