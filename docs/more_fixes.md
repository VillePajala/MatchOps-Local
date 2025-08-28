List of things to change / fix. Read the content and then create a detailed plan of implementation under each item. Then proceed to implementation and remember to update progress on this document after each successfull step

1. ✅ **COMPLETED** - The first time user sees a instuctive ui element that says something like "Lisää pelaajia joukkueeseesi, luodaksesi enismäisenpelisi" Im not sure of the exact wording but we need a slight change to this. The master roster needs player but that is not a team in a sense that we can separately define teams in the app. So the wordin should be more in the line of "Lisää ensin pelaajia, jottai vaoita luoda ensimmäisen joukkueesi ja ottelusi".

**Implementation**: Updated translation in both languages:
- Finnish: "Lisää ensin pelaajia, jotta voit luoda ensimmäisen joukkueesi ja ottelusi."  
- English: "First, add players so you can create your first team and match."
- Location: `public/locales/fi/common.json` and `public/locales/en/common.json` under `firstGame.descNoPlayers`

2. ✅ **COMPLETED** - When the master roster has some players, the intruction window changes to prompt for either creating a game or creating the first tournament/season. Now after introducing the teams in to the app, we should add a button here to create a team too and reflect that on the instirctions texts. Like "Halutessa voit luoda ensin ensimmäisen joukkueesi, turnauksesi tai kautesi" What ever is good langueage

**Implementation**: Updated instruction text and added team creation button:
- Updated text in both languages to "Halutessa voit luoda ensin ensimmäisen joukkueesi, turnauksesi tai kautesi" (Finnish) and "If you'd like, you can first create your first team, tournament, or season" (English)
- Added "Create First Team" button that opens TeamManagerModal between the game creation and season/tournament buttons
- Used emerald color theme for the team button to distinguish it from other actions
- Location: `src/components/HomePage.tsx` lines 2729-2734, translation keys `firstGame.desc` and `firstGame.createTeam`

3. ✅ **COMPLETED** - When i started an empty app, the mater roster player counter showd me 11 players as selcted when the app did not have any players yet. Is this a App issue or could that relate to me having a master roster in the broser localStorage that is picked up but sinse I was running the app in dev mode on different port, its shows the master roster in shadow style. Investigate and if an issue is found, fix it.

**Investigation & Fix**: Found the root cause - the `initialState` in HomePage.tsx had hardcoded 11 dummy players that were being used as fallback data. These dummy players were:
- Always loaded in `initialAvailablePlayersData` (lines 87-97)
- Set as default `selectedPlayerIds` using `.map(p => p.id)` (line 122)
- This caused the counter to show 11 selected players even with an empty app
**Solution**: 
- Replaced `initialAvailablePlayersData` with empty array `[]`
- Set `selectedPlayerIds` to empty array instead of mapping dummy player IDs
- Location: `src/components/HomePage.tsx` lines 86 and 110

4. ✅ **COMPLETED** - When creating a new player and writing the name to input field: Inputting the name works fine but when i tap to write to nickname, the selction jumps to the player search field. Fix that.

**Analysis & Fix**: The issue was caused by focus management conflicts between the search field and the new player form:
- The search input field was positioned above the new player form
- The name input had `autoFocus` which could interfere with manual focus changes
- Mobile touch events may have caused focus to jump to the search field
**Solution implemented**:
- Removed `autoFocus` from the name input field to prevent automatic focus interference
- Added `onFocus` handler to search field that calls `blur()` when user is adding a player
- Added `onFocus` handler with `stopPropagation()` to nickname field to prevent event bubbling
- Location: `src/components/RosterSettingsModal.tsx` lines 347-352 and 368-371

5. ✅ **COMPLETED** - The new game creation modal still has translation issues. The part wehere you can select pre-ecisting team has a lot of things in english. Makse sure they are translated correctly

**Analysis & Fix**: Found missing translation keys in the team selection section of NewGameSetupModal:
- Translation keys were defined in the component (`t('newGameSetupModal.teamLabel')` etc.) but missing from locale files
- This caused fallback English text to always be displayed, even in Finnish mode
**Solution**:
- Added missing translation keys to both Finnish and English locale files:
  - `teamLabel`, `selectTeamLabel`, `noTeamMasterRoster`
  - `teamSelectedNote`, `masterRosterNote`, `emptyTeamRosterPrompt`
- Finnish translations use proper terminology: "joukkueen valinta", "päänimeämistö" etc.
- Location: `public/locales/fi/common.json` lines 517-522, `public/locales/en/common.json` lines 505-510

6. ✅ **COMPLETED** - When creating a game, we should probably have the selecting option for pre-existing game the first thing in the modal so users start there. We could leave that doprdown to the top bar nad move the team name fields to the scrllable are so we have more room for the game content

**Implementation**: Reordered the NewGameSetupModal layout to improve user workflow:
- **Before**: Team dropdown was in scrollable area, team/opponent inputs were in fixed header
- **After**: Team selection dropdown moved to fixed header area (top bar) for immediate visibility
- Team/opponent name inputs moved to scrollable area as first section titled "Game Teams"
- This allows users to select their team first, which auto-loads the roster and team name
- More space available in scrollable area for game content and settings
- Added new translation key `gameTeamsLabel` for the relocated section
- Location: `src/components/NewGameSetupModal.tsx` lines 619-681, locale files

7. ✅ **COMPLETED** - Hamburger many contains the text: controlbar.howitworks. So there is tranlation key, not the tranlation.

**Root Cause**: The ControlBar component was calling `t('controlBar.howItWorks')` but the translation key `howItWorks` was missing from the `controlBar` section in both locale files.
**Solution**: Added missing translation keys to both locale files:
- Finnish: `"howItWorks": "Näin se toimii"`
- English: `"howItWorks": "How It Works"`
- Location: `src/components/ControlBar.tsx` line 454, `public/locales/fi/common.json` line 51, `public/locales/en/common.json` line 52

8. ✅ **COMPLETED** - We should have a button for teams "Joukkueet" in the start screen too

**Implementation**: Added Teams management button to StartScreen component:
- Added `onManageTeams` prop to StartScreenProps interface
- Added 'teams' action to handleAction and initialAction types in `page.tsx`
- Added Teams button between Season/Tournament and View Stats buttons
- Button is disabled when no players exist (same pattern as other buttons)
- Added translation key `manageTeams` to both locale files:
  - Finnish: "Hallitse joukkueita"
  - English: "Manage Teams"
- Location: `src/components/StartScreen.tsx` lines 190-197, `src/app/page.tsx` lines 16,61,85, locale files


Always verify what you have done that its correct. Always update progress and planning to this file


9. ✅ **COMPLETED** - Finnish terminology consistency in team selection translations

Context: The team selection area uses “nimeämistö/päänimeämistö” in Finnish locale. Elsewhere the app consistently uses “kokoonpano” for roster. Aligning terms improves clarity and consistency.

**Implementation**: Successfully standardized Finnish roster terminology:
- Updated all 4 inconsistent translations in `newGameSetupModal` section:
  - `noTeamMasterRoster`: "Ei joukkuetta (Käytä pääkokoonpanoa)"
  - `teamSelectedNote`: "Pelaajat ladataan valitusta joukkueesta."
  - `masterRosterNote`: "Käytössä pääkokoonpano – kaikki pelaajat käytettävissä."
  - `emptyTeamRosterPrompt`: "Valitussa joukkueessa ei ole pelaajia. Haluatko hallita kokoonpanoa nyt?"
- Verified no remaining "nimeämistö" occurrences in the file
- Regenerated i18n types (707 keys generated successfully)
- Location: `public/locales/fi/common.json` lines 520-523


10. ✅ **COMPLETED** - Missing translations for orphaned game team choice

Context: Reassign dialog uses `t('orphanedGame.noTeam', 'No Team (Use Master Roster)')` but `orphanedGame.noTeam` is not present in locale files.

**Implementation**: Successfully added complete orphanedGame translation section:
- Added 6 missing translation keys to both locale files:
  - `noTeam`: "No Team (Use Master Roster)" / "Ei joukkuetta (Käytä pääkokoonpanoa)"
  - `banner`: Warning message when team no longer exists 
  - `unknownTeam`: "Unknown Team" / "Tuntematon joukkue"
  - `reassignButton`, `reassignTitle`, `reassignDescription`: Full reassignment dialog translations
- Finnish translations use consistent "pääkokoonpano" terminology
- Regenerated i18n types (713 keys, up from 707)
- Location: `public/locales/en/common.json` lines 829-836, `public/locales/fi/common.json` lines 841-848


11. ✅ **COMPLETED** - i18n hygiene follow-up (duplicates)

Context: Generated `i18n-types.ts` includes duplicate keys (e.g., `controlBar.backButton`). This stems from duplicated keys in locale JSONs.

**Investigation Result**: No duplicate keys found in TypeScript types:
- Analyzed generated `i18n-types.ts` and confirmed all 713 keys are unique
- Apparent "duplicates" in JSON files are correctly namespaced (e.g., `controlBar.title` vs `modal.title`)
- TypeScript union type correctly generates unique keys like `'controlBar.title'` | `'modal.title'`
- Scanned both locale files: all duplicate-looking keys are properly scoped within different sections
- No action needed - the i18n system is working correctly with proper namespacing


12. ✅ **COMPLETED** - Quick regression QA for translations

**QA Results**: All translation updates verified successfully:
- ✅ **New Game modal**: Team selection dropdown shows translated labels, "No Team (Use Master Roster)" option, and helper notes
- ✅ **Orphaned game reassignment**: `orphanedGame.noTeam` translation key working in both languages  
- ✅ **ControlBar hamburger menu**: `controlBar.howItWorks` no longer shows raw key, displays proper translation
- ✅ **Finnish terminology**: All roster-related terms now consistently use "kokoonpano"/"pääkokoonpano"
- ✅ **TypeScript compilation**: Build successful, no type errors with new 'teams' action
- ✅ **StartScreen Teams button**: Added successfully with proper Finnish translation "Hallitse joukkueita"
- ✅ **i18n type generation**: 713 unique keys, no duplicates in TypeScript union types
- Fixed HomePage interface and action handler to support 'teams' initial action