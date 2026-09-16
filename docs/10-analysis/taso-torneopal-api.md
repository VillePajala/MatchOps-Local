# Taso / Torneopal API: what exists (investigated 2026-09-08)

**Extended 2026-09-16 with myClub (section 7).** The two systems bracket the same
coach workflow, and they turned out to have the same shape, so they belong in one
document.

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

## Decision (owner, 2026-09-08)

- **Read-only sync: not worth doing.** The point of a Taso integration was one ecosystem
  in which the coach stops using several platforms. Fixtures-in does not achieve that;
  results and lineups still get typed into Taso by hand. It also needs a backend and a
  club key for a minor convenience, and covers least the levels where MatchOps is used
  most. Revisit only if a write interface appears.
- **Taso helper view: build it, high priority.** Removes most of the real double entry
  with no API, no key, no terms. See UNIFIED-ROADMAP.md, P3 top.
- **Write API: none exists publicly.** Checked 2026-09-08: Palloliitto's help page,
  Torneopal's generic `api.torneopal.com/taso/rest/help` (same read-only set), Torneopal's
  FAQ/features, and every public integration (myClub, ASIO, GitHub). If one exists it is
  a private partner arrangement. The one email (section 5, step 1) is the only way to
  learn that, and it costs nothing to send.

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


---

## 7. myClub (investigated 2026-09-16)

Added because the owner described the real flow, which is three systems, not two:
check **myClub** for who is coming -> create the game in **MatchOps** -> enter the
lineup in **Taso** before, the result and scorers after -> mark who actually
participated back in **myClub**. MatchOps sits in the middle of that and is the only
one of the three the coach can change.

### 7.1 Two products, and only one of them is a web page

- **myClub web** is a **per-club subdomain**: `https://<club>.myclub.fi`. Verified
  resolving: `hjk.`, `hpm.`, `ljk.`. There is no single club-agnostic app URL.
  A central identity login exists at `https://id.myclub.fi/flow/login` (verified 200),
  which is the only URL we can hardcode for everybody.
- **myClub Coach** is a **native iOS/Android app**, not a web page. Android package
  `fi.myclub.coach` (Play listing verified 200). It is where attendance is actually
  marked - by tap or by scanning the member card - and the marks flow into the
  training diary and club statistics. Requires toimihenkilo rights.
  `https://www.myclub.fi/install-coach` redirects to the docs article, not the store,
  so it is not a useful link target.

This is the one structural difference from Taso: **Taso is one URL for everyone,
myClub is a different URL per club plus an app that has no URL at all.**

### 7.2 The API, and it has the same shape as Taso's

OpenAPI spec at `https://taikala.github.io/myclub-api-docs/fi`. Base URL
`https://{own-domain}.myclub.fi/api` - the per-club subdomain again. 62 paths.

**Reads what we want:**

- `GET /events?include_participants=true` - the events with who is coming. This is
  exactly the screen the coach checks before a game.
- `GET /members`, `GET /members/search`, `GET /groups/{id}/memberships` - the roster.
- `GET /venues`, `GET /rosters`, `GET /event_categories`, `GET /groups`.

**Writes - but not the write that matters.** `POST /events` and `PUT /events/{id}`
exist. The writable payload (`event-core`) is: `allow_comments`, `course_id`,
`description`, `description_html`, `starts_at`, `ends_at`, `event_category_id`,
`group_id`, `max_participations`, `name`, `participants_public`, `queue_enabled`,
`registration`, `registration_opens_at`, `registration_closes_at`,
`send_confirmation`, `venue_id`, `visibility`.

**No participation or attendance field anywhere in it.** There is no
`/participations` path and no `/events/{id}/participants`. All 62 paths were checked.

So attendance is readable and not writable - the same asymmetry as Taso, arrived at
independently:

| | Read | Write |
|---|---|---|
| myClub attendance | yes | **no** |
| Taso lineup / result / scorers | yes | **no** |

**The consequence for MatchOps is the whole story:** the app can *pull* from both and
*push* to neither. Every hand-off out of MatchOps stays a person typing, and no change
of app format (native, Capacitor, anything) alters that, because the wall is on their
servers.

### 7.3 Key, cost and terms - and the one way myClub is easier than Taso

- The key is **per member**: log in as the account it belongs to, user menu ->
  "Rajapinta-avain" -> Nayta. Enabled under Settings -> Add-ons, which is a club
  administrator.
- **Paid add-on**, and explicitly outside free support: *"koska kyseessa on
  asiantuntijatason ohjelmistokehitysrajapinta ... ei ohjelmistorajapinnan kaytto
  kuulu maksuttoman tuotetuen piiriin"*.
- The docs warn *"Ala koskaan laheta rajapinta-avainta sahkopostitse tai jaa sita
  muille"* but state **no server-side-only rule**. That is the difference from
  Torneopal, whose terms explicitly forbid embedding the key in an application. A
  per-member key that the coach holds and never shares is the BYOK shape Kirjuri
  already uses - so myClub, unlike Taso, does not on its face require us to run a
  backend.
- **There is no test environment** (*"Jarjestelmassa ei ole tarjottavana
  testiymparistoa"*). Any development runs against a real club's live data.

### 7.4 The one blocker to settle before planning any pull: CORS

An unauthenticated preflight on 2026-09-16 -
`OPTIONS https://<club>.myclub.fi/api/events` with `Origin` and
`Access-Control-Request-Method: GET`, tried against two clubs - returned **403 from
`awselb/2.0` with no `access-control-allow-origin` header**.

Suggestive, not conclusive: the clubs tested may not have the add-on at all, and a
WAF may simply refuse OPTIONS. But if there is no CORS, a browser cannot call this
API no matter who holds the key, and the BYOK advantage in 7.3 evaporates - the
feature would need a Supabase Edge Function proxy and would become cloud-mode only.

**The spike is one request:** with a real key, does a `GET` from a browser origin come
back with CORS headers? That single answer decides whether a myClub pull is a
client-side feature or a backend feature.

### 7.5 Sources

- myClub API docs, https://taikala.github.io/myclub-api-docs/fi
- myClub: sovellusrajapinta, https://docs.myclub.fi/article/1432-sovellusrajapinta
- myClub: toimihenkiloiden mobiilisovellus, https://docs.myclub.fi/article/1161-mobiilisovellus
- myClub: API-rajapinta / jarjestelmaintegraatiot, https://www.myclub.fi/uutiset/api-rajapinta-jarjestelmaintegraatiot/
- myClub: lasnaoloseuranta, https://www.myclub.fi/ominaisuudet/lasnaoloseuranta/
- myClub Coach on Google Play, https://play.google.com/store/apps/details?id=fi.myclub.coach
