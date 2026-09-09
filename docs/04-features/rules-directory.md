# Rules Directory (Säännöt)

**Status**: ✅ Implemented
**Last Updated**: 2026-09-09

## Overview

One screen answering "what applies to my game". The hard part is that
**Palloliitto does not publish "the rules" in one place**, so the screen's job
is to be a map, not a dump. Three kinds of rule live apart, and the page is
ordered by how specific each is to the coach:

1. **Your league's rules** - player count, playing time and pitch size are set
   **per league** (*sarja*; the app calls these Leagues / Sarjat) and live in
   Tulospalvelu under each one's Info > Säännöt tab. This is the only one that
   is actually *theirs*, so it comes first. The Kaikki Pelaa programme document
   states this move in its opening line.
   **Use the app's own word in UI copy**: EN "league", FI "sarja". Palloliitto's
   docs say "series", and importing that vocabulary confused the owner on first
   read - if it confused him it will confuse a coach.
2. **Age-group formats** - the national defaults. Futsal has a published
   one-page table, which the app carries in full. Football does not (see below).
3. **Laws of the game** - the rulebooks, the same for everyone, so last.

Before this structure the screen showed some futsal numbers and four document
links, which reads as half-finished because it mirrored the publisher's mess
instead of explaining it.

## Key components

| File | Role |
|------|------|
| `src/components/RulesDirectoryModal.tsx` | The modal: your league, then the formats table, then the rulebooks |
| `src/config/gameFormats.json` | The transcribed formats data |
| `src/config/gameFormats.source.txt` | Verbatim extraction, committed as evidence |
| `src/config/gameFormats.ts` | Types + age-band lookup |
| `src/config/ruleLinks.json` | The links (grouped `series` / `rulebooks`), with their listing pages |
| `scripts/check-rule-links.mjs` | Weekly CI check (links + source hash) |

## Three rules that must not be broken

**1. The formats are NATIONAL DEFAULTS, and the screen must say so.**
A series may deviate. A series' own rules live in Palloliitto's results service
behind a club API key whose terms are server-to-server only, and this app has no
server, so the app cannot know them. Presenting a default as "your rules" would
make the app confidently wrong for anyone whose league differs. There is a
`@critical` test on the caveat text.

**2. The Kaikki Pelaa citation is from a DELISTED document.**
The quote establishing that the per-age numbers moved to Tulospalvelu comes
from `kaikki-pelaa-ohjelma-2025.pdf`, which Palloliitto has removed from its
rules index. It is cited as the historical reason for the move, never as a
current rule, and nothing in `gameFormats.json` is transcribed from it. If a
newer programme document appears, re-check that the statement still holds.

**3. The table names its sport and season.**
It currently covers **futsal only**, and most users play football, so a generic
"game formats" heading would invite a football coach to read futsal's 4v4 as
their own. The heading comes from the data's own `source.title`, and a second
line states football is not included.

## Why football is absent

Checked, not assumed (2026-09-09):

- Its season-2027 formats are announced only as a JPG image, with no text layer.
- `kilpailumaaraykset-2026-jalkapallo.pdf` (42 pages) contains **no** formats
  table - no game-format, court-size or playing-time rows at all.
- The current age rules moved into the results service, per series.

So there is no extractable authoritative football source today. Revisit when a
text document is published for season 2027.

## How the data stays correct

The numbers were extracted **cell by cell from the source PDF's own table
gridlines**, not from a text dump - a text dump bled neighbouring columns
together on four of the eight rows.

Three independent guards, because a plausible-but-wrong period length is worse
than no number at all:

| Guard | Catches |
|---|---|
| `gameFormats.source.txt` | A human can diff data against the source with no download |
| `gameFormats.test.ts` | Anything the app can display that the source does not say |
| Weekly hash check | Palloliitto reissuing the PDF - the case the tests cannot see, since they compare against our own evidence |

**Content stays in Finnish on purpose.** The column headers are translated; the
values are quoted verbatim from the official Finnish table. Translating figures
and terms like "suora"/"tehokas" would break the verbatim guarantee the test
depends on, and would invent wording Palloliitto never published.

## Refreshing for a new season

1. Find the new formats PDF from the rules index or its announcement.
2. Re-extract with the gridline method, rewrite `gameFormats.source.txt`.
3. Update `gameFormats.json` including `source.sha256` and `extractedOn`.
4. Run `node scripts/check-rule-links.mjs` and the unit tests.

The weekly job tells you when this is due: it fails with the old and new hashes
and the instruction to re-extract.

## Where it is reachable

- **Club Home** → Club tab, above Coaching Materials.
- **Match mode** → control-bar menu, and the field container.
- **Deep link** → the `rules` route.

Not in the settings gear: it is reference material a coach consults, not app
configuration, and one entry point per screen (a test asserts the gear does not
also offer it).

## Vocabulary

Say **league** (EN) / **sarja** (FI) - the app's own words, matching the Leagues
and Sarjat labels elsewhere. Palloliitto's documents say "series", and anyone
working from those sources drifts back to it; the owner was stopped by "your own
series" on first read. An i18n test fails if any English string on this screen
says "series".
