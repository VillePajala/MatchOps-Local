# Tactics View — Field Variations (Half/Quarter Field)

Status: Proposed (backlog)

Overview
- Allow coaches to switch the tactics view canvas between full field, half field, and quarter field layouts to sketch specific situations (e.g., corner routines, build-up in a quadrant).
- Toggle lives only in Tactics mode. Drawing and placement tools remain identical.

Rationale
- Coaches often want to focus on a smaller area to plan set pieces or constrained scenarios.
- Smaller canvases reduce visual noise and improve clarity in whiteboard sessions.

User Stories
- As a coach, I can choose Full / Half / Quarter field in tactics mode so I can focus on specific areas.
- As a coach, I can flip which half/quarter (e.g., left/right or top/bottom) to match my scenario.
- As a coach, I can export screenshots of the current tactics canvas showing the selected field layout.

UX Sketch
- Control in Field Tools (tactics mode only):
  - Field Layout: [ Full | 1/2 | 1/4 ]
  - When 1/2 or 1/4 is selected, show sub‑selector to choose the region:
    - Half: [ Left | Right ] or [ Top | Bottom ] depending on orientation
    - Quarter: [ TL | TR | BL | BR ]
- Visual cues:
  - Dimmed/clipped region outside the chosen area.
  - Center/penalty/box lines drawn correctly for the selected region.

Technical Notes
- Phase 1 (MVP):
  - Keep underlying coordinate system (0..1) and players unchanged.
  - Render‑time clipping: Only draw the selected sub‑region of the field and scale it to fill the canvas.
  - Drawing tools operate in local (clipped) space; map to global (0..1) for saved paths.
- Phase 2 (Enhanced):
  - Persist selected layout per game/session (optional).
  - Add export of tactics canvas with current layout.

Data Model Impact
- None required for Phase 1 (purely render‑time and transient UI state).
- Optional: Persist layout in app settings or per‑game metadata later.

Acceptance Criteria
- In Tactics mode, a Field Layout control appears.
- Selecting 1/2 or 1/4 scales and clips the canvas to the chosen region.
- Drawing/placement works identically within the shown region.
- Switching layout does not corrupt saved drawings/positions.
- Full layout restores the current full‑field rendering.

Open Questions
- Orientation awareness: Should we auto‑choose left/right based on home/away or attack direction?
- Per‑game vs. global preference: Save layout per session or globally?
- Mirroring: Quick toggle to mirror the chosen region.

Dependencies / Risks
- Canvas math for clipping and coordinate mapping.
- Screenshot/export alignment with the new clipping.

Next Steps
- Add UI control in Field Tools (tactics mode) — behind a feature flag.
- Implement render‑time clipping + coordinate mapping (Phase 1).
- Add a lightweight unit test for mapping and a visual regression snapshot of each layout.

