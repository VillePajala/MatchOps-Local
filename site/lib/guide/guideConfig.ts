import { IconType } from 'react-icons';
import {
  FaRocket,
  FaPlay,
  FaUsers,
  FaFutbol,
  FaClock,
  FaPencilAlt,
  FaChartLine,
  FaChartBar,
  FaDatabase,
  FaExclamationTriangle,
  FaLightbulb,
  FaRoute,
  FaQuestionCircle,
} from 'react-icons/fa';

export type GuideGroup = 'getting-started' | 'setup' | 'game-day' | 'review';

export interface GuideSection {
  slug: string;
  title: string;
  titleFi: string;
  description: string;
  descriptionFi: string;
  icon: IconType;
  order: number;
  group: GuideGroup;
  isMainPath?: boolean;
}

export const guideGroups: { key: GuideGroup; order: number }[] = [
  { key: 'getting-started', order: 1 },
  { key: 'setup', order: 2 },
  { key: 'game-day', order: 3 },
  { key: 'review', order: 4 },
];

export const guideSections: GuideSection[] = [
  // Getting Started group - Main paths for new users
  {
    slug: 'getting-started',
    title: 'Quick Start',
    titleFi: 'Pikaopas',
    description: 'Install the app and try it immediately',
    descriptionFi: 'Asenna sovellus ja kokeile heti',
    icon: FaRocket,
    order: 1,
    group: 'getting-started',
    isMainPath: true,
  },
  {
    slug: 'full-setup-path',
    title: 'Recommended Workflow',
    titleFi: 'Suositeltu työnkulku',
    description: 'The complete workflow to get the full benefits of MatchOps',
    descriptionFi: 'Täydellinen työnkulku MatchOpsin kaikkien ominaisuuksien hyödyntämiseksi',
    icon: FaRoute,
    order: 2,
    group: 'getting-started',
    isMainPath: true,
  },
  // Setup group
  {
    slug: 'roster-management',
    title: 'Roster Management',
    titleFi: 'Kokoonpanon hallinta',
    description: 'Add, edit, and organize players',
    descriptionFi: 'Lisää, muokkaa ja järjestele pelaajia',
    icon: FaUsers,
    order: 3,
    group: 'setup',
  },
  {
    slug: 'teams-organization',
    title: 'Teams & Organization',
    titleFi: 'Joukkueet ja organisointi',
    description: 'Manage teams, personnel, and competitions',
    descriptionFi: 'Hallitse joukkueita, henkilöstöä ja kilpailuja',
    icon: FaFutbol,
    order: 4,
    group: 'setup',
  },
  // Game Day group
  {
    slug: 'game-day-workflow',
    title: 'Game Day Workflow',
    titleFi: 'Ottelupäivän työnkulku',
    description: 'Step-by-step guide for match day',
    descriptionFi: 'Vaiheittainen ohje ottelupäivälle',
    icon: FaPlay,
    order: 5,
    group: 'game-day',
  },
  {
    slug: 'during-the-game',
    title: 'During the Game',
    titleFi: 'Pelin aikana',
    description: 'Real-time tracking and event logging',
    descriptionFi: 'Reaaliaikainen seuranta ja tapahtumien kirjaus',
    icon: FaClock,
    order: 6,
    group: 'game-day',
  },
  {
    slug: 'tactics-board',
    title: 'Tactics Board',
    titleFi: 'Taktinen piirtotaulu',
    description: 'Draw formations and plays',
    descriptionFi: 'Piirrä muodostelmia ja pelikuvioita',
    icon: FaPencilAlt,
    order: 7,
    group: 'game-day',
  },
  // Review & Data group
  {
    slug: 'after-the-game',
    title: 'After the Game',
    titleFi: 'Pelin jälkeen',
    description: 'Post-game routine and data verification',
    descriptionFi: 'Pelin jälkeinen rutiini ja tietojen tarkistus',
    icon: FaChartLine,
    order: 8,
    group: 'review',
  },
  {
    slug: 'statistics',
    title: 'Statistics',
    titleFi: 'Tilastot',
    description: 'Comprehensive stats across games, seasons, and players',
    descriptionFi: 'Kattavat tilastot peleistä, kausista ja pelaajista',
    icon: FaChartBar,
    order: 9,
    group: 'review',
  },
  {
    slug: 'data-management',
    title: 'Data Management',
    titleFi: 'Datan hallinta',
    description: 'Backup, export, and restore data',
    descriptionFi: 'Varmuuskopiointi, vienti ja palautus',
    icon: FaDatabase,
    order: 10,
    group: 'review',
  },
  {
    slug: 'troubleshooting',
    title: 'Troubleshooting',
    titleFi: 'Vianetsintä',
    description: 'Common issues and solutions',
    descriptionFi: 'Yleiset ongelmat ja ratkaisut',
    icon: FaExclamationTriangle,
    order: 11,
    group: 'review',
  },
  {
    slug: 'tips-best-practices',
    title: 'Tips & Best Practices',
    titleFi: 'Vinkit ja parhaat käytännöt',
    description: 'Get the most out of MatchOps',
    descriptionFi: 'Hyödynnä MatchOps parhaiten',
    icon: FaLightbulb,
    order: 12,
    group: 'review',
  },
  {
    slug: 'faq',
    title: 'FAQ',
    titleFi: 'Usein kysytyt kysymykset',
    description: 'Frequently asked questions',
    descriptionFi: 'Vastauksia yleisimpiin kysymyksiin',
    icon: FaQuestionCircle,
    order: 13,
    group: 'review',
  },
];

export function getSectionBySlug(slug: string): GuideSection | undefined {
  return guideSections.find((s) => s.slug === slug);
}

export function getAdjacentSections(slug: string): {
  prev: GuideSection | null;
  next: GuideSection | null;
} {
  const current = guideSections.find((s) => s.slug === slug);
  if (!current) return { prev: null, next: null };

  const prev = guideSections.find((s) => s.order === current.order - 1) || null;
  const next = guideSections.find((s) => s.order === current.order + 1) || null;

  return { prev, next };
}

export function getAllSlugs(): string[] {
  return guideSections.map((s) => s.slug);
}

export function getSectionsByGroup(group: GuideGroup): GuideSection[] {
  return guideSections
    .filter((s) => s.group === group)
    .sort((a, b) => a.order - b.order);
}

export function getGroupedSections(): { group: GuideGroup; sections: GuideSection[] }[] {
  return guideGroups.map((g) => ({
    group: g.key,
    sections: getSectionsByGroup(g.key),
  }));
}

export function getMainPaths(): GuideSection[] {
  return guideSections.filter((s) => s.isMainPath);
}

export function getReferenceGuides(): GuideSection[] {
  return guideSections.filter((s) => !s.isMainPath);
}
