# Data Safety & Backup System — Planning Doc

**Status:** 🚧 Planning (DRAFT) · High priority (data loss is the worst outcome) · Not started
**Last updated:** 2026-06-25

> Coach data (seasons of games and stats) must be practically impossible to lose
> permanently, WITHOUT relying on the user to remember to back up. Almost every
> other bug is fixable; lost data is not. This plan makes loss recoverable.

---

## 0. Where we are today (baseline)

- **Cloud (Supabase prod):** FREE plan. **PITR disabled**, no user-restorable/downloadable
  DB backups. So an app bug that deletes/corrupts rows in prod has **no database-level
  undo**. Going Pro (~$25/mo, buys 7-day backups + PITR) is **not an option right now**
  (no revenue). Cloud-backup-as-a-paid-feature is a future possibility (see Layer 3).
- **Local backup/restore (`fullBackup.ts`):** Already **complete and well-hardened** -
  exports/restores all 10 data types, validates before clearing, snapshots + rolls back
  on write failure, guards concurrent restores, 55 tests. **But it only runs when the
  user clicks Export/Restore.** In a real loss event most users have no recent backup,
  and exported files are easy to lose track of.

The gap is therefore **not** missing code quality - it is **recoverability + adoption**.

---

## 1. The two jobs people call "backup"

| Job | Protects against | Mechanism | Same device? |
|-----|------------------|-----------|--------------|
| **A. Restore point** | app bugs, corruption, accidental "clear all" / bad restore | automatic rolling snapshots kept INSIDE the app | yes - same device only |
| **B. Off-device copy** | device loss, uninstall, storage eviction, stolen phone | a file/record that leaves the device | no |

A is the one we're missing and it's the higher-value one (covers the most likely loss
vectors with zero user effort). B is the only thing that survives losing the device, but
it requires the copy to actually leave - which is where "the user can't find the file" lives.

We build defense in depth: **Layer 1 (A), Layer 2 (B), Layer 3 (B in the cloud, paid).**

---

## 2. Layer 1 — Automatic local restore points (FREE, build first)

The big new thing. Zero user effort, reuses existing backup code.

**What:** on a cadence, capture a full snapshot (reuse `generateFullBackupJson(userId)`)
and store it in a **dedicated IndexedDB database** `matchops_backups_{userId}`, separate
from live data.

**Cadence (hybrid):**
- On app open, if the newest snapshot is older than ~24h, take one.
- Immediately BEFORE any bulk destructive op (restore-from-backup, clear-all-data) take
  a "pre-op" snapshot. (This is a belt-and-suspenders layer on top of the existing
  in-restore rollback.)

**Rotation:** keep the last 3-5, drop the oldest. Bounded storage: a full backup for 100
games is a few hundred KB to ~1-2 MB, so 5 snapshots is ~10 MB worst case (IndexedDB quota
is typically 50 MB+).

**Validate before storing:** run the existing `validateBackupData` before writing a
snapshot - never overwrite good snapshots with a corrupt one. Keeping N snapshots means an
older clean one survives even if the newest captured already-corrupt live data.

**Isolation (critical):** snapshots live in their OWN IndexedDB database so that:
- corruption of the live games blob (the H2 class) does NOT take the restore points with it;
- a normal `clearAllUserData()` (used by restore/import) does **NOT** delete restore points -
  that is the whole point of having them;
- BUT true **account deletion** (`deleteAccount`) MUST delete `matchops_backups_{userId}`
  too, for GDPR. (Get this distinction right or you either leak data or destroy the net.)

**Durability:** call `navigator.storage.persist()` once to request persistent storage -
this materially reduces the chance the browser evicts IndexedDB under storage pressure.
Cheap, one-time, big durability win.

**Restore UI:** Settings → "Restore points" → list snapshots by date/time with a one-line
summary (e.g. "12 Jun 14:03 - 48 games, 22 players") → tap → confirm → feed the stored JSON
string straight into the existing `importFullBackup`. **No file handling at all.**

> Layer 1 alone neutralizes the catastrophic, silent bug classes (a save wipes games; a bad
> restore; an accidental clear) for free, with zero user diligence. Highest value piece.

**Limitation:** same device only. Uninstall / device loss / eviction / lost phone are NOT
covered - that is Layers 2 and 3.

---

## 3. Layer 2 — Off-device copy, made easy + nudged (FREE, build second)

Fixes the "export goes somewhere and I can't find it" problem and the "I forgot to back up"
problem.

**Solve file-finding with the Web Share API:** when `navigator.canShare({ files })` is
available (mobile, including the Android TWA), trigger the **native share sheet** instead of
a silent download. The user picks Google Drive / Files / email / etc. - the copy lands
somewhere they chose and can find. Fall back to the current download on desktop / unsupported
browsers. (Optional desktop nicety: `showSaveFilePicker` to choose location / re-save.)

**Solve adoption with a gentle reminder:** track the timestamp of the last *off-device*
export. If it is older than ~30 days, show a dismissible banner: "Your last off-device
backup was 30 days ago. Save one now?" → one tap → share sheet. Non-nagging, easy to act on.

---

## 4. Layer 3 — Cloud backup (FUTURE, natural PAID tier)

This is the answer to "pay a little to keep cloud data safe," and it can work on the **FREE
Supabase plan** - no Pro/PITR needed.

**How:** store periodic snapshots as rows in a new `user_backups` table (one or a few rows
per user, a JSON blob + timestamp, RLS-scoped to the user). This is just normal app data, so
it needs no special backup product. It gives **app-level point-in-time recovery** against the
realistic loss vector: app logic deleting or corrupting the user's live rows. Snapshots are
tiny; the free 500 MB DB holds plenty.

**Why it's the paid feature:** it's an ongoing managed service (server storage + automatic
upload), and the billing infrastructure already exists in the app (currently parked,
`PREMIUM_ENFORCEMENT_ENABLED = false`). A low-cost "Data Safe" tier that auto-keeps an
off-device cloud copy is a clean, honest thing to charge a small amount for - and it directly
funds the Supabase costs you were worried about.

**Caveat:** snapshots in the same Supabase project do NOT protect against a whole-project
catastrophe. For true off-Supabase durability, a later enhancement can also push snapshots to
an external object store. Not needed for v1 of the tier.

---

## 5. Build order & decisions

1. **Layer 1** (automatic local restore points + persistent-storage request + restore UI).
   Biggest risk reduction, free, reuses `generateFullBackupJson` / `importFullBackup`.
2. **Layer 2** (Web Share export + reminder nudge). Cheap UX win; makes the off-device copy
   real.
3. **Layer 3** (cloud snapshot table) - when/if monetizing; gate behind a small paid tier.

**Decisions (locked 2026-06-25):**
- **Cadence:** snapshot on app open when the newest is >24h old, PLUS one right before any
  destructive op (restore / clear-all).
- **Retention:** keep the last **5** restore points, rotate out the oldest.
- **Visibility:** silent, with a small "Last auto-backup: Xh ago" status line + the
  restore-points list in Settings (no nagging, but visible for trust).
- **Layer 2 reminder:** dismissible banner when the last *off-device* export is >30 days old.

**Still open (Layer 3 only, deferred):**
- Free vs paid split for Layer 3 (is a single most-recent cloud snapshot free, with history
  paid? or all of Layer 3 paid?).

---

## 6. Why not just go Supabase Pro

Pro (~$25/mo) is the clean fix for cloud-side recovery but is off the table without revenue.
Layers 1-2 give strong, free protection against the most likely loss vectors (bugs,
corruption, accidental clears, and - via off-device copy - device loss). Layer 3 then becomes
the thing that *earns* the money to eventually afford proper cloud durability, rather than a
cost you carry up front.
