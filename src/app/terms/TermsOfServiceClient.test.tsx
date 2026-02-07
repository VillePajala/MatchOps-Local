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
        'termsOfService.lastUpdated': 'Last updated: February 2026',
        'termsOfService.version': 'Terms Version: 2026-02',
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
        'termsOfService.dataAndPrivacy.securityAcknowledgmentTitle': 'Data Security Acknowledgment',
        'termsOfService.dataAndPrivacy.securityAcknowledgmentIntro': 'By using MatchOps, you acknowledge:',
        'termsOfService.dataAndPrivacy.securityAcknowledgmentItems.localMode': 'Local mode: IndexedDB without encryption',
        'termsOfService.dataAndPrivacy.securityAcknowledgmentItems.deviceSecurity': 'Device security is primary protection',
        'termsOfService.dataAndPrivacy.securityAcknowledgmentItems.backupFiles': 'Backup files are unencrypted',
        'termsOfService.dataAndPrivacy.securityAcknowledgmentItems.personnelData': 'Personnel data same security model',
        'termsOfService.dataAndPrivacy.securityAcknowledgmentItems.yourResponsibility': 'You are responsible for device access',
        'termsOfService.dataAndPrivacy.securityAcknowledgmentNote': 'Enable cloud sync for additional security.',
        'termsOfService.intellectualProperty.title': 'Intellectual Property',
        'termsOfService.intellectualProperty.content': 'All rights reserved (Ville Pajala).',
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
        'termsOfService.dataLoss.items.localStorage': 'Data is stored locally (or cloud)',
        'termsOfService.dataLoss.items.notResponsible': 'We are not responsible',
        'termsOfService.dataLoss.items.backupAdvice': 'Back up your data',
        'termsOfService.thirdPartyServices.title': 'Third-Party Services',
        'termsOfService.thirdPartyServices.intro': 'We use third-party services:',
        'termsOfService.thirdPartyServices.googlePlay': 'Google Play',
        'termsOfService.thirdPartyServices.googlePlayDesc': 'App distribution',
        'termsOfService.thirdPartyServices.sentry': 'Sentry',
        'termsOfService.thirdPartyServices.sentryDesc': 'Error tracking (can be disabled)',
        'termsOfService.thirdPartyServices.supabase': 'Supabase',
        'termsOfService.thirdPartyServices.supabaseDesc': 'Cloud sync',
        'termsOfService.thirdPartyServices.vercel': 'Vercel',
        'termsOfService.thirdPartyServices.vercelDesc': 'PWA hosting',
        'termsOfService.thirdPartyServices.note': 'Subject to their terms.',
        'termsOfService.premiumSubscription.title': 'Premium Subscription',
        'termsOfService.premiumSubscription.intro': 'Premium provides additional features:',
        'termsOfService.premiumSubscription.features.cloudSync': 'Cloud Sync',
        'termsOfService.premiumSubscription.features.unlimitedEntities': 'Unlimited entities',
        'termsOfService.premiumSubscription.features.prioritySupport': 'Priority support',
        'termsOfService.premiumSubscription.billing': 'Billed through Google Play.',
        'termsOfService.premiumSubscription.cancellation': 'Cancel anytime.',
        'termsOfService.premiumSubscription.dataAfterCancel': 'Data remains in read-only mode.',
        'termsOfService.cloudSync.title': 'Cloud Sync Terms',
        'termsOfService.cloudSync.intro': 'When you enable Cloud Sync:',
        'termsOfService.cloudSync.items.ownership': 'You retain ownership',
        'termsOfService.cloudSync.items.availability': 'High availability goal',
        'termsOfService.cloudSync.items.backups': 'Maintain local backups',
        'termsOfService.cloudSync.items.security': 'Industry-standard security',
        'termsOfService.cloudSync.deletion': 'Delete cloud data anytime.',
        'termsOfService.changes.title': 'Changes',
        'termsOfService.changes.content': 'We may update these terms.',
        'termsOfService.changesToTerms.title': 'Changes to Terms',
        'termsOfService.changesToTerms.content': 'Material changes trigger re-consent.',
        'termsOfService.termination.title': 'Termination',
        'termsOfService.termination.content': 'We may terminate access.',
        'termsOfService.termination.cloudTermination': 'Cloud data deleted within 30 days.',
        'termsOfService.termination.voluntaryDeletion': 'Delete your account anytime.',
        'termsOfService.governingLaw.title': 'Governing Law and Dispute Resolution',
        'termsOfService.governingLaw.content': 'Finnish law applies. Helsinki courts.',
        'termsOfService.severability.title': 'Severability',
        'termsOfService.severability.content': 'Remaining provisions continue.',
        'termsOfService.entireAgreement.title': 'Entire Agreement',
        'termsOfService.entireAgreement.content': 'These terms plus Privacy Policy.',
        'termsOfService.contact.title': 'Contact',
        'termsOfService.contact.intro': 'Most actions can be done in-app. For questions:',
        'termsOfService.contact.email': 'Email',
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
      'Premium Subscription',
      'Cloud Sync Terms',
      'Changes',
      'Changes to Terms',
      'Termination',
      'Governing Law and Dispute Resolution',
      'Severability',
      'Entire Agreement',
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

  it('should render contact email link', () => {
    render(<TermsOfServiceClient />);

    const emailLink = screen.getByRole('link', { name: 'valoraami@gmail.com' });
    expect(emailLink).toHaveAttribute('href', 'mailto:valoraami@gmail.com');
  });

  it('should render back navigation link', () => {
    render(<TermsOfServiceClient />);

    const backLink = screen.getByRole('link', { name: /back/i });
    expect(backLink).toHaveAttribute('href', '/');
  });
});
