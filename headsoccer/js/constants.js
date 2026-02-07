// Canvas
const CANVAS_WIDTH = 800;
const CANVAS_HEIGHT = 500;

// Field
const FIELD_Y = 450;          // ground level (lower to give more air space)
const FIELD_LEFT = 50;
const FIELD_RIGHT = 750;
const GOAL_WIDTH = 60;
const GOAL_HEIGHT = 120;      // Back to original height
const GOAL_Y_OFFSET = 80;     // Start goals higher off the ground

// Player
const PLAYER_WIDTH = 20;
const PLAYER_HEIGHT = 25;
const PLAYER_HEAD_RADIUS = 45;  // HUGE heads!
const MOVE_SPEED = 250;       // pixels per second
const VOICE_SPEED_MAX_MULTIPLIER = 5.0;  // louder voice → faster movement (1.0x to 5.0x)
const JUMP_FORCE = 550;       // higher jumps
const GRAVITY = 1000;         // slightly lower gravity for more air time

// Ball
const BALL_RADIUS = 18;
const BALL_GRAVITY = 500;     // Much lighter, floats more
const BALL_BOUNCE_DAMPING = 0.88;  // Bouncier
const BALL_FRICTION = 0.99;   // Less friction, stays in air longer
const KICK_FORCE = 500;       // Stronger kicks
const HEADER_FORCE = 450;     // Stronger headers

// Game mechanics
const MAX_GOALS = 5;          // first to 5 goals wins
const MATCH_DURATION = 180;   // 3 minutes per match
const COUNTDOWN_SECONDS = 3;
const GOAL_CELEBRATION_SECONDS = 2;

// Powerups
const POWERUP_RELOAD_TIME = 10000;     // 10 seconds reload time
const POWERUP_SIZE = 20;              // Visual size of powerup icon
const POWERUP_LIFETIME = 8000;        // Powerup despawns after 8 seconds

const FLAME_SHOT_DURATION = 500;       // Flame shot active time
const FLAME_SHOT_SPEED = 600;          // Speed of flame projectile
const FLAME_SHOT_SIZE = 20;

const CAGE_DURATION = 5000;            // Goal cage lasts 5 seconds
const CAGE_BLOCK_HEIGHT = 120;

// Colors
const COLOR_BG = '#1a1a1a';
const COLOR_FIELD = '#2a5a2a';
const COLOR_LINE = '#fff';
const COLOR_P1 = '#4488FF';
const COLOR_P2 = '#FF4444';
const COLOR_BALL = '#FFFF00';
const COLOR_GOAL = '#888';
const COLOR_WHITE = '#FFFFFF';
const COLOR_FLAME = '#FF6600';
const COLOR_CAGE = '#FFD700';