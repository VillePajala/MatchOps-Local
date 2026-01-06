import { IconType } from 'react-icons';
import {
  FaRocket,
  FaPlay,
  FaUsers,
  FaFutbol,
  FaClock,
  FaPencilAlt,
  FaChartLine,
  FaDatabase,
  FaExclamationTriangle,
  FaLightbulb,
} from 'react-icons/fa';

export interface GuideSection {
  slug: string;
  title: string;
  titleFi: string;
  description: string;
  descriptionFi: string;
  icon: IconType;
  order: number;
}

export const guideSections: GuideSection[] = [
  {
    slug: 'getting-started',
    title: 'Getting Started',
    titleFi: 'Aloitus',
    description: 'Install the app and create your first team',
    descriptionFi: 'Asenna sovellus ja luo ensimmäinen joukkueesi',
    icon: FaRocket,
    order: 1,
  },
  {
    slug: 'game-day-workflow',
    title: 'Game Day Workflow',
    titleFi: 'Pelipäivän työnkulku',
    description: 'Step-by-step guide for match day',
    descriptionFi: 'Vaiheittainen ohje pelipäivälle',
    icon: FaPlay,
    order: 2,
  },
  {
    slug: 'roster-management',
    title: 'Roster Management',
    titleFi: 'Kokoonpanon hallinta',
    description: 'Add, edit, and organize players',
    descriptionFi: 'Lisää, muokkaa ja järjestele pelaajia',
    icon: FaUsers,
    order: 3,
  },
  {
    slug: 'teams-organization',
    title: 'Teams & Organization',
    titleFi: 'Joukkueet ja organisointi',
    description: 'Manage multiple teams and seasons',
    descriptionFi: 'Hallitse useita joukkueita ja kausia',
    icon: FaFutbol,
    order: 4,
  },
  {
    slug: 'during-the-game',
    title: 'During the Game',
    titleFi: 'Pelin aikana',
    description: 'Real-time tracking and event logging',
    descriptionFi: 'Reaaliaikainen seuranta ja tapahtumien kirjaus',
    icon: FaClock,
    order: 5,
  },
  {
    slug: 'tactics-board',
    title: 'Tactics Board',
    titleFi: 'Taktinen piirtotaulu',
    description: 'Draw formations and plays',
    descriptionFi: 'Piirrä muodostelmia ja pelikuvioita',
    icon: FaPencilAlt,
    order: 6,
  },
  {
    slug: 'after-the-game',
    title: 'After the Game',
    titleFi: 'Pelin jälkeen',
    description: 'Review stats and player performance',
    descriptionFi: 'Tarkastele tilastoja ja pelaajien suorituksia',
    icon: FaChartLine,
    order: 7,
  },
  {
    slug: 'data-management',
    title: 'Data Management',
    titleFi: 'Datan hallinta',
    description: 'Backup, export, and restore data',
    descriptionFi: 'Varmuuskopiointi, vienti ja palautus',
    icon: FaDatabase,
    order: 8,
  },
  {
    slug: 'troubleshooting',
    title: 'Troubleshooting',
    titleFi: 'Vianetsintä',
    description: 'Common issues and solutions',
    descriptionFi: 'Yleiset ongelmat ja ratkaisut',
    icon: FaExclamationTriangle,
    order: 9,
  },
  {
    slug: 'tips-best-practices',
    title: 'Tips & Best Practices',
    titleFi: 'Vinkit ja parhaat käytännöt',
    description: 'Get the most out of MatchOps',
    descriptionFi: 'Hyödynnä MatchOps parhaiten',
    icon: FaLightbulb,
    order: 10,
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
