# PEPO 8v8 Pelitapa: intent review and decision log

Second pass (intent, not representation). Companion file: `pepo-8v8.json` in this folder (16 concepts, 103 steps; 15 existing + 1 new, `kaanto`).

Source: "PEPO 8v8 Pelitapa" v1.0, 55 pages. Pages 22, 23, 37, 38 and 41 are black video frames and could not be reviewed; 40, 48, 49, 51, 52 are video stills.

## How the file was checked

- It passes the app's own `validateConcept`: 16 concepts, 0 invalid, unique ids.
- A separate script checked every step for: disc spacing (own-own 5.8, own-opponent 5.1, opponent-opponent 4.4), positions inside the lines, pass and shot lanes clear of other players, offside at the moment of each pass, moving players not passing through standing ones (curved runs followed along the arrow's bend), pass/shot/dribble arrows starting from the ball holder, and at most 4 arrows per step. One deliberate exception remains: the recap step of `vaihtoehdot` has 5 arrows.
- Not checked during the review: how it looks on a tablet; the review checks are geometric. (Rendered afterwards in focus mode at 820x1180 when the file landed in the repo.)
- Engine assumption, as instructed: a player follows the curved path of his run arrow. All bends are within ±0.2.

## Conventions used in the redesign

- Vocabulary follows the PDF: toppari, alempi/ylempi kk, laitapelaaja, kärki. Sentences are short, one idea per step.
- An arrow shows what is about to happen; the next step shows it done.
- Opponents react in every step where a real opponent would; defenders stay goal-side until beaten.
- Sides follow the PDF diagrams (the press trap is on our left, the lost pass in `vetaytyminen` on our right).
- Our goalkeeper stands where the PDF puts him (about 77-80 when we are high, p25, p42).
- Long movements carry `durationMs` (1100-1800).
- Closing questions: the PDF's "Kysymyksiä" slides (p21, p36, p39, p47, p50) each precede a video clip and ask about that clip. The prototype reused them as concept questions. Kept where they fit the animation, rewritten where they pointed at something the animation does not show.

## Errors, ambiguities and inconsistencies found in the PDF

| # | Page | What | Most likely meaning / what I did |
|---|---|---|---|
| 1 | p4-5 vs p4, p7 text | Diagrams put 4, 7 and 8 in one vertical line; the text demands diagonal positioning. | Diagram is a simplification. `perusmuoto` starts in the drawn line and then moves to the diagonal, so the step teaches the difference. |
| 2 | p6 | The three principles are numbered "1., 1., 1."; the text refers to "3. periaate". | Numbering typo; 1, 2, 3 intended. |
| 3 | p7 vs p8 | 4 is left and low, 7 right and high on p7; on p8 they are swapped (7 left in the pocket, 4 right). | Not an error if read with p13 ("topparin kuljettaessa liiku poispäin pallosta"): 4 moves away from the ball, 7 comes into the pocket. Used that reading in `vaihtoehdot`, `kuljetus`. |
| 4 | p7 | The opposing goalkeeper is drawn far outside his goal (about 23 % up the pitch), no one in goal. | Drawing slip. Opponent keeper placed in goal. |
| 5 | p8-9 | Option 6 text says "tyhjään tilaan / selustaan ... kun vastustajan puolustusmuoto on korkealla", but the zones are drawn on both wings at the halfway line, beside the opponent's midfield, not behind its last line. | "Selusta" here means the space behind the players who have come to press. `pitka` now sends the ball to the wide zone the PDF marks. **Owner decision A.** |
| 6 | p8 | Passes 1-3 start from the dribble path, 4-5 from the centre back's original spot. | Intended: sideways/back options are there before dribbling, forward options open up while dribbling. Kept static in `vaihtoehdot`; the dribble is taught in `kuljetus`. |
| 7 | p17-18 | The text describes three options of the wide player on the ball. The diagram shows the moment before: a midfielder has the ball and passes into the wide player's run. Zone "3" is where he receives, not where the dribble goes, and the cross starts from zone 3. | Diagram numbers zones, text numbers options. `laita` now starts with the pass into the run (as drawn) and then shows the three options (as written). |
| 8 | p16 vs p19-20 | p16 says the goal is to create the chance in the zone in front of goal; the p19/p20 diagrams show the central breakthrough at the halfway line against a high line. | Models are the same anywhere; kept `keski` in the final third so it ends in a finish. **Owner decision B.** |
| 9 | p19 | Labels are misplaced: "4." sits by the ball carrier's off-ball run (which belongs to the wall pass, 5), the dribble squiggle has no number, option 2 has a run but no pass arrow. | Followed the text list 1-5. |
| 10 | p25 | Text: the shape "laskee riittävän alas" so the opponent dares to play short. Diagram: our striker is 8 % of the pitch from their centre backs, at the edge of their box. | How deep is a coaching choice the PDF leaves open. Used the diagram's heights (compact, fairly high). **Owner decision C.** |
| 11 | p25/p27 vs p31 | Our goalkeeper is high (about 77 %) on p25-29 and on his goal line on p31. | p31 is a drawing slip; p25 text says he is high. |
| 12 | p27 | The striker's arrow goes straight at the receiving centre back, but the text says he must block the centre back to centre back pass and steer play wide. | A straight run does not block that pass. Kept the curved run (prototype invention, football-correct). |
| 13 | p31 | The last line ("... alivoimatilanteessa → peitetään ja hidastetaan") is cut off by the slide edge. | Text reconstructed from the visible part; used as the last step of `triggerit`. |
| 14 | p31 | Trigger 6 refers to "dia 42"; the immediate press is on slide 43. | Cross-reference off by one. |
| 15 | p32 | Text says wide players and midfielders "tiivistävät lähelle palloa"; the diagram leaves the wide players out wide. | Followed the text (they come in for the second ball). |
| 16 | p33 | The text's example (centre back steps out forward, the other covers, lower midfielder drops) is not what the diagram shows (ball wide, wide player presses, centre backs stay central). The diagram shows the "Huom!" bullet instead. | Both are real intents. `omaalue` now has two parts: the diagram (wide), then the text example (centre). |
| 17 | p43 | The ball is drawn at our player's feet while the opponent next to him has the dribble squiggle; the title says we have just lost it. | Opponent has the ball. |
| 18 | p45 | A solid red arrow runs from our midfielder to where the opponent has the ball; unexplained. The footnote speaks of the opponent being in the majority, but in the diagram we have seven players behind the ball against five. | Red arrow = our pass that was intercepted. Main text covers the general case "press not on, so retreat"; numerical inferiority is one sub-case. `vetaytyminen` redrawn that way. **Owner decision D.** |
| 19 | p21, 36, 39, 47, 50 | Question slides belong to video clips, not to the diagrams. | See "Closing questions" above. |

## Per concept

### 1. `perusmuoto` (p4-5)
- **Intent:** know your number and place in 2-1-3-1; fill the pitch wide and deep; many players in the centre lane; stand on different lanes so passes go diagonally; everyone, the goalkeeper too, has a job.
- **PDF says:** system and reasons (p4), positions and numbers (p5).
- **PDF issue:** #1.
- **Inventions:** line bands (keep), centre-lane rectangle (keep), goalkeeper triangle (keep).
- **Redesign:** starts in the p5 picture (was the goal-kick shape with centre backs in the box). Step 4 now visibly moves 4, 7 and 8 off the line. Texts shortened. New question.
- **Earlier findings:** deep start, jitter of 8, invisible diagonal step: all resolved.

### 2. `avaus` (p7, p10-15)
- **Intent:** at a goal kick everyone takes a place that gives the ball carrier an option: centre backs into the box, wide players to the touchline, striker high, lower midfielder into the triangle, upper midfielder a line higher and diagonal.
- **PDF issue:** #3, #4.
- **Inventions:** "from defensive shape to opening shape" (keep, it shows why we spread); opponents following the wide players (keep, it is what "venyttää" means); the cross-reference to `vaihtoehdot` (keep).
- **Redesign:** one group per step instead of seven players at once: centre backs, then wide players and striker, then the two midfielders, then the pass. The upper midfielder no longer runs into his marker. The striker stands on the centre back's blind shoulder, level, not behind the line. Question: kept the half that fits, replaced "mitä keskikenttäpelaajat voisivat tehdä paremmin" (it refers to a video).
- **Earlier findings:** 7 into a4, 8 offside, missing arrows: resolved.

### 3. `vaihtoehdot` (p8-9)
- **Intent:** the centre back reads the opponent's shape and press height and picks one of six passes (or dribbles); the question is always "kenellä on etu?".
- **PDF issue:** #5, #6.
- **Inventions:** recap step (keep); "maalivahti on avaamisen kolmas pelaaja" (moved to `perusmuoto`).
- **Redesign:** stays a static menu like the PDF picture. Each option now says when to use it. Pocket zone added for option 2. Long-ball zones moved to where the PDF draws them. Positions adjusted so every lane is clear.
- **Kept deliberately:** recap step has 5 arrows plus two zones (PDF picture).
- **Earlier findings:** was OK; the unrealised dribble arrow stays (taught in `kuljetus`).

### 4. `kuljetus` (p8 bullet, p11, p13)
- **Intent:** dribble into free space to make an opponent choose; when he comes, the player behind him is free; pass at that moment. If nobody comes, keep going.
- **PDF says:** one bullet (p8) plus quality factors (p11, p13). No diagram.
- **Inventions:** the whole sequence. The old one continued through the pocket to a striker run ("three lines"), which buried the dribble idea.
- **Redesign:** two readings of the same dribble. A: the opposing wide player jumps, pass to our free wide player. B (cut): nobody comes, dribble on past the first line, their midfielder steps out, pass into the pocket. The opposing striker now chases instead of standing still.
- **Earlier findings:** passive a8, 22-unit run through a4, striker offside: resolved (the last two by removal).

### 5. `pitka` (p8-9 option 6)
- **Intent:** when the opponent presses high and short passes are closed, play over them into space; aim for 2v1 or 1v1 on a big area.
- **PDF issue:** #5.
- **Inventions:** the 2v1 and finish (keep; the PDF names 2v1 as the aim); the pizza quote (keep, shortened to its second half; it is from p15).
- **Redesign:** the pressed centre back kicks (the PDF lists it under his options; was the goalkeeper), to the wide zone the PDF marks. The remaining defender is goal-side, the wide player dribbles at him, passes when he commits, the striker scores.
- **Earlier findings:** "wrong" (defender behind the attackers, then overtaking): resolved by redesign.

### 6. `laita` (p16-18)
- **Intent:** get the wide player to the byline zone at speed; then cross between the last line and the goal (striker near post, far wide player back post, upper midfielder in front of the line), or cut back in front of the line when the cross is covered, or beat the defender.
- **PDF issue:** #7.
- **Inventions:** the finishes (keep); an early cross from deep (dropped).
- **Redesign:** new first step: pass into the run (as drawn). Overview step with the p16 scoring zone. Each option then plays out with its own reason: cross (free), cut-back (defender covers the cross and the line has dropped), take-on (one defender, goal-side, beaten on the outside).
- **Earlier findings:** option 3 defender behind the winger, glide through a6, mismatched cross targets, shot through a2: resolved.

### 7. `keski` (p19-20)
- **Intent:** five tools to break the last line through the middle; runs start at the moment of the pass; the pass goes when the receiver has most space.
- **PDF issue:** #8, #9.
- **Inventions:** the finishing steps (keep); "juoksu lähti vasta syötön hetkellä" (keep, p20 "vältä paitsio").
- **Redesign:** same 12 steps, corrected. The gap between the centre backs is wider and all runs go through its middle. Option 3 now shows why the back pass happens (their midfielder presses) and names the roles correctly (support player = wall, striker = third). Option 4 has a defender who is actually beaten, and the striker moves aside to give room (p20). Option 5's return pass goes behind the line.
- **Earlier findings:** shots at the keeper, arc through a3, wrong "kolmas pelaaja", unbeaten defender, shot through a2, static a5: resolved.

### 8. `prassi` (p24-29, p31 trigger 5)
- **Intent:** let them play short, then steer to one side as a compact block and win the ball in the trap near their goal.
- **PDF issue:** #10, #11, #12.
- **Inventions:** the curved striker run (keep); the win at the end (keep).
- **Redesign:** PDF side (our left) and PDF heights. Opponent in the p27 shape (two midfielders). The upper midfielder stands on the pass lane into the middle. Steps 3-5 are titled with the three T's of p29 (tiiviinä, tunnista, täysillä), so that slide is taught here without a separate concept.
- **Earlier findings:** mirrored, press arc over a4, 7 in no lane, 2 on top of a8, deep start: resolved.

### 9. `triggerit` (p30-31)
- **Intent:** know the signals for going to win the ball, and that without a signal you cover and delay.
- **Inventions:** the three mini-scenes (keep); the text pointing triggers 4 and 5 to `prassi` (changed: 4 was not shown there).
- **Redesign:** triggers 1-4 each get a scene; trigger 4 (no support) is new. One step points 5 and 6 to their concepts. New last step from p31: no signal, do not rush. Trigger 3 uses the lower midfielder on their midfielder (the old pass ran through our own player, who had been moved aside to hide it).
- **Earlier findings:** invisible 1.8-unit sprint, wrong reference, missing caveat: resolved.

### 10. `pitkapuol` (p32)
- **Intent:** if they kick long, drop so the ball cannot fly over the centre backs; the lower midfielder attacks the first ball; many players around for the second ball; goalkeeper high.
- **PDF issue:** #15.
- **Redesign:** seven arrows in one step split into two steps (back three first, then wide players and upper midfielder with the kick). New last step: the second ball is actually won.
- **Earlier findings:** was OK; arrow clutter resolved.

### 11. `omaalue` (p33)
- **Intent:** near our goal, close the middle and steer wide; centre backs stay central; when one steps out, the others close the gap.
- **PDF issue:** #16.
- **Inventions:** the striker's channel run that pulled the centre back out (dropped: it contradicted the step before it, where the wide player had "closed the inside").
- **Redesign:** part 1 is the diagram: ball wide, wide player delays and steers, a midfielder (not a centre back) comes to help, 2v1 at the touchline. Part 2 (cut) is the text example: pass into their striker's feet, centre back steps out, the other tucks in, lower midfielder drops.
- **Earlier findings:** a8 gliding through 4 and the cause-effect contradiction: resolved.

### 12. `tvplus` (p34-35)
- **Intent:** after winning the ball: 1 forward at once while they are disorganised, 2 if not possible keep it and leave the area, 3 near our own goal get it out of danger.
- **Inventions:** the 3v2 (keep, fixed); the combined question (shortened).
- **Redesign:** their wide players start beyond ours, so they really are left behind. The two centre backs are goal-side, one commits, the pass goes to the free wide player. Principle 2 shows the counter-press that makes the back pass necessary and then a switch. Principle 3 is new (one step).
- **Earlier findings:** "wrong" (false 3v2, defenders behind the ball): resolved. Missing principle 3: added.

### 13. `tvmprassi` (p43-44)
- **Intent:** lose the ball where we have numbers, press within seconds: nearest on the ball, the others close the passes, the rest come closer.
- **PDF issue:** #17.
- **Inventions:** the "balance is ready" opening step (dropped: it belongs to `riski`).
- **Redesign:** moved to the left wing, as on p43, where the touchline helps. Opening step counts the players near the ball (4 against 2), which is the PDF's condition for pressing. Dashed links show who closes which pass (the p43 circles).
- **Earlier findings:** overlapping 7 and a4, free forward pass to a7, keeper too high: resolved.

### 14. `vetaytyminen` (p45-46)
- **Intent:** when the press is not on, do not rush; recognise the dangerous area and players, drop and narrow, protect the space behind, see ball and man, beaten players chase back.
- **PDF issue:** #18.
- **Inventions:** the "4 v 3 overload" drama with three opponents sprinting in behind (changed to the PDF's picture).
- **Redesign:** our pass to the striker is intercepted on the right, the interceptor has space, nobody is close. Step 2 names the dangerous area and players. Step 3 shows only our four retreat arrows. Step 4 shows the defender's triangle (p46). Step 5: progress stopped, press possible again.
- **Earlier findings:** eight arrows in one step, 29-unit moves in 0.9 s, mirrored side, keeper too high: resolved.

### 15. `riski` (p42)
- **Intent:** while attacking, some players already prepare for losing the ball; the score decides how many join the attack.
- **Redesign:** PDF picture positions (ball at the halfway area, keeper at 80). Step 1 is only the cover behind the ball; step 2 the choice; steps 3 and 4 the two answers, each with a zone that counts who is behind the ball.
- **Earlier findings:** 4 landing on a4, keeper too high: resolved.

### 16. `kaanto` (NEW; p8-9 options 4-5, p10, p11, p4)
- **Why:** the PDF stresses the goalkeeper's role in opening play (p4) and the far centre back's movement to enable a switch (p11), but the existing concepts only list "pass to the goalkeeper" as a static arrow.
- **Content:** ball side is crowded; pass to the goalkeeper while the far centre back widens; goalkeeper switches; the centre back carries forward; their wide player comes out, ours is free.
- **Owner decision E:** keep or drop.

## Considered and not added

- "Kolme T:tä" (p29) as its own concept: folded into `prassi` step titles instead.
- Role cards (p10-15) and set pieces (p53): text-only pages; better as plain text than as animations.

## Landing in the repo

- The app's `lintConcept` (stricter than the review script for own-opponent spacing: 5.4 instead of 5.1) flagged three near-touching pairs. Each was fixed by moving the opponent half a unit sideways, nothing else changed: `keski` step 12 a2 to [27.5, 17]; `tvplus` step 8 a8 to [35.5, 84]; `tvmprassi` a4 starts at [25.5, 22].
- A focus-mode render at 820x1180 (pitka, tvplus, laita, vetaytyminen) showed players moving THROUGH each other during a step change (two movers crossing; the review script only checked movers against standing players). Fixed with small changes, intent unchanged:
  - `laita` step 4: the right winger's run to the back post curves outside his marker (bend 0.2), the marker a6 tracks to [46, 22] instead of into the runner, a3 steps to [38, 13]; the striker's near-post run curves the other way (bend -0.1) to stay clear of a3. Step 8: the striker finishes at [32, 9.8] (run arrow matches), a3 at [39, 12], a5 at [15.5, 12.5], so nobody sits on the scorer or the keeper.
  - `vetaytyminen` step 4: the left winger drops to [20, 58] on a curved run (bend 0.2) around his opponent, who goes to [18, 50] instead of crossing his path.
  - `tvplus` step 2: the player who lost the ball (a4) steps away to [30, 54.5] instead of walking through our presser. Step 8 (danger in front of our goal): a8 [34.5, 85.5], 3 [41, 89], 2 [27.5, 86.5] so the crowd stays readable; a7 [42, 77] and a3 [45, 44] so the long ball and the run no longer cross opponents.
  - `pitka` step 2: a8 closes to [42, 84.5] instead of sitting on our centre-back.
- Focus mode used to draw discs about 25% larger than the sizes `lintConcept` assumes, so 37 pairs that passed the lint touched on a tablet. Fixed in the engine: the board and the lint now share one disc size (`DISC_RADIUS_RATIO` in `src/pelitapa/types.ts`), and no pair touches at rest any more. That also showed one more crossing: in `avaus` step 4 the opponent a7 now steps to [26, 67] instead of walking through the dropping midfielder.
- `tvplus` step 8: the "Vaarallinen alue" ellipse moved down to the box (cy 92, ry 8) so its label sits in free grass; the keeper stands on his line at [34, 97] and 3 at [42, 88.5] to keep the label clear. Same problem in `vetaytyminen` steps 4-5: their striker a8 stands at [37, 68], just below the "Vaarallinen alue" label instead of on it.
- The only remaining lint warning is the 5-arrow recap step of `vaihtoehdot`, allowed by name in `src/pelitapa/__tests__/playbookContent.test.ts` (`ALLOWED_LINT_WARNINGS`). Any other warning fails the test.
