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
  FaClipboardList,
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
    description: 'Free account, your team, the first plan, and the basic and full layouts',
    descriptionFi: 'Ilmainen tili, joukkue ja ensimmäinen suunnitelma sekä Perusnäkymä ja Koko näkymä',
    icon: FaRocket,
    order: 1,
    group: 'getting-started',
    isMainPath: true,
  },
  {
    slug: 'full-setup-path',
    title: 'Full Layout: Recommended Setup',
    titleFi: 'Näin otat Koko näkymän käyttöön',
    description: 'Players, staff, leagues, tournaments and teams in the full layout',
    descriptionFi: 'Pelaajat, taustahenkilöt, sarjat, turnaukset ja joukkueet Koko näkymässä',
    icon: FaRoute,
    order: 2,
    group: 'getting-started',
    isMainPath: true,
  },
  // Setup group
  {
    slug: 'roster-management',
    title: 'Roster Management',
    titleFi: 'Pelaajat',
    description: 'Add, edit and archive players',
    descriptionFi: 'Lisää, muokkaa ja arkistoi pelaajia',
    icon: FaUsers,
    order: 3,
    group: 'setup',
  },
  {
    slug: 'teams-organization',
    title: 'Teams & Organization',
    titleFi: 'Joukkueet, sarjat ja turnaukset',
    description: 'Teams, leagues, tournaments and staff',
    descriptionFi: 'Joukkueet, sarjat, turnaukset ja taustahenkilöt',
    icon: FaFutbol,
    order: 4,
    group: 'setup',
  },
  // Game Day group
  {
    slug: 'game-day-workflow',
    title: 'Match Day at a Glance',
    titleFi: 'Ottelupäivä lyhyesti',
    description: 'The whole match day on one page',
    descriptionFi: 'Ottelupäivän kulku yhdellä sivulla',
    icon: FaPlay,
    order: 5,
    group: 'game-day',
  },
  {
    slug: 'before-the-game',
    title: 'Before the Game: the Plan and Who Is Here?',
    titleFi: 'Ennen peliä: suunnitelma ja poissaolijat',
    description: 'The game plan, sharing it, absences and planning several games',
    descriptionFi: 'Pelin suunnitelma, jakaminen, poissaolijat ja usean pelin suunnittelu',
    icon: FaClipboardList,
    order: 6,
    group: 'game-day',
  },
  {
    slug: 'during-the-game',
    title: 'During the Game',
    titleFi: 'Pelin aikana',
    description: 'Match view, clock, Goal for us and the next change',
    descriptionFi: 'Ottelunäkymä, kello, Maali meille ja seuraava vaihto',
    icon: FaClock,
    order: 7,
    group: 'game-day',
  },
  {
    slug: 'tactics-board',
    title: 'Tactics Board',
    titleFi: 'Taktiikkataulu',
    description: 'Draw plays and set pieces',
    descriptionFi: 'Piirrä pelikuvioita ja erikoistilanteita',
    icon: FaPencilAlt,
    order: 8,
    group: 'game-day',
  },
  // Review & Data group
  {
    slug: 'after-the-game',
    title: 'Finish This Game',
    titleFi: 'Viimeistele ottelu',
    description: 'Result and goals, match sheet, match report and sharing',
    descriptionFi: 'Tulos ja maalit, pöytäkirja, otteluraportti ja jakaminen',
    icon: FaChartLine,
    order: 9,
    group: 'review',
  },
  {
    slug: 'statistics',
    title: 'Statistics',
    titleFi: 'Tilastot',
    description: 'Game, league, tournament and player statistics',
    descriptionFi: 'Ottelu-, sarja-, turnaus- ja pelaajatilastot',
    icon: FaChartBar,
    order: 10,
    group: 'review',
  },
  {
    slug: 'data-management',
    title: 'Data Management',
    titleFi: 'Tili ja tiedot',
    description: 'Account, sync, backups, settings and layout',
    descriptionFi: 'Tili, synkronointi, varmuuskopiot, asetukset ja näkymä',
    icon: FaDatabase,
    order: 11,
    group: 'review',
  },
  {
    slug: 'troubleshooting',
    title: 'Troubleshooting',
    titleFi: 'Ongelmatilanteet',
    description: 'Common issues and solutions',
    descriptionFi: 'Yleisimmät ongelmat ja niiden ratkaisut',
    icon: FaExclamationTriangle,
    order: 12,
    group: 'review',
  },
  {
    slug: 'tips-best-practices',
    title: 'Tips & Best Practices',
    titleFi: 'Käytännön vinkit',
    description: 'Get the most out of MatchOps',
    descriptionFi: 'Näin saat MatchOpsista eniten irti',
    icon: FaLightbulb,
    order: 13,
    group: 'review',
  },
  {
    slug: 'faq',
    title: 'FAQ',
    titleFi: 'Usein kysytyt kysymykset',
    description: 'Frequently asked questions',
    descriptionFi: 'Vastauksia yleisimpiin kysymyksiin',
    icon: FaQuestionCircle,
    order: 14,
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
