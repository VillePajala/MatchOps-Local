# Rules Directory (Säännöt)

**Status**: ✅ Implemented
**Last Updated**: 2026-09-09

## Overview

One screen answering "what applies to my game", backed by Palloliitto's own
published material. It has two halves, deliberately in this order:

1. **The official game formats table** - players per side, playing time, court,
   goal and ball, per age band. This is the part that answers a question.
2. **Links to the rulebooks** - for the full text, when the table is not enough.

The links came first historically, and on their own they were weak: four
documents running to hundreds of pages, none of which tells a coach how long
their U10's halves are without a search.

## Key components

| File | Role |
|------|------|
| `src/components/RulesDirectoryModal.tsx` | The modal: formats table, then links |
| `src/config/gameFormats.json` | The transcribed formats data |
| `src/config/gameFormats.source.txt` | Verbatim extraction, committed as evidence |
| `src/config/gameFormats.ts` | Types + age-band lookup |
| `src/config/ruleLinks.json` | The rulebook links, with their listing pages |
| `scripts/check-rule-links.mjs` | Weekly CI check (links + source hash) |

## Two rules that must not be broken

**1. The formats are NATIONAL DEFAULTS, and the screen must say so.**
A series may deviate. A series' own rules live in Palloliitto's results service
behind a club API key whose terms are server-to-server only, and this app has no
server, so the app cannot know them. Presenting a default as "your rules" would
make the app confidently wrong for anyone whose league differs. There is a
`@critical` test on the caveat text.

**2. The table names its sport and season.**
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
