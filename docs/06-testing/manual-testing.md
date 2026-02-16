# Manual Testing Guide

Use this short checklist to manually verify key workflows after making changes to the app:

1. **Start a new game and adjust scores** – Add and remove goals for both teams. Ensure the score never goes below zero and updates instantly in the UI.
2. **Reset the game timer** – Begin a period, let the timer run, then trigger both "Reset Timer" and "Reset Game" actions. Confirm the timer and period values reset as expected.
3. **Open modals sequentially** – Open Game Settings, Load Game and Roster modals one after another. Each should appear without closing the others unexpectedly and allow closing individually.
4. **Switch languages** – Toggle between English and Finnish and verify all visible text changes without reloading the page.
5. **Save and reload a game** – Perform a quick save, refresh the page and load the saved game to confirm state persistence.
6. **Assess players after a game** – After ending a game, open the Player Assessment modal via the new button. Adjust a slider for a player, tap **Save**, then close and reopen the modal to confirm the rating was stored.
7. **Try new assessment UI** – Expand a player card and verify the segmented overall selector, sliders and notes input work. Saving should collapse the card and show a checkmark.
8. **Review assessment progress** – Save ratings for multiple players and ensure the header progress updates and saved players show a ✔ icon.
9. **Check performance averages** – Open a player's stats page and confirm the new Performance Ratings section shows average slider values and number of rated games. In Game Stats, open the Overall tab to see team rating averages.
10. **Toggle demand correction** – In Player Stats view, enable the *Weight by Difficulty* option and verify averages change when games use different difficulty factors.
11. **Game type empty state** – In Game Stats, switch the sport filter from **Soccer** to **Futsal** when there are no futsal games. Confirm the list shows an appropriate "No games found" message instead of staying blank.

12. **Marketing consent on sign-up** – During cloud sign-up, verify a marketing consent checkbox appears (unchecked by default). Sign up without checking it, then check Settings → Account — no "Email Preferences" toggle should show as granted. Sign up again and check the box — toggle in Settings should reflect "granted" state.
13. **Marketing consent prompt for existing users** – Sign in as an existing cloud user with no marketing consent. A banner should appear at the bottom. Clicking "No thanks" or X should dismiss it permanently (survives refresh). The banner should not appear for local-mode users.
14. **Marketing consent toggle** – In cloud mode, go to Settings → Account. An "Email Preferences" toggle should appear. Toggle it on/off and verify toast messages appear. The toggle should not be visible in local mode.

## Cloud Mode Test Cases

15. **Sign up flow** -- Create a new cloud account with email/password. Verify the confirmation email is received (via Resend SMTP). Confirm the account and verify you land in cloud mode with an empty state.
16. **Sign in flow** -- Sign out, then sign back in with the same credentials. Verify your data is loaded from the cloud.
17. **Local-to-cloud migration** -- Start in local mode with some saved games and players. Switch to cloud mode via Settings. Verify the migration wizard appears and data transfers to the cloud. Confirm games, players, seasons, and tournaments are all present after migration.
18. **Cloud-to-local migration (reverse)** -- In cloud mode, go to Settings and switch to local mode. Verify the reverse migration transfers cloud data to local IndexedDB. Confirm data integrity after switching.
19. **Sync status verification** -- In cloud mode, create a new game, save it, then open a different browser or incognito window (signed in to the same account). Verify the game appears in the second session.
20. **Mode switching** -- Switch between local and cloud mode multiple times. Verify no data loss and the correct data store is active after each switch.
21. **Offline behavior in cloud mode** -- While in cloud mode, disable network (airplane mode or DevTools offline toggle). Attempt to save a game. Verify a clear error message appears (not silent queuing). The app should suggest switching to local mode for offline work.

Running through these steps after updates helps catch regressions before deploying.
