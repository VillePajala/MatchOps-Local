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
        'privacyPolicy.lastUpdated': 'Last updated: December 2024',
        'privacyPolicy.overview.title': 'Overview',
        'privacyPolicy.overview.content': 'MatchOps is a local-first app.',
        'privacyPolicy.dataStorage.title': 'Data Storage',
        'privacyPolicy.dataStorage.localDataTitle': 'Local Data',
        'privacyPolicy.dataStorage.localDataIntro': 'All your data is stored locally.',
        'privacyPolicy.dataStorage.localDataItems.playerRosters': 'Player rosters',
        'privacyPolicy.dataStorage.localDataItems.gameRecords': 'Game records',
        'privacyPolicy.dataStorage.localDataItems.settings': 'App settings',
        'privacyPolicy.dataStorage.localDataItems.seasonData': 'Season data',
        'privacyPolicy.dataStorage.localDataNote': 'Data never leaves your device.',
        'privacyPolicy.dataStorage.noAccountTitle': 'No Account Required',
        'privacyPolicy.dataStorage.noAccountContent': 'No registration needed.',
        'privacyPolicy.dataWeCollect.title': 'Data We Collect',
        'privacyPolicy.dataWeCollect.errorReportingTitle': 'Error Reporting',
        'privacyPolicy.dataWeCollect.errorReportingIntro': 'We collect crash reports.',
        'privacyPolicy.dataWeCollect.errorReportingItems.errorType': 'Error type',
        'privacyPolicy.dataWeCollect.errorReportingItems.deviceType': 'Device type',
        'privacyPolicy.dataWeCollect.errorReportingItems.appVersion': 'App version',
        'privacyPolicy.dataWeCollect.errorReportingItems.sessionInfo': 'Session info',
        'privacyPolicy.dataWeCollect.errorReportingNote': 'Reports help us improve.',
        'privacyPolicy.dataWeCollect.licenseValidationTitle': 'License Validation',
        'privacyPolicy.dataWeCollect.licenseValidationContent': 'For Play Store purchases.',
        'privacyPolicy.dataWeDoNotCollect.title': 'Data We Do Not Collect',
        'privacyPolicy.dataWeDoNotCollect.items.playerNames': 'Player names',
        'privacyPolicy.dataWeDoNotCollect.items.gameContent': 'Game content',
        'privacyPolicy.dataWeDoNotCollect.items.location': 'Location',
        'privacyPolicy.dataWeDoNotCollect.items.photos': 'Photos',
        'privacyPolicy.dataWeDoNotCollect.items.contacts': 'Contacts',
        'privacyPolicy.dataWeDoNotCollect.items.deviceIds': 'Device IDs',
        'privacyPolicy.thirdPartyServices.title': 'Third-Party Services',
        'privacyPolicy.thirdPartyServices.googlePlay': 'Google Play',
        'privacyPolicy.thirdPartyServices.googlePlayDesc': 'App distribution.',
        'privacyPolicy.thirdPartyServices.sentry': 'Sentry',
        'privacyPolicy.thirdPartyServices.sentryDesc': 'Error tracking.',
        'privacyPolicy.thirdPartyServices.vercel': 'Vercel',
        'privacyPolicy.thirdPartyServices.vercelDesc': 'PWA hosting.',
        'privacyPolicy.yourRights.title': 'Your Rights',
        'privacyPolicy.yourRights.export': 'Export your data',
        'privacyPolicy.yourRights.delete': 'Delete your data',
        'privacyPolicy.yourRights.contactUs': 'Contact us',
        'privacyPolicy.childrensPrivacy.title': "Children's Privacy",
        'privacyPolicy.childrensPrivacy.content': 'We do not collect data from children.',
        'privacyPolicy.dataSecurity.title': 'Data Security',
        'privacyPolicy.dataSecurity.intro': 'Your data is protected by:',
        'privacyPolicy.dataSecurity.items.encryption': 'Device encryption',
        'privacyPolicy.dataSecurity.items.localStorage': 'Local storage only',
        'privacyPolicy.dataSecurity.items.noTransmission': 'No network transmission',
        'privacyPolicy.changes.title': 'Changes',
        'privacyPolicy.changes.content': 'We may update this policy.',
        'privacyPolicy.contact.title': 'Contact',
        'privacyPolicy.contact.intro': 'For privacy questions:',
        'privacyPolicy.contact.email': 'Email',
        'privacyPolicy.contact.github': 'GitHub',
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
      'Overview',
      'Data Storage',
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

  it('should render external privacy policy links', () => {
    render(<PrivacyPolicyClient />);

    const googleLink = screen.getByRole('link', { name: /google's privacy policy/i });
    expect(googleLink).toHaveAttribute('href', 'https://policies.google.com/privacy');

    const sentryLink = screen.getByRole('link', { name: /sentry's privacy policy/i });
    expect(sentryLink).toHaveAttribute('href', 'https://sentry.io/privacy/');

    const vercelLink = screen.getByRole('link', { name: /vercel's privacy policy/i });
    expect(vercelLink).toHaveAttribute('href', 'https://vercel.com/legal/privacy-policy');
  });

  it('should render contact links', () => {
    render(<PrivacyPolicyClient />);

    const emailLink = screen.getByRole('link', { name: 'valoraami@gmail.com' });
    expect(emailLink).toHaveAttribute('href', 'mailto:valoraami@gmail.com');

    const githubLink = screen.getByRole('link', {
      name: 'github.com/VillePajala/MatchOps-Local/issues',
    });
    expect(githubLink).toHaveAttribute(
      'href',
      'https://github.com/VillePajala/MatchOps-Local/issues'
    );
  });

  it('should render back navigation link', () => {
    render(<PrivacyPolicyClient />);

    const backLink = screen.getByRole('link', { name: /back/i });
    expect(backLink).toHaveAttribute('href', '/');
  });
});
