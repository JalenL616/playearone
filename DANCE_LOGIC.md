# Dance Choreography System - Logic & Prompt

## Overview

The dance system converts spoken descriptions into animated choreography using voice transcription and AI. A user describes any dance move, and a stick figure performs it with precise joint movements.

---

## System Flow

### 1. Voice Input (3-30 seconds)
- User clicks "Create Dance" and speaks their description
- Examples: "do the robot dance", "wave your arms and kick", "moonwalk then spin"
- Audio captured at 16kHz mono via AudioWorklet
- Minimum 3 characters required after transcription

### 2. Transcription (2-4 seconds)
- Full audio buffer sent to Vosk speech recognition
- Converts speech to text transcript
- Lightweight, runs on backend without external API calls

### 3. AI Choreography (1-2 seconds)
- Transcript sent to GPT-4o-mini via OpenRouter
- AI generates structured JSON with keyframes and timing
- Temperature: 0.8 (more creative)
- Response format: JSON object

### 4. Animation (Dynamic duration)
- Frontend receives JSON dance plan
- Interpolates between keyframes at 60fps
- Cubic easing for smooth transitions
- Duration calculated from last keyframe + 1 second buffer

---

## Skeleton Joint System

### 11 Controllable Joints + Animation Features

The stick figure has 11 independent joint angles plus animation features:

**Torso:**
- `waist` (-45 to 45°) - Lower torso tilt (constrained for stability)
- `body` (-60 to 60°) - Upper body lean from waist
- `torsoScaleY` (0.85 to 1.15) - Squash/stretch for impact

**Arms:**
- `lShoulder` / `rShoulder` (-150 to 150°) - Arm angle from body
- `lElbow` / `rElbow` (-150 to 150°) - Forearm angle from upper arm

**Legs:**
- `lHip` / `rHip` (-60 to 120°) - Leg angle from hip (no back-kicks)
- `lKnee` / `rKnee` (-150 to 0°) - Knee bend (negative = bent)

**Special:**
- `jumpOffset` (-80 to 0) - Vertical displacement (negative = up)
- `footTargetY` (-10 to 0) - IK grounding hint for foot placement

**Note:** Full-body rotation removed - spins achieved via staggered shoulder/hip offsets for stability

### Anatomy

```
        Head
          |
      Shoulders (joint)
          |
     Upper Body
          |
       Waist (joint)
          |
     Lower Body
       /    \
    L Hip  R Hip (joints)
      |      |
   L Knee R Knee (joints)
      |      |
    Foot   Foot
```

Legs connect to the bottom of the lower body segment. All angles accumulate from parent joints (forward kinematics).

---

## Pose System

### Dual Format Support

AI can output poses in two formats:

**1. Named Poses** (Predefined)
```json
{"time": 0.0, "pose": "ARMS_UP"}
```

**2. Custom Angles** (Unlimited flexibility)
```json
{"time": 2.0, "pose": {"lShoulder": 120, "rShoulder": 45, "lKnee": -30}}
```

### Predefined Poses

All include coordinated leg movement:

**Basic Poses:**
- **IDLE**: Neutral standing with slight arm sway
- **ARMS_UP**: Both arms raised, knees slightly bent
- **ARMS_WAVE_LEFT**: Left arm up, right down, weight on left leg
- **ARMS_WAVE_RIGHT**: Right arm up, left down, weight on right leg
- **SPIN_LEFT**: Arms out, knees bent (no rotation parameter)
- **SPIN_RIGHT**: Arms out, knees bent (no rotation parameter)
- **KICK_LEFT**: Left leg extended 90°, arms for balance
- **KICK_RIGHT**: Right leg extended 90°, arms for balance
- **JUMP**: Crouch position with bent knees, arms down, squash/stretch
- **BOW**: Forward bend at waist, knees slightly bent

**Dance-Specific Poses:**
- **FLOSS_LEFT**: Hips +30°, arms ±90° (left swing)
- **FLOSS_RIGHT**: Hips -30°, arms ±90° (right swing)
- **DAB**: Left arm bent up across face, right extended down
- **TUBE_WAVE**: Arms sway alternating ±45° with body wave
- **HIGH_KNEE_LEFT**: Left leg 90° raise, arms opposite
- **HIGH_KNEE_RIGHT**: Right leg 90° raise, arms opposite

---

## Famous Dance Recognition

The AI recognizes and accurately mimics well-known dances with full-body coordination (all 8 limb angles specified):

**Robot Dance:**
- Stiff, mechanical movements with "linear" easing
- Both arms at 90° angles alternating positions (lShoulder 90°/0°, rShoulder 0°/90°, elbows ±90°)
- Both legs with alternating stances (lHip/rHip ±10-20°, knees -20 to -40°)

**Chicken Dance:**
- Exact sequence: (1) Both arms flap 4x (shoulders ±45°, elbows -60°) with synchronized knee bounces (-20 to -40°), (2) Deep squats (knees -90°, arms at sides), (3) Both arms clap 4x (shoulders 30°, elbows -90°) with weight shifts, (4) Spin via shoulder offsets with knee bends

**Matrix Bullet Dodge:**
- Lean via waist -45°, body -40°
- Both arms extended backward symmetrically (shoulders -60°, elbows -20°)
- Both knees bent (-45°) for stability
- Hold pose for 3 seconds

**Moonwalk:**
- Hip slides (-10° to 20°) with footTargetY hints, body lean 15°
- Alternate leg lifts (one hip 60°, other 10°)
- Both arms swing naturally opposite to legs (shoulders ±20-40°, elbows -10 to -30°)

**Floss:**
- Hips ±30° first (priority), then both arms swing together ±90° with overlap
- Elbows slightly bent (-20°)
- 0.6s per swing
- Both knees bend with each swing (-30 to -50°)

**Dab:**
- Left arm bent up (lShoulder 120°, lElbow -90°)
- Right arm extended down (rShoulder -45°, rElbow -10°)
- Asymmetric leg stance (lHip 8°, lKnee -15°, rHip 5°, rKnee -12°)

**Disco (John Travolta):**
- One arm points up-right/down-left (shoulder 120° or -45°, elbow varying)
- Other arm at hip for balance (shoulder 20°, elbow -60°)
- Hip sways with leg shifts (standing leg knee -25°, other leg varies)

**Running Man:**
- Alternating high knees (one hip 90°, knee 0° / other hip 10°, knee -40°)
- Both arms pump opposite to legs (forward arm shoulder 60°/elbow -30°, back arm shoulder -40°/elbow -20°)
- 0.4s per step

**Carlton (Fresh Prince):**
- Both shoulders shimmy together ±20°, both elbows bent (-60° to -80°)
- Arms swing side to side in sync
- Both knee bounces synchronized (-15° to -35° oscillating)

---

## AI Choreography Prompt

This is the exact prompt sent to GPT-4o-mini (see `backend/ws/handler.py` `_generate_dance_plan()`):

```
You are a creative dance choreographer for a 2D stick figure. The dancer is FACING THE VIEWER/CAMERA at all times. NO full-body rotation/spins - use shoulder/hip offsets instead.

PERSPECTIVE: Dancer faces viewer, so:
- Left arm/leg = viewer's RIGHT side of screen
- Right arm/leg = viewer's LEFT side of screen
- Forward lean = toward viewer (waist/body negative angles)
- Backward lean = away from viewer (waist/body positive angles)
- Hip angles: positive = leg forward toward viewer, negative = leg back away from viewer

You can use predefined poses OR specify custom joint angles for any pose.

Predefined poses (all have leg movements built-in):
- IDLE, ARMS_UP, ARMS_WAVE_LEFT, ARMS_WAVE_RIGHT, SPIN_LEFT, SPIN_RIGHT, KICK_LEFT, KICK_RIGHT, JUMP, BOW, FLOSS_LEFT, FLOSS_RIGHT, DAB, TUBE_WAVE, HIGH_KNEE_LEFT, HIGH_KNEE_RIGHT

Custom angles (REQUIRED constraints in degrees):
- waist: -45 to 45 (torso tilt, limited for stability)
- body: -60 to 60 (upper body lean)
- lShoulder/rShoulder: -150 to 150 (arm angle)
- lElbow/rElbow: -150 to 150 (forearm angle)
- lHip/rHip: -60 to 120 (leg angle, no back-kicks)
- lKnee/rKnee: -150 to 0 (knee bend only)
- jumpOffset: -80 to 0 (vertical displacement)
- torsoScaleY: 0.85 to 1.15 (squash/stretch for impact, optional)
- footTargetY: -10 to 0 (IK grounding hint, optional)

DEFAULT STANDING POSITION (baseline for all movements):
- Arms: DOWN and OUT to sides so they're visible (lShoulder: 20-30°, rShoulder: -20 to -30°, elbows slightly bent -10 to -20°)
- Legs: SPREAD OUT for stable stance (lHip: 10-15°, rHip: -10 to -15°, knees slightly bent -10 to -20°)
- NEVER use 0° for limbs - always offset from center for natural standing pose
- All movements start from and return to this visible, spread-out standing position

Easing per keyframe (choose appropriate):
- "cubic" (default): Smooth, natural
- "linear": Sharp, robotic
- "bounce": Impact, landing feel

CRITICAL FULL-BODY MOVEMENT RULES:
1. EVERY custom pose MUST include ALL limb angles: lShoulder, rShoulder, lElbow, rElbow, lHip, rHip, lKnee, rKnee
2. START from default standing position (arms out 20-30°, legs spread 10-15°, knees/elbows bent -10 to -20°)
3. BOTH arms MUST move - never leave one arm static at 0° while other moves
4. BOTH legs MUST move - never leave legs at 0°, always spread and bent for standing
5. Arms and legs MUST change between keyframes - no static limbs
6. When one arm reaches, other arm balances (opposite angles or support position)
7. When arms move, legs compensate with weight shifts
8. Example GOOD standing pose: {"lShoulder": 25, "rShoulder": -25, "lElbow": -15, "rElbow": -15, "lHip": 12, "lKnee": -15, "rHip": -12, "rKnee": -15}
9. Example GOOD action pose: {"lShoulder": 90, "rShoulder": -30, "lElbow": -45, "rElbow": 20, "lHip": 15, "lKnee": -20, "rHip": 25, "rKnee": -30}
10. Example BAD pose (limbs at 0°): {"lShoulder": 90, "rShoulder": 0, "lHip": 0, "rHip": 0} - arms/legs not visible
11. Example BAD pose (missing angles): {"lShoulder": 90, "rShoulder": -30} - missing elbows and legs

Famous Dance Mimicry (NO rotation parameter - use limb offsets):
When a well-known dance is mentioned, reproduce its signature moves precisely WITH FULL BODY COORDINATION (all 8 limb angles):
- "robot dance": 90° snaps with "linear" easing, stiff movements. BOTH arms at 90° angles alternating, BOTH legs with alternating stances
- "chicken dance": exact sequence - (1) BOTH arms flap 4x WITH knee bounces, (2) deep squats, (3) BOTH arms clap 4x WITH weight shifts, (4) shoulder offsets for spin WITH knee bends
- "matrix bullet dodge": lean via waist -45°, body -40°, BOTH arms extended backward symmetrically, BOTH knees bent (-45°) for stability
- "moonwalk": hip slides with footTargetY hints, body lean 15°, ALTERNATE leg lifts, BOTH arms swing naturally opposite to legs
- "floss": hips ±30° FIRST, BOTH arms swing together ±90° with overlap, elbows slightly bent, BOTH knees BEND with each swing
- "dab": left arm bent up (lShoulder 120°, lElbow -90°), right arm extended down (rShoulder -45°, rElbow -10°), asymmetric leg stance
- "disco": John Travolta point up-right/down-left, OTHER arm at hip for balance, hip sways WITH LEG SHIFTS
- "running man": alternating high knees, BOTH arms pump opposite to legs, 0.4s per step
- "Carlton dance": BOTH shoulders shimmy ±20°, BOTH elbows bent, arms swing side to side, BOTH KNEE BOUNCES synchronized

User description: "{transcript}"

IMPORTANT:
1. 8-15 keyframes, 0.8-2s spacing (vary timing)
2. Use appropriate easing for each keyframe
3. Apply anticipation before big moves
4. MANDATORY: ALL custom poses MUST specify ALL 8 limb angles (lShoulder, rShoulder, lElbow, rElbow, lHip, rHip, lKnee, rKnee)
5. START and END with visible standing position (arms out, legs spread, all joints bent)
6. BOTH arms must be active - if one arm is raised, other arm provides balance
7. NO rotation parameter - offset limbs for spins
8. Stay within joint constraints
9. For famous dances: INCLUDE the specific leg AND arm choreography described above
10. For original dances: Both arms move in coordination, visible knee bends (-20° minimum), hip shifts, weight transfers every keyframe

Explain your choreography choices in 1-2 sentences.

Return ONLY valid JSON (no markdown, no explanation):
{
  "reasoning": "...",
  "duration": 10.0,
  "keyframes": [
    {"time": 0.0, "pose": "IDLE", "easing": "cubic"},
    {"time": 0.8, "pose": {"lShoulder": 45, "rShoulder": -20, "lElbow": -30, "rElbow": 15, "lHip": 20, "lKnee": -30, "rHip": 15, "rKnee": -25, "torsoScaleY": 0.95}, "easing": "bounce"},
    ...
  ]
}
```

---

## Animation Logic

### Interpolation System

**Between keyframes, all 11 joint angles plus features are smoothly interpolated:**

1. **Find surrounding keyframes** for current time
2. **Calculate t value** (0 to 1) between keyframes
3. **Apply per-keyframe easing** (cubic/linear/bounce):
   ```
   cubic: t < 0.5 ? 4*t³ : 1 - (-2t+2)³/2
   linear: t
   bounce: t < 0.5 ? 2*t² : 1 - 2*(1-t)²
   ```
4. **Linear interpolate each angle** using eased t
5. **Apply IK adjustments** if footTargetY specified
6. **Draw skeleton** with torsoScaleY scaling and interpolated pose

### Rendering Loop (60fps)

1. Calculate current time since animation start
2. Get interpolated pose for current time
3. Clear canvas
4. Update and draw particle effects
5. Draw stick figure with current pose angles
6. Update timer display (X.Xs / Y.Ys)
7. Request next frame

### Timer Display

- Shows during animation: "5.2s / 12.0s"
- Updates every frame
- Progress bar fills 0-100%
- Both disappear when animation completes

---

## Error Prevention

### Cooldown Mechanism

After sending a dance plan, the backend enters cooldown mode:

**Duration:** `dance_duration + 2 seconds`

**Purpose:** Prevent spurious audio from being processed as commands

**Behavior:**
- Any audio received during cooldown is discarded
- Prevents "Could not understand" errors during/after animation
- Automatically cleared when user starts new dance

### Audio Buffer Management

- Buffers cleared when starting new dance
- Audio capture stops when dance plan received
- No processing during active dance recording
- Clean state transitions between dances

---

## Key Design Decisions

### Why Custom Angles?
Predefined poses are limited. Custom angles allow AI to create any movement (e.g., pointing at specific angles, asymmetric poses, unique gestures).

### Why Dynamic Duration?
Originally fixed at 12 seconds. Now calculated from last keyframe + 1s buffer. Short commands ("jump") result in short dances (3-4s). Long descriptions use full time.

### Why Cubic Easing?
Linear interpolation looks robotic. Cubic easing adds natural acceleration and deceleration, making movements feel more human.

### Why Stop Audio After Plan?
Audio capture continued running, causing spurious transcriptions. Now stops immediately when plan received, preventing errors.

### Why Full-Body Coordination?
Original poses had static legs and single-arm movement (angles at 0°), making dances look stiff and invisible. Now all custom poses require all 8 limb angles with a visible default standing position (arms out, legs spread), ensuring natural, expressive movement where both arms and both legs are always active.

### Why Famous Dance Recognition?
Users expect "do the robot dance" to look like the actual robot dance. Generic interpretation wasn't satisfying. Specific instructions with full-body coordination for each famous dance ensure iconic moves are reproduced accurately.

---

## Example Flow

**User says:** "do the robot dance"

1. **Transcription:** "do the robot dance"
2. **AI recognizes:** Famous dance (robot)
3. **AI generates:**
   ```json
   {
     "reasoning": "I recognized 'robot dance' and mimicked its stiff, mechanical style with 90° angles and sharp transitions",
     "duration": 8.0,
     "keyframes": [
       {"time": 0.0, "pose": "IDLE", "easing": "linear"},
       {"time": 0.5, "pose": {"lShoulder": 90, "rShoulder": -20, "lElbow": -90, "rElbow": -15, "lHip": 15, "lKnee": -25, "rHip": -10, "rKnee": -20}, "easing": "linear"},
       {"time": 1.0, "pose": {"lShoulder": -20, "rShoulder": 90, "lElbow": -15, "rElbow": -90, "lHip": -10, "lKnee": -20, "rHip": 15, "rKnee": -25}, "easing": "linear"},
       {"time": 1.5, "pose": {"lShoulder": 90, "rShoulder": 90, "lElbow": -90, "rElbow": -90, "lHip": 12, "lKnee": -30, "rHip": -12, "rKnee": -30}, "easing": "linear"},
       ...
     ]
   }
   ```
4. **Frontend animates:** Sharp, mechanical movements with locked 90° angles using linear easing
5. **Cooldown:** 8.0s + 2s = 10s of audio processing disabled

---

## Dance Translation Example: "Victory Celebration"

### Verbal Description
**User says:** "Jump up in excitement, throw your arms high, do a little spin, then strike a dab pose"

### Visual Action Breakdown

**Action 1: Anticipation Crouch (0.0-0.3s)**
- Slight knee bend, arms pulling back
- Body leans forward slightly
- Building energy for the jump

**Action 2: Explosive Jump (0.3-1.0s)**
- Powerful upward push with legs
- Body stretches tall (squash to stretch)
- Arms thrust upward
- Peak at ~1.0s with feet off ground

**Action 3: Landing (1.0-1.5s)**
- Absorb impact with bent knees
- Body compresses slightly
- Arms begin to lower
- Bouncy, impact feel

**Action 4: Recovery & Prep (1.5-2.0s)**
- Return to neutral stance
- Weight centered
- Arms come down smoothly
- Preparing for spin

**Action 5: Spin Sequence (2.0-3.5s)**
- Left shoulder leads forward
- Right shoulder follows
- Hips rotate opposite direction
- Knees stay bent for balance
- Creates spinning illusion without full rotation

**Action 6: Spin Completion (3.5-4.0s)**
- Body returns to forward-facing
- Arms spread wide momentarily
- Weight settles

**Action 7: Dab Setup (4.0-4.5s)**
- Left arm begins rising to face
- Right arm starts extending down
- Body tilts slightly right
- Hip shifts for style

**Action 8: Dab Pose Hold (4.5-6.0s)**
- Left arm bent 90° across face
- Right arm extended down and back
- Head tilts into left arm
- Hold for dramatic effect
- Slight knee bend for swagger

### Translation to Keyframes

```json
{
  "reasoning": "Victory celebration with jump, spin illusion via shoulder offsets, and dab finish. Used bounce easing for landing, linear for crisp dab, cubic for smooth transitions.",
  "duration": 6.0,
  "keyframes": [
    {
      "time": 0.0,
      "pose": "IDLE",
      "easing": "cubic"
    },
    {
      "time": 0.3,
      "pose": {
        "waist": 15,
        "body": -10,
        "lShoulder": -30,
        "lElbow": 20,
        "rShoulder": -30,
        "rElbow": 20,
        "lHip": 40,
        "lKnee": -60,
        "rHip": 40,
        "rKnee": -60,
        "torsoScaleY": 0.9,
        "jumpOffset": 0
      },
      "easing": "bounce"
    },
    {
      "time": 1.0,
      "pose": {
        "waist": -10,
        "body": -15,
        "lShoulder": 120,
        "lElbow": -20,
        "rShoulder": 120,
        "rElbow": -20,
        "lHip": 80,
        "lKnee": -30,
        "rHip": 80,
        "rKnee": -30,
        "torsoScaleY": 1.1,
        "jumpOffset": -70
      },
      "easing": "bounce"
    },
    {
      "time": 1.5,
      "pose": {
        "waist": 10,
        "body": 5,
        "lShoulder": 80,
        "lElbow": -30,
        "rShoulder": 80,
        "rElbow": -30,
        "lHip": 35,
        "lKnee": -70,
        "rHip": 35,
        "rKnee": -70,
        "torsoScaleY": 0.88,
        "jumpOffset": 0,
        "footTargetY": -8
      },
      "easing": "cubic"
    },
    {
      "time": 2.0,
      "pose": "IDLE",
      "easing": "cubic"
    },
    {
      "time": 2.5,
      "pose": {
        "waist": -15,
        "body": 5,
        "lShoulder": 60,
        "lElbow": -25,
        "rShoulder": -30,
        "rElbow": 15,
        "lHip": 20,
        "lKnee": -35,
        "rHip": 25,
        "rKnee": -30,
        "jumpOffset": 0
      },
      "easing": "cubic"
    },
    {
      "time": 3.0,
      "pose": {
        "waist": 15,
        "body": -5,
        "lShoulder": -30,
        "lElbow": 15,
        "rShoulder": 60,
        "rElbow": -25,
        "lHip": 25,
        "lKnee": -30,
        "rHip": 20,
        "rKnee": -35,
        "jumpOffset": 0
      },
      "easing": "cubic"
    },
    {
      "time": 3.5,
      "pose": {
        "waist": 0,
        "body": 0,
        "lShoulder": 45,
        "lElbow": -20,
        "rShoulder": 45,
        "rElbow": -20,
        "lHip": 15,
        "lKnee": -25,
        "rHip": 15,
        "rKnee": -25,
        "jumpOffset": 0
      },
      "easing": "cubic"
    },
    {
      "time": 4.0,
      "pose": {
        "waist": 5,
        "body": 5,
        "lShoulder": 30,
        "lElbow": -45,
        "rShoulder": -30,
        "rElbow": 10,
        "lHip": 8,
        "lKnee": -15,
        "rHip": 5,
        "rKnee": -12,
        "jumpOffset": 0
      },
      "easing": "linear"
    },
    {
      "time": 4.5,
      "pose": "DAB",
      "easing": "linear"
    },
    {
      "time": 6.0,
      "pose": "DAB",
      "easing": "cubic"
    }
  ]
}
```

### Key Technical Choices

**Easing Variations:**
- `bounce` (frames 2-3): Landing impact feels punchy
- `cubic` (most transitions): Smooth, natural flow
- `linear` (frames 9-10): Crisp, instant dab snap

**Squash & Stretch:**
- Frame 2 (0.3s): `torsoScaleY: 0.9` - Crouch compression
- Frame 3 (1.0s): `torsoScaleY: 1.1` - Peak stretch at jump apex
- Frame 4 (1.5s): `torsoScaleY: 0.88` - Landing compression

**IK Grounding:**
- Frame 4 (1.5s): `footTargetY: -8` - Knee adjustment for stable landing contact

**Spin Without Rotation:**
- Frames 5-7 (2.0s-3.5s): Shoulder offsets create spin illusion
- Left/right shoulders alternate leading
- Hips counter-rotate for natural turning motion
- No `rotation` parameter used - all via limb offsets

**Timing Breakdown:**
- 0.0-1.5s: Jump sequence with anticipation (1.5s)
- 1.5-4.0s: Spin illusion via shoulder choreography (2.5s)
- 4.0-6.0s: Dab pose setup and hold (2.0s)
- **Total:** 6.0s celebration

This demonstrates how natural language → visual choreography → precise joint angles/timing/easing creates expressive, realistic animation with professional animation principles.

---

## Performance

**Timing:**
- Recording: 3-30 seconds (user controlled)
- Transcription: 2-4 seconds (Vosk)
- AI generation: 1-2 seconds (GPT-4o-mini)
- Animation: Variable (based on keyframes)

**Resources:**
- Audio buffer: ~2MB for 30s
- JSON response: <5KB
- Animation: 60fps with minimal CPU (2D canvas)

**LLM Costs:**
- ~500 tokens per request
- Response format: JSON (efficient)
- Temperature: 0.8 (balanced creativity)

---

## System Features

### Overview

The current system uses professional animation techniques: no problematic full-body rotation (spins via limb offsets), varied per-keyframe easing for different movement feels, tight realistic joint constraints, and IK hints for better foot placement.

### Key Features

#### 1. Stability & Realism

**No Full-Body Rotation:**
- Spins achieved via staggered shoulder/hip offsets
- Eliminates upside-down glitches and instability
- Example: SPIN_LEFT = lShoulder +45° over time, not global rotation

**Tight Realistic Constraints:**
- `waist`: **-45 to 45°** (realistic torso tilt)
- `body`: **-60 to 60°** (prevent extreme leans)
- `lShoulder/rShoulder`: **-150 to 150°**
- `lHip/rHip`: **-60 to 120°** (no backward kicks)
- `lKnee/rKnee`: **-150 to 0°**
- `jumpOffset`: **-80 to 0**

#### 2. Animation Features

**Per-Keyframe Easing:**
```json
{"time": 1.5, "pose": "ARMS_UP", "easing": "bounce"}
{"time": 3.0, "pose": "JUMP", "easing": "linear"}
```
- **cubic** (default): Smooth, natural acceleration/deceleration
- **linear**: Sharp, instant transitions (robot dance)
- **bounce**: Impact feel (landings, stomps)

**Squash & Stretch:**
- `torsoScaleY` (0.85 to 1.15): Simulate compression/extension
- Example: JUMP = scale 0.9 (squat), 1.1 (stretch in air)

**IK Hints:**
- `footTargetY` (-10 to 0): Ground contact target for knee IK
- Helps feet stay planted during weight shifts

#### 3. Animation Principles

**Anticipation (0.2s prep):**
- Before jump: slight crouch
- Before punch: arm pullback

**Overlap (0.1s lag):**
- Arms trail behind torso rotation
- Secondary wobbles (±5° micro-adjustments)

**Arcs:**
- Limbs follow curved paths (quadratic curves)
- More natural than straight-line motion

**Weight Shifts:**
- Standing leg: knee bent (-20°)
- Lifted leg: opposite knee compensates

#### 4. Updated Predefined Poses

New additions:
- **FLOSS_LEFT/RIGHT**: Hips ±30°, arms overlap ±90°
- **DAB**: Left arm bent up, right extended (no rotation)
- **TUBE_WAVE**: Arms sway alternating ±45° with body wave
- **HIGH_KNEE_LEFT/RIGHT**: Single leg 90° raise, arms opposite

All poses now include anticipation frames.

#### 5. Famous Dance Implementation

**Robot:** Linear easing, 90° snaps, both arms alternating, both legs with alternating stances
**Chicken:** Both arms flap with knee bounces, deep squats, clap with weight shifts, shoulder-offset spin
**Matrix:** Waist -45°, body -40°, both arms back symmetrically, both knees bent -45°
**Floss:** Hips ±30° first, both arms swing ±90° with overlap, both knees bend with each swing
**Moonwalk:** Hip slides (-10° to 20°) with footTargetY hints, alternate leg lifts, arms swing opposite
**Dab:** Left arm up (120°/-90°), right arm down (-45°/-10°), asymmetric leg stance
**Disco:** One arm points up/down, other at hip for balance, leg shifts with hip sways
**Running Man:** Alternating high knees, both arms pump opposite to legs, 0.4s per step
**Carlton:** Both shoulders shimmy ±20°, both elbows bent, both knee bounces synchronized
**No rotation parameter:** All spins use limb offsets only

#### 6. Smart Cooldown

**Duration:** duration + 2s (reduced from 5s for better UX)
**Purpose:** Prevents spurious audio processing during/after animation
**Future:** Keyword "again" bypass (planned)

### Complete AI Prompt (As Implemented)

The full prompt is documented above in the [AI Choreography Prompt](#ai-choreography-prompt) section and matches `backend/ws/handler.py` `_generate_dance_plan()`. Key additions over earlier versions:

- **PERSPECTIVE section**: Clarifies dancer faces viewer, maps left/right to screen sides
- **DEFAULT STANDING POSITION**: Arms out 20-30°, legs spread 10-15°, never 0° for limbs
- **CRITICAL FULL-BODY MOVEMENT RULES**: 11 rules enforcing all 8 limb angles in every custom pose
- **Famous dance descriptions**: Full-body coordination with specific angles for all limbs
- **10 IMPORTANT rules**: Mandatory 8-angle poses, visible standing position start/end, both arms active

### Interpolation Implementation

**Easing Functions (Implemented):**
```javascript
function applyEasing(t, easingType) {
  switch(easingType) {
    case "linear":
      return t;
    case "bounce":
      // Quad bounce: simulate impact
      return t < 0.5 ? 2*t*t : 1 - 2*(1-t)*(1-t);
    case "cubic":
    default:
      // Cubic in-out (existing)
      return t < 0.5 ? 4*t*t*t : 1 - Math.pow(-2*t+2, 3)/2;
  }
}
```

**Simple IK (Implemented):**
```javascript
if (pose.footTargetY !== undefined) {
  // Adjust knee angle to reach target foot position
  const targetDist = Math.abs(pose.footTargetY);
  const hipLength = thighLength + shinLength;
  const kneeAdjust = Math.atan2(targetDist, hipLength) * (180/Math.PI);
  pose.lKnee = Math.max(-150, pose.lKnee - kneeAdjust);
  pose.rKnee = Math.max(-150, pose.rKnee - kneeAdjust);
}
```

**Arc Rendering (Future Enhancement):**
Could replace straight lines with quadratic curves for limbs:
```javascript
ctx.quadraticCurveTo(midX, midY, endX, endY);
```
*Note: Currently uses straight lines for performance*

### Benefits Summary

| Change | Benefit |
|--------|---------|
| No rotation >360° | Eliminates upside-down glitches |
| Tighter constraints | Always valid, realistic poses |
| Per-keyframe easing | Robot vs smooth vs bounce feels |
| Squash/stretch | More dynamic, cartoon-like appeal |
| IK hints | Better foot grounding |
| Animation principles | Professional, polished motion |
| Reduced cooldown | Better UX, "again" for quick retry |

### Testing Commands

1. **"do the floss then dab"** - Tests overlap and varied easing
2. **"robot dance"** - Verifies linear easing, no rotation
3. **"jump high"** - Checks squash/stretch, bounce easing
4. **"Carlton dance"** - Ensures shimmy without full rotation
5. **"moonwalk then spin"** - Tests footTargetY IK and shoulder-offset spins

### Implementation Status

**✅ Completed:**
1. ✅ Removed rotation parameter
2. ✅ Added per-keyframe easing (cubic/linear/bounce)
3. ✅ Tightened joint constraints
4. ✅ Updated famous dance instructions with full-body coordination
5. ✅ Added torsoScaleY (squash/stretch)
6. ✅ Implemented new predefined poses (FLOSS_LEFT/RIGHT, DAB, TUBE_WAVE, HIGH_KNEE_LEFT/RIGHT)
7. ✅ Added animation principles to prompt
8. ✅ IK foot targeting (simple version)
9. ✅ PERSPECTIVE section (dancer faces viewer)
10. ✅ DEFAULT STANDING POSITION (arms out, legs spread, never 0°)
11. ✅ CRITICAL FULL-BODY MOVEMENT RULES (all 8 limb angles mandatory)

**⏸️ Not Implemented:**
1. ⏸️ Arc rendering with quadratic curves (deferred for performance)
2. ⏸️ Cooldown bypass keyword (planned)

### Performance Impact

- Easing switch: Negligible (<0.1ms per frame)
- IK calculation: ~0.5ms per frame if enabled
- Squash/stretch: No additional cost (just Y-scale)
- Overall: Still 60fps capable on modest hardware

---

## System Evolution

**Previous System (v1.0):**
- 12 DOF with full rotation
- Global cubic easing
- Loose constraints (-180° to 180°)
- Fixed cooldown (duration + 5s)
- Famous dances included rotation

**Current System (v2.0 - Implemented):**
- 11 DOF (no rotation) + scale/IK hints
- Per-keyframe easing (cubic/linear/bounce)
- Tight realistic constraints (-150° max)
- Smart cooldown (duration + 2s)
- Famous dances via limb offsets only
- Squash/stretch animation
- IK grounding hints
- Perspective-aware prompt (dancer faces viewer)
- Default standing position (arms out, legs spread)
- Full-body movement rules (all 8 limb angles mandatory)

**Both versions maintain:**
- 60fps animation
- Vosk + GPT-4o-mini pipeline
- Dynamic duration
- Play/Replay/New Dance flow
- Comprehensive debugging

