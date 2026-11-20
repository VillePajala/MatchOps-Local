// Fictional club for marketing videos. Every name, venue and address is invented.
import fs from 'node:fs';
// Dates are anchored on the run day so Home always has a "next match": the fixture is tomorrow,
// the six played matches the six weeks before it. DEMO_DATE=YYYY-MM-DD pins the anchor.
const DAY = 86400000;
const anchor = new Date((process.env.DEMO_DATE || new Date().toISOString().slice(0, 10)) + 'T12:00:00Z');
const iso = (offsetDays) => new Date(anchor.getTime() + offsetDays * DAY).toISOString().slice(0, 10);
const FIXTURE_DATE = iso(1);
const fixtureLabel = `${Number(FIXTURE_DATE.slice(8, 10))}.${Number(FIXTURE_DATE.slice(5, 7))}.`;
const now = new Date(anchor.getTime() - 2 * DAY).toISOString();
const P = (i, name, nick, jersey, isGoalie = false) => ({ id: `player_demo_${String(i).padStart(2,'0')}`, name, nickname: nick, jerseyNumber: String(jersey), isGoalie, createdAt: now, updatedAt: now });
const players = [
  P(1,'Eeli Virtanen','Eeli',1,true), P(2,'Onni Korhonen','Onni',2), P(3,'Leo Mäkinen','Leo',3), P(4,'Väinö Nieminen','Väinö',4),
  P(5,'Aapo Hämäläinen','Aapo',5), P(6,'Elias Laine','Elias',6), P(7,'Oliver Heikkinen','Oliver',7), P(8,'Eino Koskinen','Eino',8),
  P(9,'Niilo Järvinen','Niilo',9), P(10,'Leevi Lehtonen','Leevi',10), P(11,'Veeti Saarinen','Veeti',11), P(12,'Otso Salminen','Otso',12),
  P(13,'Aatos Heinonen','Aatos',14), P(14,'Toivo Rantanen','Toivo',15),
];
const teamId = 'team_demo_mepa', seasonId = 'season_demo_2026';
const opponents = ['Rantakylän FC','Kuusiston Kiri','Joen Pallo','Lahdenpohjan Tarmo','Pihlajaveden Veikot','Harjun Haukat'];
const season = { id: seasonId, name: `P12 Harrastesarja ${FIXTURE_DATE.slice(0, 4)}`, startDate: iso(-120), endDate: iso(30), periodCount: 2, periodDuration: 25,
  ageGroup: 'U12', leagueId: 'harrastesarja', gameType: 'soccer', gender: 'boys', opponents, location: 'Metsäkylän kenttä', archived: false };
const team = { id: teamId, name: 'MePa', boundSeasonId: seasonId, gameType: 'soccer', ageGroup: 'U12', color: '#f59e0b', createdAt: now, updatedAt: now };
const teamRoster = players.map(({ id, name, nickname, jerseyNumber, isGoalie }) => ({ id, name, nickname, jerseyNumber, isGoalie }));
// 8v8 2-1-2-1-1 (the owner's own formation): gk + 7, row margin 0.25
const slots = [[0.5,0.92],[0.25,0.82],[0.75,0.82],[0.5,0.68],[0.25,0.52],[0.75,0.52],[0.5,0.38],[0.5,0.24]];
const venues = {
  home: { name: 'Metsäkylän kenttä', address: 'Kenttätie 3, Lappeenranta', lat: 61.0572, lng: 28.1863 },
  imatra: { name: 'Rantakylän tekonurmi', address: 'Rantakyläntie 12, Imatra', lat: 61.1719, lng: 28.7724 },
  kouvola: { name: 'Kuusiston urheilupuisto', address: 'Urheilupuistontie 1, Kouvola', lat: 60.8679, lng: 26.7042 },
  mikkeli: { name: 'Pihlajaveden kenttä', address: 'Pihlajavedentie 8, Mikkeli', lat: 61.6886, lng: 27.2723 },
};
let evId = 0;
const goal = (time, scorerId, assisterId) => ({ id: `ev_demo_${++evId}`, type: 'goal', time, scorerId, ...(assisterId ? { assisterId } : {}) });
const oppGoal = (time) => ({ id: `ev_demo_${++evId}`, type: 'opponentGoal', time });
const periodEnd = (time) => ({ id: `ev_demo_${++evId}`, type: 'periodEnd', time });
function game(i, { date, time, opponent, homeOrAway, venue, ours, theirs, scorers, played = true, absent = [], fieldNumber }) {
  const id = `game_demo_${String(i).padStart(2,'0')}`;
  const selected = players.filter(p => !absent.includes(p.id));
  const onField = selected.slice(0, 8).map((p, k) => ({ ...p, relX: slots[k][0], relY: slots[k][1] }));
  const events = [];
  if (played) {
    scorers.forEach(([t, s, a]) => events.push(goal(t, s, a)));
    for (let k = 0; k < theirs; k++) events.push(oppGoal(600 + k * 700));
    events.sort((x, y) => x.time - y.time);
    events.push(periodEnd(1500));
  }
  const homeScore = homeOrAway === 'home' ? ours : theirs, awayScore = homeOrAway === 'home' ? theirs : ours;
  return [id, {
    teamName: 'MePa', teamId, opponentName: opponent, gameDate: date, gameTime: time, homeOrAway,
    gameLocation: venue.name, locationAddress: venue.address, locationLat: venue.lat, locationLng: venue.lng, fieldNumber: fieldNumber ?? '',
    seasonId, tournamentId: '', ageGroup: 'U12', gameType: 'soccer', gender: 'boys', isFriendly: false,
    numberOfPeriods: 2, periodDurationMinutes: 25, subIntervalMinutes: 5,
    currentPeriod: played ? 2 : 1, gameStatus: played ? 'gameEnd' : 'notStarted', isPlayed: played,
    homeScore: played ? homeScore : 0, awayScore: played ? awayScore : 0,
    timeElapsedInSeconds: played ? 3000 : 0, completedIntervalDurations: [], lastSubConfirmationTimeSeconds: 0,
    playersOnField: onField, availablePlayers: players, selectedPlayerIds: selected.map(p => p.id), gamePersonnel: [],
    opponents: [], drawings: [], tacticalDiscs: [], tacticalDrawings: [], tacticalBallPosition: { relX: 0.5, relY: 0.5 },
    showPlayerNames: true, demandFactor: 1, gameNotes: '', gameEvents: events, playerPositions: {},
    formationSnapPoints: slots.map(([relX, relY]) => ({ relX, relY })),
  }];
}
const pid = (n) => players[n - 1].id;
const games = Object.fromEntries([
  game(1, { date: iso(-41), time: '11:00', opponent: 'Kuusiston Kiri', homeOrAway: 'away', venue: venues.kouvola, ours: 3, theirs: 1, scorers: [[420, pid(10), pid(7)], [1310, pid(9)], [2650, pid(10), pid(11)]] }),
  game(2, { date: iso(-34), time: '13:00', opponent: 'Joen Pallo', homeOrAway: 'home', venue: venues.home, ours: 2, theirs: 2, scorers: [[900, pid(7)], [2200, pid(12), pid(10)]], absent: [pid(14)] }),
  game(3, { date: iso(-27), time: '12:00', opponent: 'Lahdenpohjan Tarmo', homeOrAway: 'home', venue: venues.home, ours: 1, theirs: 4, scorers: [[1800, pid(9)]], absent: [pid(3), pid(13)] }),
  game(4, { date: iso(-20), time: '14:00', opponent: 'Pihlajaveden Veikot', homeOrAway: 'away', venue: venues.mikkeli, ours: 4, theirs: 0, scorers: [[300, pid(10)], [1100, pid(11), pid(10)], [1700, pid(8)], [2800, pid(10), pid(6)]], fieldNumber: 'TN 2' }),
  game(5, { date: iso(-13), time: '11:00', opponent: 'Harjun Haukat', homeOrAway: 'home', venue: venues.home, ours: 2, theirs: 1, scorers: [[700, pid(7), pid(9)], [2450, pid(12)]] }),
  game(6, { date: iso(-6), time: '13:00', opponent: 'Rantakylän FC', homeOrAway: 'away', venue: venues.imatra, ours: 1, theirs: 1, scorers: [[1500, pid(9), pid(10)]], absent: [pid(2)], fieldNumber: 'TN 1' }),
  game(7, { date: iso(1), time: '13:00', opponent: 'Rantakylän FC', homeOrAway: 'away', venue: venues.imatra, ours: 0, theirs: 0, scorers: [], played: false, fieldNumber: 'TN 1' }),
]);
const known = Object.values(venues).map(v => ({ name: v.name, address: v.address, latitude: v.lat, longitude: v.lng, timesUsed: 1, lastUsed: iso(-6) }));
const settings = {
  language: 'fi', currentGameId: 'game_demo_07', lastHomeTeamName: 'MePa', hasSeenAppGuide: true, useDemandCorrection: false,
  clubSeasonStartDate: '2000-01-01', clubSeasonEndDate: '2000-12-31', hasConfiguredSeasonDates: true, homeView: 'dashboard',
  // full layout, the setup wizard already behind this account (it only ever opens in cloud mode anyway)
  appLayout: 'full', onboardingMilestones: { wizardDone: now, firstPlanSeen: now, firstGameFinished: now, secondGameFinished: now },
  startingPoint: { name: 'Koti', address: 'Metsäkyläntie 5, Lappeenranta', latitude: 61.0491, longitude: 28.2011 }, arrivalBufferMinutes: 30,
  knownVenues: known, assessmentsEnabled: false,
};
// The tournament day: three 2x25 games, 13 outfield players rotating through the 2-1-2-1-1
// (slots s0 LB, s1 RB, s2 CDM, s3 LM, s4 RM, s5 CAM, s6 ST). Each position lists its stints as
// [minute, player]; the first is the starter. Game 3 starts Leo ahead of Toivo, the one the hero
// swaps on film, so the day's minutes run 40'-100' before and 65'-95' after.
const planPlayers = players.map(({ id, name }) => ({ id, name }));
const STINTS = {
  pg1: { s0: [[0, 2], [25, 12]], s1: [[0, 3]], s2: [[0, 4], [35, 13]], s3: [[0, 5], [15, 8]], s4: [[0, 6], [25, 9]], s5: [[0, 7], [35, 14]], s6: [[0, 10], [15, 11]] },
  pg2: { s0: [[0, 12], [25, 2]], s1: [[0, 13], [25, 3]], s2: [[0, 14], [25, 4]], s3: [[0, 9], [35, 5]], s4: [[0, 8], [25, 6]], s5: [[0, 11], [15, 7]], s6: [[0, 10], [35, 11]] },
  pg3: { s0: [[0, 2], [25, 13]], s1: [[0, 3], [25, 12]], s2: [[0, 4], [25, 8]], s3: [[0, 5], [25, 9]], s4: [[0, 13], [25, 6]], s5: [[0, 7], [25, 11]], s6: [[0, 10], [25, 5]] },
};
const planGame = (id, label) => ({ id, label, formationId: '8v8-2-1-2-1-1', numberOfPeriods: 2, periodMinutes: 25, included: true,
  startingSlots: [{ slotId: 'gk', playerId: pid(1) }, ...Object.entries(STINTS[id]).map(([slotId, st]) => ({ slotId, playerId: pid(st[0][1]) }))],
  subs: Object.entries(STINTS[id]).flatMap(([slotId, st]) => st.slice(1).map(([min, n]) => ({ id: `${id}_${slotId}_${min}`, slotId, timeSeconds: min * 60, inPlayerId: pid(n) }))) });
const plan = { id: 'plan_demo_syksy', name: `Turnaus ${fixtureLabel}`, version: 1, createdAt: now, updatedAt: now, teamId, players: planPlayers,
  games: [planGame('pg1', 'Rantakylän FC'), planGame('pg2', 'Kuusiston Kiri'), planGame('pg3', 'Joen Pallo')] };
const backup = { meta: { schema: 1, exportedAt: now }, localStorage: {
  savedSoccerGames: games, soccerAppSettings: settings, soccerSeasons: [season], soccerTournaments: [], soccerMasterRoster: players,
  soccerTeamsIndex: { [teamId]: team }, soccerTeamRosters: { [teamId]: teamRoster }, soccerPlaytimePlans: { [plan.id]: plan }, soccerPlaytimeGameSubs: {}, soccerPlaytimePlanLinks: {},
} };
const outDir = process.argv[2] || new URL('../out/', import.meta.url).pathname; fs.mkdirSync(outDir, { recursive: true }); fs.writeFileSync(outDir + '/demo-backup.json', JSON.stringify(backup, null, 2));
console.log('demo backup:', outDir + '/demo-backup.json', '-', players.length, 'players,', Object.keys(games).length, 'games');
