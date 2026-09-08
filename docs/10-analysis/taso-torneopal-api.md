# Taso / Torneopal API: what exists (investigated 2026-09-08)

Read before any Taso integration work. Companion to UNIFIED-ROADMAP.md, "Palloliitto Taso
integration". Every claim below comes from a public source listed at the end; where the
source is thin it says so.

## 1. Who is who

- **Taso** (taso.palloliitto.fi) is Palloliitto's competition system: team rosters,
  lineups, electronic match reports, referee assignments and fees, live match tracking.
  Login with an 8-digit PalloID (created in Pelipaikka, fin.ma.services). No OAuth or
  third-party login exists.
- **Tulospalvelu** (tulospalvelu.palloliitto.fi) is the public results site, rebuilt
  2021-03-15 with design agency Genero.
- Both are built and run by **Sentinel Software SSW Oy**, Riihimaki (Y-tunnus 1028911-9),
  trading as **TorneoPal / TorneoPal International**. CEO Panu Hiltunen. Support
  tuki@torneopal.fi, +358 44 987 7970; sales info@torneopal.com. PHP on Linux, MariaDB.
  Also runs Basketball Finland, Kaukalopalloliitto and tournament customers abroad.
- Torneopal's FAQ: "Yes, we offer API support; however, it is not included in the standard
  pricing." So a product-level integration is a commercial conversation with Torneopal, and
  for Taso data, with Palloliitto as the organiser.

## 2. The official API ("Tason rajapinta")

Palloliitto's support article describes two tiers, both obtained by logging into Taso:

| Tier | Who | What you get |
|---|---|---|
| Team credentials, "API" menu | any team | JavaScript widgets (team's matches, league table) for the club website |
| Club admin, "Rajapinta" menu | club administrator, after accepting terms | a REST api_key covering all the club's teams |

REST facts (from the help page, spl.torneopal.net/taso/rest/help):

- Base URL `https://spl.torneopal.net/taso/rest` (spl.torneopal.fi also resolves).
  `api_key` goes as a query parameter. JSON responses. Results cached up to 1 minute;
  `getScore` is never cached and may be polled at most once per second. Pagination via
  `page_size` / `page_number`.
- **Rule stated on the page: use the key only between your server and the competition
  server. Never embed the key in a web page or an application.** For MatchOps that means a
  backend, not the client-direct pattern Kirjuri uses.
- **Read-only. Every method is a GET. There is no write method of any kind** (no lineups,
  no results, no events, no live input).
- No GDPR, retention or personal-data wording anywhere in the docs.
- Club keys return the club's own data only (`getClub` note).

Methods, grouped: competitions (`getCompetitions`, `getCompetition`, `getSeasons`,
`getCategories`, `getCategory`, `getCategoryTree`), groups and tables (`getGroup`,
`getGroups`), teams (`getTeams`, `getTeam`, `getNextMatches`), players (`getPlayer`),
matches (`getMatches` by competition/category/date range/venue/team/group,
`getMatch`, `getScore`, `getMultiMatches`, `getMatchCount`, `getCalendar`,
`getMapMatches`), clubs (`getClubs`, `getClub`), venues and geography (`getVenues`,
`getVenue`, `getVenueEvents`, `getCity`, `getLocation`, `getArea`), plus news, info pages,
referee clubs, weather. `getSports`, `getDistricts`, `getSeason` and `getWeather` need no key.

What `getMatch` carries (the fields that matter to us): `match_id`, `match_number`,
`status` (Fixture, Planned, Live, Break, Played, Canceled, Suspended, Abandoned,
Reschedule), `date`, `time`, `time_zone`, `venue_*`, `competition_*`, `category_*`,
`group_*`, `round_*`, `team_A_id/name`, `team_B_id/name`, `club_A/B_*`, full-time and
half-time scores (`fs_A/B`, `hts_A/B`), period scores and times (`p1s_A` ... `p5_*`),
`period_count`, `period_min`, `playing_time_min`, `lineups`, `lineups_filled`,
`lineups_published`, `starting_players`, `substitutions`, `substitution_events`, `goals`,
`bookings`, `events`, referees, `live_*` clock fields, `match_report_exists`, `stream_url`.

What `getTeam` carries: `team_id`, `team_name`, `club_*`, `home_venue_*`, and per player
`player_id`, `first_name`, `last_name`, `shirt_number`, `shirt_name`, `captain`,
`position`, `birthday`, `birthyear`, `height`, `weight`, `nationality`, season stats;
officials with roles; category participation history. **That is personal data about
children, more than MatchOps needs.** Any sync must pull the minimum (name, shirt number,
player_id) and leave birthdays and measurements alone.

The public results site uses the same REST behind the scenes with a key carried in an
`Accept` header; the open-source `tulospalvelu-mcp` copies that header out of the browser
to work. That is exactly the embedded key the terms forbid, revocable at any time. Not a
basis for a product.

## 3. Existing integrations (all read-only, all club-key)

- **myClub** (club management, "service level 3" add-on): the club enters its Taso API key,
  matches are pulled once a day as draft calendar events, immediate refresh on demand,
  each myClub group is mapped by hand to a Taso group/team, only venue and time are
  overwritten on refresh, matches deleted in Taso are marked POISTETTU.
- **ASIO** (field booking): club admin pulls fixtures from Taso into the booking calendar
  on demand, chooses which teams and venues, can re-import to update. The slides say in so
  many words: "the interface is not two-way synchronisation; it is one-way, Taso to Asio,
  on a read principle."
- **torneopal-info** (GitHub, PHP): venue info screens from `getMatches`.
- **tulospalvelu-mcp** (GitHub): read-only MCP server over the same endpoints.

No third party writes to Taso. myClub and ASIO are the closest precedents and both stop at
fixtures in, results back.

## 4. How a result gets into Taso today (the write side)

Everything below is browser UI on taso.palloliitto.fi. There is no Taso mobile app; the
"TASO" app on Google Play is an unrelated product.

1. **Before**: both teams fill their lineup at least 4 hours before kickoff: players from
   the club's registered list (PalloID-backed, pelipassi check), shirt numbers, captain
   marked C, staff, a match-specific responsible person. Signing locks the lineup; the
   referee can unlock with a day code. Changes after kickoff are not possible.
2. **Match report states**: Ennakko -> Lukittu -> Alkanut -> (Keskeytetty) -> Pelattu ->
   Tarkistettu. After Tarkistettu only the competition organiser can edit.
3. **LIVE (otteluseuranta)**: the home team, or anyone holding the match-specific code
   (e.g. "XUKPB", shown to the home team's responsible person), runs a browser page:
   start clock, goal + scorer (+ assist), penalty scored/missed, substitution out then in
   at the same minute, caution, sending-off, added time, half-time, second half,
   attendance, weather, final whistle, end tracking -> state Pelattu. Events buffer
   offline and upload when the connection returns. Events show on Tulospalvelu in real
   time. Tracked events vary by level: goals, assists, cards, subs, penalties, fouls,
   free kicks, offsides, corners, shots, saves.
4. **Not LIVE**: the home team's responsible person or the referee fills result, goals
   (minute, scorer), cards, substitutions after the match and sets Pelattu.
5. **Referee confirms** the report (Vahvista poytakirja) -> Tarkistettu.

So the write path is a person with a PalloID or a match code, in a browser. The only
programmatic ways in are (a) a partnership with Palloliitto and Sentinel for an API that
does not exist publicly, or (b) driving the web UI, which is fragile and against the terms.
(b) is not an option for a product.

## 5. What this means for MatchOps

**Feasible now, with a club's own key, read-only:**
- Fixtures for the club's teams: opponent, date, time, venue, competition, Taso match_id.
  Results and confirmed events after the referee signs. Standings.
- Requires: our own backend that holds the club key (the key may never be in the app), a
  club admin who enters it, a mapping Taso team_id <-> MatchOps team (myClub does this by
  hand), and a poll (daily plus on demand, like myClub; the 1-minute cache is the floor).
- Privacy: pull only what the coach's team needs. No birthdays, heights, weights.
- Value: the coach never types an opponent, date or venue again; a played match can be
  reconciled against the official result; the club sees every team's fixtures in one place.

**Not feasible without a partnership:** lineups in, results out, live events out.

**Middle path that removes most of the double entry with no write access:** MatchOps
already knows the lineup with shirt numbers, goals with minute and scorer, substitutions
and cards. A "Taso helper" view (parked 2026-07-01) could present them in exactly the
order and form Taso's screens want (subs as out-then-in at the same minute, goals with
scorer, cards with reason), so filling the report is a copy, not a recall. Zero API,
zero terms risk, works today.

**Order that makes sense:**
1. One email to Palloliitto kilpailutoiminta and Torneopal: may a coaching product use
   club REST keys through its own backend (terms), and does any write interface exist or
   is one planned, and at what price.
2. Prototype the read sync on staging with the owner's own club key: fixtures in,
   results compared. Backend piece plus team mapping UI.
3. Taso helper view, regardless of 1 and 2.
4. Write-back only if 1 opens a door.

**Open questions:** whether the club terms permit a third-party SaaS to hold the key on
the club's behalf (myClub does, so presumably yes); which competitions publish lineups
(`lineups_published`); how junior "harraste" levels appear (many U10 games may not be in
Taso at all, or without events); how to reconcile MatchOps players with Taso players
without importing PalloIDs.

## Sources

- Palloliitto: Tason rajapinta, https://tuki.palloliitto.fi/fi/support/solutions/articles/103000036813-tason-rajapinta
- Taso REST help, https://spl.torneopal.net/taso/rest/help
- Palloliitto: Kokoonpanojen tayttaminen ja vahvistaminen, https://tuki.palloliitto.fi/fi/support/solutions/articles/103000036808
- Palloliitto: Otteluseuranta ja ottelupoytakirjan tayttaminen (+ LIVE-seuranta 10.7.2020 PDF), https://tuki.palloliitto.fi/fi/support/solutions/articles/103000036806
- Palloliitto: Ohjeet erotuomareille, sahkoinen poytakirja (PDF), https://tuki.palloliitto.fi/fi/support/solutions/articles/103000036809
- Palloliitto: Kirjautuminen eri jarjestelmiin, https://tuki.palloliitto.fi/fi/support/solutions/articles/103000240734
- Palloliitto news, new results service 2021, https://uutisarkisto.palloliitto.fi/uusi-tulospalvelu-hemmottelee-kayttajia-uusilla-ominaisuuksilla-meille-ei
- myClub TASO-integraatio, https://docs.myclub.fi/manager/add-ons/myturn/taso-integraatio
- ASIO: Ottelusiirrot Palloliiton TASO-jarjestelmasta ASIO-kenttavarausjarjestelmaan (PDF), https://www.asio.fi/pdf/Palloliiton_TASO_Asio_ottelusiirrot_ja_API-rajapinta.pdf
- TorneoPal FAQ, https://www.torneopal.com/faq ; features, https://www.torneopal.com/features ; torneopal.fi
- Sentinel Software SSW Oy, https://www.finder.fi/Sovellukset+ja+ohjelmistot/Sentinel+Software+Ssw+Oy/Riihim%C3%A4ki/yhteystiedot/859036
- mplattu/torneopal-info, https://github.com/mplattu/torneopal-info
- jsvirtane/tulospalvelu-mcp, https://github.com/jsvirtane/tulospalvelu-mcp
- LePa toimihenkilo-opas: TASO-jarjestelman kayttaminen (PDF), https://bin.yhdistysavain.fi/1592044/00K3wwro4WiauGVXIeFV0YS0Jj/Toimihenkil%C3%B6opas-TASOn%20k%C3%A4ytt%C3%A4minen.pdf
