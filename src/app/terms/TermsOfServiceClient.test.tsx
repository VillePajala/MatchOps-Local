import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { TermsOfServiceClient } from './TermsOfServiceClient';

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
        'termsOfService.title': 'Terms of Service',
        'termsOfService.lastUpdated': 'Last updated: December 2024',
        'termsOfService.agreement.title': 'Agreement',
        'termsOfService.agreement.content': 'By using MatchOps, you agree to these terms.',
        'termsOfService.description.title': 'Description',
        'termsOfService.description.intro': 'MatchOps is a soccer coaching app.',
        'termsOfService.description.items.trackTime': 'Track game time',
        'termsOfService.description.items.manageRosters': 'Manage rosters',
        'termsOfService.description.items.recordStats': 'Record statistics',
        'termsOfService.description.items.organizeSeasons': 'Organize seasons',
        'termsOfService.description.note': 'All data is stored locally.',
        'termsOfService.license.title': 'License',
        'termsOfService.license.intro': 'We grant you a limited license.',
        'termsOfService.license.restrictionsIntro': 'You may NOT:',
        'termsOfService.license.restrictions.reverseEngineer': 'Reverse engineer',
        'termsOfService.license.restrictions.modify': 'Modify or create derivatives',
        'termsOfService.license.restrictions.distribute': 'Distribute',
        'termsOfService.license.restrictions.illegal': 'Use illegally',
        'termsOfService.license.restrictions.removeNotices': 'Remove notices',
        'termsOfService.userResponsibilities.title': 'User Responsibilities',
        'termsOfService.userResponsibilities.intro': 'You are responsible for:',
        'termsOfService.userResponsibilities.items.data': 'Your data',
        'termsOfService.userResponsibilities.items.backups': 'Backups',
        'termsOfService.userResponsibilities.items.compliance': 'Legal compliance',
        'termsOfService.userResponsibilities.items.activity': 'Your activity',
        'termsOfService.dataAndPrivacy.title': 'Data and Privacy',
        'termsOfService.dataAndPrivacy.content': 'See our privacy policy.',
        'termsOfService.intellectualProperty.title': 'Intellectual Property',
        'termsOfService.intellectualProperty.content': 'All rights reserved.',
        'termsOfService.disclaimer.title': 'Disclaimer',
        'termsOfService.disclaimer.intro': 'THE APP IS PROVIDED AS IS.',
        'termsOfService.disclaimer.items.merchantability': 'No warranty of merchantability',
        'termsOfService.disclaimer.items.fitness': 'No warranty of fitness',
        'termsOfService.disclaimer.items.nonInfringement': 'No warranty of non-infringement',
        'termsOfService.disclaimer.items.accuracy': 'No warranty of accuracy',
        'termsOfService.disclaimer.note': 'Use at your own risk.',
        'termsOfService.liability.title': 'Limitation of Liability',
        'termsOfService.liability.intro': 'WE ARE NOT LIABLE FOR DAMAGES.',
        'termsOfService.liability.note': 'Some jurisdictions limit this.',
        'termsOfService.dataLoss.title': 'Data Loss',
        'termsOfService.dataLoss.intro': 'Regarding data loss:',
        'termsOfService.dataLoss.items.localStorage': 'Data is stored locally',
        'termsOfService.dataLoss.items.notResponsible': 'We are not responsible',
        'termsOfService.dataLoss.items.backupAdvice': 'Back up your data',
        'termsOfService.thirdPartyServices.title': 'Third-Party Services',
        'termsOfService.thirdPartyServices.intro': 'We use third-party services:',
        'termsOfService.thirdPartyServices.googlePlay': 'Google Play',
        'termsOfService.thirdPartyServices.googlePlayDesc': 'App distribution',
        'termsOfService.thirdPartyServices.sentry': 'Sentry',
        'termsOfService.thirdPartyServices.sentryDesc': 'Error tracking',
        'termsOfService.thirdPartyServices.note': 'Subject to their terms.',
        'termsOfService.changes.title': 'Changes',
        'termsOfService.changes.content': 'We may update these terms.',
        'termsOfService.termination.title': 'Termination',
        'termsOfService.termination.content': 'We may terminate access.',
        'termsOfService.governingLaw.title': 'Governing Law',
        'termsOfService.governingLaw.content': 'Finnish law applies.',
        'termsOfService.contact.title': 'Contact',
        'termsOfService.contact.intro': 'For questions:',
        'termsOfService.contact.email': 'Email',
        'termsOfService.contact.github': 'GitHub',
        'termsOfService.footer': 'These terms apply to MatchOps.',
        'settingsModal.privacyPolicy': 'Privacy Policy',
        'common.backButton': 'Back',
      };
      return translations[key] || key;
    },
  }),
}));

describe('TermsOfServiceClient', () => {
  it('should render the page title', () => {
    render(<TermsOfServiceClient />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Terms of Service');
  });

  it('should render all main sections', () => {
    render(<TermsOfServiceClient />);

    const sectionTitles = [
      'Agreement',
      'Description',
      'License',
      'User Responsibilities',
      'Data and Privacy',
      'Intellectual Property',
      'Disclaimer',
      'Limitation of Liability',
      'Data Loss',
      'Third-Party Services',
      'Changes',
      'Termination',
      'Governing Law',
      'Contact',
    ];

    sectionTitles.forEach((title) => {
      expect(screen.getByRole('heading', { name: title })).toBeInTheDocument();
    });
  });

  it('should render link to privacy policy', () => {
    render(<TermsOfServiceClient />);

    const privacyLink = screen.getByRole('link', { name: 'Privacy Policy' });
    expect(privacyLink).toHaveAttribute('href', '/privacy-policy');
  });

  it('should render contact links with appropriate attributes', () => {
    render(<TermsOfServiceClient />);

    const emailLink = screen.getByRole('link', { name: 'valoraami@gmail.com' });
    expect(emailLink).toHaveAttribute('href', 'mailto:valoraami@gmail.com');
    // mailto links don't need target/rel

    const githubLink = screen.getByRole('link', {
      name: 'github.com/VillePajala/MatchOps-Local/issues',
    });
    expect(githubLink).toHaveAttribute(
      'href',
      'https://github.com/VillePajala/MatchOps-Local/issues'
    );
    expect(githubLink).toHaveAttribute('target', '_blank');
    expect(githubLink).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('should render back navigation link', () => {
    render(<TermsOfServiceClient />);

    const backLink = screen.getByRole('link', { name: /back/i });
    expect(backLink).toHaveAttribute('href', '/');
  });
});
