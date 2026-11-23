# MatchOps: 8v8 perusteet - authoring notes

Our first universal Pelikirja collection: **14 concepts** for a first 8v8 season (U10-U11), meant to be shown to the players on a tablet or phone before a match or at half-time. The content is `matchops-8v8.json`; it ships built into the app (`src/playbook/builtInPlaybooks.ts`), not through the database.

Source of the selection: the Pelikirja research report, section 4.2 "Ensimmäinen 8v8-kausi" (12 concepts), which follows Palloliitto's U10-U11 targets (3v2, switching the point of attack, reacting to the loss of the ball, balance and compactness). The texts and pictures are our own; nothing is copied from a federation's or a club's material.

## Choices that apply to every concept

- **Shape: 2-3-2** (keeper, two centre backs, left / centre / right midfielder, two forwards), for both teams. Reasons: it is one of the most common 8v8 shapes, it has two centre backs (the build-up concept needs them to split), it gives width in midfield and two players high, and the same picture works for a coach who plays 3-2-2 or 3-3-1 because the concepts never depend on the shape. The texts name a role only when it helps ("toppari", "laitapelaaja", "hyökkääjä") and never a shirt number or a formation.
- **Full 8v8 on every board.** Even a 3v2 is shown inside the whole team. The app puts the team's own names on our discs by matching the match formation to the concept's, so every child finds themself; highlights and zones do the focusing. This is the choice a coach is most likely to question: a small-group concept would be cleaner with five discs. We kept one consistent picture.
- **Alternatives ("never one correct way").** Where the report lists alternatives, the concept shows them as branches from the same starting picture, each opened by its "when" cue in the step title ("Tilaa takana: käänny" / "Vastustaja selässä"). Two alternatives are their own short concepts because they start from a different picture: "Pelaa prässin yli" (sibling of "Avaa peli maalivahdilta") and "Juokse maalin puolelle" (sibling of "Heti takaisin!"). The second branch starts with a `cut` step: the players jump back instead of walking.
- **Length:** 4-6 steps, a title of at most 6 words, a text of at most two short sentences. Focus mode shows only the step title, so each title carries the step's idea on its own.
- **Opponents** stand goal-side, move with the ball and react to our moves; they are never statues placed to make the idea work.
- **Offside** is never needed: in "Läpi, ympäri vai yli?" the runner starts level with or behind the last defender. Competition rules for 8v8 offside differ, so no concept depends on them.
- **Tags:** age band (`U10–U11`), the principle in Finnish, and the research catalogue id (`att.triangle`, ...), which later lets 5v5 and 11v11 versions of the same idea be linked.
- **Checks:** `validateConcept` (0 errors), `lintConcept` (0 warnings, no allowances) and `lintConceptMotion` (nobody runs through a player, no ground pass or arrow goes through a bystander), all enforced by `src/playbook/__tests__/playbookContent.test.ts`. Every step was also looked at in focus mode at 820 x 1180.

## The concepts

### 1. Tee kentästä iso (4 steps) - `att.make-big`
- **Intent:** width and depth create space; a crowd around the ball kills it.
- **Shows:** everyone bunched round the ball, then wide players to the touchlines, forwards high, centre backs deep; the opponent has to stretch and a pass through the middle opens.
- **Alternative:** the report's "one player stays close for a short pass" is in the last text (the centre backs stay behind as support), not a branch.
- **A coach might question:** the bunched first picture is exaggerated on purpose, so the contrast is obvious.

### 2. Tee kolmio (5 steps) - `att.triangle`
- **Intent:** the ball holder needs two passing directions; a player hidden behind an opponent is not an option.
- **Shows:** both lanes blocked (dashed lines through the opponents), the midfielder and the wide player move into view, a triangle forms, the one defender between them can only close one pass, the ball goes round him.
- **Alternative:** none (the report's diamond is a 5v5 picture).
- **A coach might question:** the triangle is centre back - midfielder - wide player on the left; any three players would do.

### 3. Vilkaise olan yli (6 steps) - `att.scan`
- **Intent:** look before the ball arrives; what you see decides the first touch.
- **Shows:** the midfielder checks the opponent behind (dashed line). Branch A, "Tilaa takana: käänny": the opponent is far, receive and turn, play forward. Branch B, "Vastustaja selässä": the opponent is tight, play back first time to the free centre back and move again.
- **A coach might question:** there is no view-cone graphic in the engine; the glance is the dashed line between the two players. In branch B the ball goes to the other centre back, not back to the passer, because the passer is the one being pressed.

### 4. Kolme kahta vastaan (5 steps) - `att.3v2`
- **Intent:** Palloliitto's U10-U11 attacking target: with three against two, make a defender choose, then use the free player.
- **Shows:** the middle player dribbles at the defenders. Branch A: a defender steps out, pass to the free wide attacker, shot. Branch B, "Puolustajat seuraavat laitoja": the defenders go with the wide runners, so the carrier keeps going down the middle and shoots.
- **A coach might question:** the report's alternatives are "defenders split: through the middle / defenders narrow: go wide"; we show the same two reads. The shots end the branch without a "goal" step, to keep the idea on the decision.

### 5. Ohita ulkokautta (5 steps) - `att.overlap`
- **Intent:** a run round the outside makes a 2v1 on the wing; the run helps even when the runner does not get the ball.
- **Shows:** the forward holds the ball in front of a defender, the wide midfielder runs round the outside. Branch A: the defender stays on the ball, pass into the run. Branch B, "Puolustaja lähtee mukaan": the defender follows the runner, the carrier dribbles inside and shoots.
- **A coach might question:** the overlapping player is the wide midfielder, not a defender: in a 2-3-2 sending a centre back on an overlap leaves one player at the back. The underlap (the report's sibling) is left for later.

### 6. Vaihda puolta (6 steps) - `att.switch`
- **Intent:** when one side is crowded, the space is on the other side.
- **Shows:** left side blocked; back to the centre back, across to the other centre back, out to the free wide player (three short passes, "kun vastustaja painaa"). Branch B, "Onko aikaa? Yksi pitkä": nobody presses the centre back, so one long diagonal does the same.
- **A coach might question:** the long diagonal is a big kick for a 10-year-old; the last text says the short way is the safer one. The switch goes through the centre backs, not the keeper (both are fine; a keeper version could be a later concept).

### 7. Avaa peli maalivahdilta (5 steps) - `att.buildup-gk` + `att.split-cbs`
- **Intent:** start the attack safely: the centre backs split wide, so two opposing forwards cannot cover three players.
- **Shows:** keeper with the ball, centre backs run wide, 3v2 against their forwards, pass to the free one, he dribbles forward until someone comes ("one centre back steps in with the ball when not pressed", the report's alternative), then passes to the player that opponent left.
- **A coach might question:** the keeper has the ball in open play, so the concept does not depend on goal-kick or retreat-line rules (they vary by district and season). The centre backs go very wide, close to the touchlines; a coach who wants them at the corners of the penalty area can say so.

### 8. Pelaa prässin yli (4 steps) - alternative to 7
- **Intent:** when the opponent marks every short option, the space is behind their press.
- **Shows:** man-to-man press on our build-up, a forward comes towards the ball, a long pass from the keeper to him, the nearest players arrive for the lay-off.
- **A coach might question:** "play long" can sound like giving up on building. The cue is explicit (everyone near is marked), and the long ball is a pass to a player with support, not a clearance. The kick is about half the pitch.

### 9. Läpi, ympäri vai yli? (6 steps) - `att.through-around-over`
- **Intent:** there are three ways forward; the opponent's shape tells which one is open.
- **Shows:** three two-step branches, each with a different opponent picture: a gap in their midfield (through), a compact middle with free wings (around), a high back line with space behind (over).
- **A coach might question:** there is no shared first step; each branch's first picture IS the cue. Six steps is the top of the range for this age: it can be shown one branch at a time.

### 10. Heti takaisin! (4 steps) - `lose.win-back` + `lose.nearest-press`
- **Intent:** Palloliitto's "välitön reagointi": the second after losing the ball decides.
- **Shows:** our pass is cut out; the nearest player presses the ball at once, two others close the easy passes, the hurried pass goes to us.
- **A coach might question:** the regain is the happy ending; real counter-pressing fails often. The sibling concept (11) is the answer for when it cannot work.

### 11. Juokse maalin puolelle (4 steps) - alternative to 10 (`lose.recover`, with `lose.delay`)
- **Intent:** when the ball is far and nobody can press, run to get between the ball and our goal, not after the ball.
- **Shows:** the opponent gets the ball in space behind our midfield; our midfielders run straight towards our own goal, a centre back delays without diving in, then the nearest player can press with cover behind.
- **A coach might question:** the same name as the 5v5 concept on purpose (one name across formats). The midfielders cover the ground faster than the dribbler; the delaying centre back is what makes that believable.

### 12. Tiiviinä ja yhdessä (5 steps) - `def.compact` + `def.shift`
- **Intent:** small distances between us, and the whole block moves with the ball.
- **Shows:** stretched team with gaps, squeeze "like a fist", the opponent has to go wide, the block slides to the ball side with the nearest pressing, the ball is switched and the block slides back together.
- **A coach might question:** compactness and shifting are one concept here (the report pairs them): the fist that moves. The far-side wide opponent is left free on purpose; the text says nobody stays alone on the far side.

### 13. Paine, tuki, tasapaino (6 steps) - `def.press-cover-balance`
- **Intent:** the three nearest defenders each have a job.
- **Shows:** the roles one by one (1 pressure, 2 cover diagonally behind, 3 balance tucks in), then the proof: the dribbler gets past the presser on the outside and the cover wins the ball.
- **A coach might question:** the presser shows the dribbler outside, towards the touchline. A team that wants to steer inside into its cover can use the same picture and say so.

### 14. Riisto: hyökkää vai turvaa? (5 steps) - `win.counter` / `win.secure`
- **Intent:** after winning the ball, look forward first; go if there is space, keep the ball if there is not.
- **Shows:** a steal in midfield. Branch A, "Edessä on tilaa: hyökkää!": their defenders are split, pass into the run, shot. Branch B, "Edessä on ahdasta: turvaa": many opponents close and behind the ball, pass sideways out of the crowd to a free player.
- **A coach might question:** neither is the "right" one; the closing question asks how the player could tell.

## Left out on purpose

- The report's reserves: throw-in (rule-dependent), open body shape (needs a body-orientation graphic the engine does not have), rest defence.
- Underlap, third-man run, pressing triggers, block height: older age bands.
- English and Swedish texts: the collection is Finnish only for now (the collection NAME is translated). The format has one language per concept.
- A "base shape" concept: the shape is not the point of this collection.
