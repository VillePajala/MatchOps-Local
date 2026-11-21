import type { Concept } from './types';

/**
 * The one built-in test concept (our own content, not a club's): used to try
 * the engine behind the 'pelitapa' flag until concepts come from the database.
 *
 * 8v8, our team defends the bottom goal. The keeper starts with the ball, the
 * two centre backs and the holding midfielder make a triangle, the ball moves
 * round it away from the press, and the far centre back moves into the space
 * the press leaves.
 */
export const DEMO_CONCEPT: Concept = {
  id: 'demo-kolmio-pallolliselle',
  title: 'Kolmio pallolliselle',
  phase: 'Hyökkääminen',
  format: '8v8',
  version: 1,
  tags: ['pelinavaus', 'kolmio'],
  players: [
    { id: 'mv', side: 'us', role: 'gk', start: [34, 95] },
    { id: 'vp', side: 'us', role: 'cb', start: [25, 83] },
    { id: 'op', side: 'us', role: 'cb', start: [43, 83] },
    { id: 'kk', side: 'us', role: 'dm', start: [34, 66] },
    { id: 'vl', side: 'us', role: 'lw', start: [9, 58] },
    { id: 'ol', side: 'us', role: 'rw', start: [59, 58] },
    { id: 'vh', side: 'us', role: 'fw', start: [26, 38] },
    { id: 'oh', side: 'us', role: 'fw', start: [42, 38] },
    { id: 'v1', side: 'opp', role: 'gk', start: [34, 5] },
    { id: 'v2', side: 'opp', start: [25, 30] },
    { id: 'v3', side: 'opp', start: [43, 30] },
    { id: 'v4', side: 'opp', start: [14, 50] },
    { id: 'v5', side: 'opp', start: [54, 50] },
    { id: 'v6', side: 'opp', start: [34, 56] },
    { id: 'v7', side: 'opp', start: [27, 68] },
    { id: 'v8', side: 'opp', start: [42, 68] },
  ],
  steps: [
    {
      title: 'Maalivahdilla pallo',
      text: 'Maalivahti aloittaa. Topparit levittäytyvät leveälle ja keskikenttäpelaaja tulee näkyviin niiden väliin.',
      ball: 'mv',
      highlights: ['mv'],
      arrows: [
        { kind: 'run', from: 'vp', to: [15, 86] },
        { kind: 'run', from: 'op', to: [53, 86] },
        { kind: 'run', from: 'kk', to: [34, 75] },
      ],
    },
    {
      title: 'Kolmio syntyy',
      text: 'Topparit ja keskikenttäpelaaja muodostavat kolmion. Pallollisella on aina kaksi syöttösuuntaa.',
      positions: { vp: [15, 86], op: [53, 86], kk: [34, 75] },
      highlights: ['vp', 'op', 'kk'],
      zones: [{ kind: 'poly', ids: ['vp', 'kk', 'op'] }],
      arrows: [{ kind: 'pass', from: 'mv', to: 'vp' }],
    },
    {
      title: 'Pallo kiertää kolmiossa',
      text: 'Vastustaja painaa pallollista. Pallo liikkuu kolmion sisällä sinne, missä on tilaa.',
      ball: 'vp',
      highlights: ['kk'],
      zones: [{ kind: 'poly', ids: ['vp', 'kk', 'op'] }],
      arrows: [
        { kind: 'press', from: 'v7', to: 'vp' },
        { kind: 'pass', from: 'vp', to: 'kk' },
      ],
    },
    {
      title: 'Kaukaisin pelaaja liikkuu tilaan',
      text: 'Kun prässi tulee keskelle, kaukaisin toppari liikkuu vapaaseen tilaan ja pyytää palloa.',
      ball: 'kk',
      positions: { v7: [20, 80] },
      highlights: ['op'],
      zones: [{ kind: 'ellipse', cx: 56, cy: 73, rx: 8, ry: 6 }],
      arrows: [
        { kind: 'press', from: 'v8', to: 'kk' },
        { kind: 'run', from: 'op', to: [56, 74] },
        { kind: 'pass', from: 'kk', to: [56, 74] },
      ],
    },
    {
      title: 'Vapaa pelaaja vie pallon eteenpäin',
      text: 'Toppari kuljettaa vapaaseen tilaan. Laitapelaaja tarjoutuu edessä ja peli avautuu.',
      ball: 'op',
      positions: { op: [56, 74], v5: [47, 63], v8: [38, 72] },
      highlights: ['op', 'ol'],
      arrows: [
        { kind: 'drib', from: 'op', to: [56, 63] },
        { kind: 'run', from: 'ol', to: [62, 44] },
      ],
    },
  ],
  question: 'Missä sinä olisit vapaana, kun vastustaja painaa pallollista?',
};
