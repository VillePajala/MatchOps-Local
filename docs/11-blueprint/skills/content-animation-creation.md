# Football Skills Animation Engine — Technical Specification

## Overview

A code-driven animation system that renders football (soccer) skill exercises from structured data definitions. The engine takes a skill exercise defined as a JSON data model and produces a smooth, step-by-step animated 2D demonstration suitable for youth players (ages 6–15).

This is NOT a video player or video library. Each animation is deterministically generated at runtime from data — no pre-rendered video assets required. The system should be embeddable as a React component within a larger application.

---

## Core Concept

A skill exercise is defined as a sequence of **frames** (keyframes). Each frame describes the positions and states of all entities on the field (player body, feet, ball, cones, movement paths). The engine interpolates between keyframes to produce smooth animation. Think of it as a football-specific declarative animation format.

---

## Visual Style

- **View**: Top-down (bird's eye) as primary view. Optional side-view for techniques where vertical movement matters (e.g., juggling, chest control, headers).
- **Aesthetic**: Clean, minimal, diagram-like. Similar to a tactical board but animated. Not photorealistic.
- **Player representation**: Simplified body shape — oval/pill for torso, circle for head, clearly differentiated left foot (one color) and right foot (another color). Directional indicator showing which way the player faces.
- **Ball**: Circle with distinct color, subtle shadow to indicate height when airborne.
- **Field surface**: Flat green or neutral background with subtle grid for spatial reference.
- **Equipment**: Cones shown as triangles, goals as rectangles, markers as dots.
- **Color scheme**: Configurable via theme object, with sensible defaults. High contrast for accessibility.

---

## Data Model

### SkillExercise (top-level object)

```typescript
interface SkillExercise {
  id: string;
  name: string;
  category: SkillCategory;
  subcategory: string;
  difficulty: 1 | 2 | 3 | 4 | 5;
  ageGroups: AgeGroup[];
  description: string;
  coachingPoints: string[];          // Key teaching points displayed as overlay
  
  // Canvas setup
  fieldSetup: FieldSetup;
  
  // Entities present in this exercise
  entities: Entity[];
  
  // The animation sequence
  sequence: AnimationSequence;
  
  // Looping behavior
  loop: boolean;
  loopDelay: number;                 // ms pause before restarting
}

type SkillCategory = 
  | "ball_mastery"
  | "dribbling"
  | "passing"
  | "receiving"
  | "shooting"
  | "turning"
  | "1v1_moves"
  | "juggling"
  | "heading"
  | "defending";

type AgeGroup = "U6" | "U8" | "U10" | "U12" | "U14";
```

### FieldSetup

```typescript
interface FieldSetup {
  width: number;                     // Logical units (not pixels)
  height: number;
  view: "top_down" | "side";
  showGrid: boolean;
  gridSpacing: number;               // In logical units
  equipment: EquipmentItem[];        // Static equipment placed on field
}

interface EquipmentItem {
  type: "cone" | "goal" | "marker" | "pole" | "wall" | "ladder_rung";
  id: string;
  position: Position;
  rotation?: number;                 // Degrees
  dimensions?: { width: number; height: number };
}

interface Position {
  x: number;
  y: number;
}
```

### Entity (moveable objects)

```typescript
interface Entity {
  id: string;
  type: "player" | "ball";
  initialState: EntityState;
}

interface EntityState {
  position: Position;
  rotation: number;                  // Degrees, direction entity faces
  
  // Player-specific
  leftFoot?: FootState;
  rightFoot?: FootState;
  bodyPosture?: "standing" | "leaning_left" | "leaning_right" | "low" | "jumping";
  activeFoot?: "left" | "right";     // Which foot is performing the action (highlighted)
  
  // Ball-specific  
  height?: number;                   // 0 = ground, used for aerial skills
  spin?: "none" | "topspin" | "backspin" | "sidespin_left" | "sidespin_right";
  speed?: number;                    // Visual indicator (motion blur intensity)
}

interface FootState {
  offset: Position;                  // Relative to player center
  contactSurface?: "inside" | "outside" | "sole" | "laces" | "toe" | "heel";
  action?: "plant" | "touch" | "drag" | "push" | "strike" | "receive" | "idle";
}
```

### AnimationSequence

```typescript
interface AnimationSequence {
  totalDuration: number;             // Total duration in ms
  phases: Phase[];                   // Named phases of the exercise
}

interface Phase {
  name: string;                      // e.g., "Setup", "Approach", "Touch", "Follow Through"
  startTime: number;                 // ms from sequence start
  duration: number;
  showLabel: boolean;                // Display phase name as overlay
  keyframes: Keyframe[];
}

interface Keyframe {
  time: number;                      // ms relative to phase start
  entityId: string;                  // Which entity this keyframe applies to
  state: Partial<EntityState>;       // Only include properties that change
  easing: EasingFunction;
  
  // Visual effects at this keyframe
  effects?: KeyframeEffect[];
}

type EasingFunction = 
  | "linear"
  | "ease_in"
  | "ease_out"
  | "ease_in_out"
  | "snap"                           // Near-instant transition (for quick touches)
  | "bounce";                        // For ball bouncing

interface KeyframeEffect {
  type: "trail" | "highlight_foot" | "arrow" | "ripple" | "ghost";
  // trail: Shows movement path behind entity
  // highlight_foot: Pulses the active foot
  // arrow: Shows direction arrow
  // ripple: Impact effect at ball contact point
  // ghost: Shows faded previous position (for showing the "before")
  
  duration: number;
  color?: string;
}
```

### Movement Paths (for complex dribbling patterns)

```typescript
interface MovementPath {
  entityId: string;
  pathType: "linear" | "bezier" | "arc";
  controlPoints: Position[];         // Bezier control points
  startTime: number;
  duration: number;
  showTrail: boolean;                // Render dotted line showing path
  trailColor?: string;
}
```

---

## Animation Engine Interface

### React Component API

```typescript
interface SkillAnimationProps {
  exercise: SkillExercise;
  
  // Display
  width: number;                     // Container width in px
  height: number;                    // Container height in px
  theme?: ThemeConfig;
  
  // Playback control
  autoPlay?: boolean;
  playbackSpeed?: number;            // 0.25 to 2.0, default 1.0
  
  // Callbacks
  onPhaseChange?: (phase: Phase) => void;
  onComplete?: () => void;
  
  // Coaching overlay
  showCoachingPoints?: boolean;      // Display coaching points during relevant phases
  showPhaseLabels?: boolean;
}

// Imperative handle for external control
interface SkillAnimationHandle {
  play: () => void;
  pause: () => void;
  reset: () => void;
  seekToPhase: (phaseName: string) => void;
  setSpeed: (speed: number) => void;
  getCurrentPhase: () => string;
  getProgress: () => number;         // 0.0 to 1.0
}
```

### Usage Example

```tsx
import { SkillAnimation } from './engine/SkillAnimation';
import { insidFootPass } from './exercises/passing';

function SkillViewer() {
  const animRef = useRef<SkillAnimationHandle>(null);
  
  return (
    <div>
      <SkillAnimation
        ref={animRef}
        exercise={insideFootPass}
        width={400}
        height={400}
        autoPlay={true}
        showCoachingPoints={true}
        playbackSpeed={0.75}
        onPhaseChange={(phase) => console.log("Phase:", phase.name)}
      />
      <div className="controls">
        <button onClick={() => animRef.current?.play()}>Play</button>
        <button onClick={() => animRef.current?.pause()}>Pause</button>
        <button onClick={() => animRef.current?.reset()}>Reset</button>
        <button onClick={() => animRef.current?.setSpeed(0.5)}>Slow</button>
      </div>
    </div>
  );
}
```

---

## Rendering Implementation

### Technology

- **Canvas**: Use HTML5 Canvas via a React wrapper (or SVG for simpler exercises)
- **Recommendation**: Canvas for performance, especially on mobile. Use `requestAnimationFrame` loop.
- **Scaling**: All positions in logical units, scale to pixel space based on container dimensions. This ensures exercises look correct at any resolution.

### Rendering Pipeline (per frame)

```
1. Calculate current time position in sequence
2. Determine active phase
3. For each entity:
   a. Find surrounding keyframes (before and after current time)
   b. Interpolate entity state using specified easing
   c. Apply movement path if active
4. Render layers (back to front):
   a. Field background + grid
   b. Equipment (cones, goals, markers)
   c. Movement trails + path indicators
   d. Ball shadow (if ball is airborne)
   e. Player body
   f. Ball
   g. Visual effects (arrows, highlights, ripples)
   h. Phase label overlay
   i. Coaching points overlay
5. Request next frame
```

### Interpolation

```typescript
function interpolateState(
  fromState: EntityState,
  toState: Partial<EntityState>,
  progress: number,              // 0.0 to 1.0
  easing: EasingFunction
): EntityState {
  const easedProgress = applyEasing(progress, easing);
  
  return {
    position: {
      x: lerp(fromState.position.x, toState.position?.x ?? fromState.position.x, easedProgress),
      y: lerp(fromState.position.y, toState.position?.y ?? fromState.position.y, easedProgress),
    },
    rotation: lerpAngle(fromState.rotation, toState.rotation ?? fromState.rotation, easedProgress),
    // ... interpolate all numeric properties
    // Discrete properties (bodyPosture, contactSurface, action) snap at progress > 0.5
  };
}
```

---

## Example Exercise Definition

### Inside Foot Pass (Basic)

```json
{
  "id": "passing-inside-foot-basic",
  "name": "Inside Foot Pass",
  "category": "passing",
  "subcategory": "inside_foot",
  "difficulty": 1,
  "ageGroups": ["U6", "U8", "U10"],
  "description": "Basic inside foot pass technique. Plant foot beside ball, open hips, strike with inside of foot through the center of the ball.",
  "coachingPoints": [
    "Plant foot next to the ball, pointing at target",
    "Open hips toward target",
    "Lock ankle, strike through center of ball",
    "Follow through toward target"
  ],
  "loop": true,
  "loopDelay": 1500,

  "fieldSetup": {
    "width": 200,
    "height": 200,
    "view": "top_down",
    "showGrid": true,
    "gridSpacing": 20,
    "equipment": [
      {
        "type": "cone",
        "id": "target",
        "position": { "x": 100, "y": 30 },
        "rotation": 0
      }
    ]
  },

  "entities": [
    {
      "id": "player",
      "type": "player",
      "initialState": {
        "position": { "x": 100, "y": 150 },
        "rotation": 0,
        "leftFoot": { "offset": { "x": -8, "y": 0 }, "action": "idle" },
        "rightFoot": { "offset": { "x": 8, "y": 0 }, "action": "idle" },
        "bodyPosture": "standing",
        "activeFoot": "right"
      }
    },
    {
      "id": "ball",
      "type": "ball",
      "initialState": {
        "position": { "x": 100, "y": 140 },
        "rotation": 0,
        "height": 0,
        "speed": 0
      }
    }
  ],

  "sequence": {
    "totalDuration": 3000,
    "phases": [
      {
        "name": "Approach",
        "startTime": 0,
        "duration": 800,
        "showLabel": true,
        "keyframes": [
          {
            "time": 0,
            "entityId": "player",
            "state": {
              "position": { "x": 100, "y": 150 }
            },
            "easing": "linear"
          },
          {
            "time": 800,
            "entityId": "player",
            "state": {
              "position": { "x": 100, "y": 143 },
              "leftFoot": { "offset": { "x": -8, "y": -5 }, "action": "plant", "contactSurface": "sole" },
              "bodyPosture": "standing"
            },
            "easing": "ease_out"
          }
        ]
      },
      {
        "name": "Plant & Open Hips",
        "startTime": 800,
        "duration": 500,
        "showLabel": true,
        "keyframes": [
          {
            "time": 0,
            "entityId": "player",
            "state": {
              "leftFoot": { "offset": { "x": -10, "y": -3 }, "action": "plant" },
              "rightFoot": { "offset": { "x": 12, "y": 3 }, "action": "idle" },
              "rotation": -15
            },
            "easing": "ease_in_out"
          },
          {
            "time": 500,
            "entityId": "player",
            "state": {
              "rightFoot": { "offset": { "x": 10, "y": -8 }, "action": "strike", "contactSurface": "inside" },
              "rotation": -10
            },
            "easing": "ease_in",
            "effects": [
              { "type": "highlight_foot", "duration": 500 }
            ]
          }
        ]
      },
      {
        "name": "Strike",
        "startTime": 1300,
        "duration": 300,
        "showLabel": true,
        "keyframes": [
          {
            "time": 0,
            "entityId": "player",
            "state": {
              "rightFoot": { "offset": { "x": 5, "y": -12 }, "action": "strike", "contactSurface": "inside" }
            },
            "easing": "snap",
            "effects": [
              { "type": "ripple", "duration": 300, "color": "#FFD700" }
            ]
          },
          {
            "time": 0,
            "entityId": "ball",
            "state": {
              "position": { "x": 100, "y": 140 },
              "speed": 8
            },
            "easing": "ease_out"
          },
          {
            "time": 300,
            "entityId": "ball",
            "state": {
              "position": { "x": 100, "y": 50 },
              "speed": 3
            },
            "easing": "ease_out",
            "effects": [
              { "type": "trail", "duration": 800, "color": "rgba(255,255,255,0.4)" }
            ]
          }
        ]
      },
      {
        "name": "Follow Through",
        "startTime": 1600,
        "duration": 600,
        "showLabel": true,
        "keyframes": [
          {
            "time": 0,
            "entityId": "player",
            "state": {
              "rightFoot": { "offset": { "x": 3, "y": -15 }, "action": "idle" },
              "rotation": 0,
              "bodyPosture": "standing"
            },
            "easing": "ease_out",
            "effects": [
              { "type": "arrow", "duration": 600, "color": "#4CAF50" }
            ]
          }
        ]
      },
      {
        "name": "Complete",
        "startTime": 2200,
        "duration": 800,
        "showLabel": false,
        "keyframes": [
          {
            "time": 0,
            "entityId": "ball",
            "state": {
              "position": { "x": 100, "y": 32 },
              "speed": 0
            },
            "easing": "ease_out"
          },
          {
            "time": 0,
            "entityId": "player",
            "state": {
              "position": { "x": 100, "y": 143 },
              "leftFoot": { "offset": { "x": -8, "y": 0 }, "action": "idle" },
              "rightFoot": { "offset": { "x": 8, "y": 0 }, "action": "idle" },
              "bodyPosture": "standing"
            },
            "easing": "ease_out"
          }
        ]
      }
    ]
  }
}
```

---

## Playback Controls UI

The engine should expose a minimal but functional playback UI:

- **Play / Pause** toggle
- **Speed control**: 0.25x, 0.5x, 1.0x, 1.5x, 2.0x
- **Phase scrubber**: Visual timeline showing phases as segments, user can tap to jump to any phase
- **Loop toggle**: On/off
- **Coaching points toggle**: Show/hide text overlay

The controls should be an optional layer — the consuming app can use either the built-in controls or build its own using the imperative handle.

---

## Key Technical Constraints

1. **Mobile-first**: Most users will view on phones. Canvas rendering must maintain 60fps on mid-range Android devices. Keep entity count low.
2. **Offline support**: Exercise JSON definitions should be bundled or cached. No network dependency for rendering.
3. **Deterministic**: Same exercise data must always produce identical animation. No randomness.
4. **Accessible**: Phase names and coaching points must be available as text. Consider screen reader support for exercise descriptions.
5. **Memory**: Dispose canvas resources properly on unmount. Avoid memory leaks in animation loop.
6. **Bundle size**: Engine should add minimal weight. No heavy animation libraries — use native Canvas API and requestAnimationFrame.

---

## Future Extensions (not in initial scope)

- **Side view mode**: For exercises where vertical ball movement matters (volleys, headers, chest control). Switchable via toggle.
- **Multi-player**: Support for 2-3 entities of type "player" for passing exercises or 1v1 scenarios.
- **Exercise editor**: Visual tool where coaches drag entities and define keyframes — generates the JSON. This is a major feature but the data model should support it from day one.
- **Speed curves**: Per-entity speed visualization (color gradient on trail showing acceleration/deceleration).
- **Sound**: Optional subtle sound effects on ball contact.
- **Export**: Generate GIF or short video clip from animation for sharing.
- **Mirrored view**: Flip exercise horizontally to show left-foot version.
- **Cone/ladder patterns**: Predefined equipment layouts (slalom, ladder, square) that can be referenced by name rather than manually positioned.

---

## File Structure Recommendation

```
/engine
  /core
    AnimationEngine.ts          # Main animation loop + state management
    Interpolation.ts            # Easing functions + state interpolation
    Renderer.ts                 # Canvas drawing functions
  /entities
    PlayerRenderer.ts           # Draw player (body, feet, direction)
    BallRenderer.ts             # Draw ball (shadow, spin indicator)
    EquipmentRenderer.ts        # Draw cones, goals, markers
  /effects
    Trail.ts                    # Movement trail rendering
    Arrow.ts                    # Direction arrow rendering
    Ripple.ts                   # Ball contact effect
    Ghost.ts                    # Previous position overlay
  /ui
    SkillAnimation.tsx          # Main React component
    PlaybackControls.tsx        # Play/pause/speed/scrubber
    CoachingOverlay.tsx         # Text overlay for coaching points
    PhaseTimeline.tsx           # Visual phase scrubber
  /types
    index.ts                    # All TypeScript interfaces
  /utils
    easing.ts                   # Easing function implementations
    geometry.ts                 # Position math, angle calculations
    scaling.ts                  # Logical units to pixel conversion
    
/exercises
  /passing
    inside-foot-basic.json
    inside-foot-moving.json
    laces-pass.json
  /dribbling
    close-control-cones.json
    speed-dribble-straight.json
  /ball_mastery
    sole-rolls.json
    toe-taps.json
    foundation-touches.json
  /1v1_moves
    step-over.json
    scissors.json
    cruyff-turn.json
  index.ts                      # Exercise registry + category metadata
```

---

## Implementation Priority

**Phase 1 — Core engine (MVP)**
- Top-down view only
- Single player + ball entities
- Linear and ease interpolation
- Basic player rendering (body + differentiated feet)
- Ball rendering with trail
- Play/pause/reset controls
- 3 example exercises: sole rolls, inside foot pass, cone dribble

**Phase 2 — Polish**
- All easing functions
- Coaching points overlay
- Phase timeline scrubber
- Speed control
- Equipment rendering (cones, markers)
- 15 additional exercises across categories

**Phase 3 — Advanced**
- Side view mode
- Visual effects (ripple, ghost, arrows)
- Multi-player support
- Exercise mirroring (left/right foot)
- 50+ exercise library

**Phase 4 — Editor**
- Visual exercise builder for coaches
- Drag and drop entity placement
- Timeline editor for keyframes
- JSON export/import
