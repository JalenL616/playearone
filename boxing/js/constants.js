// Canvas
const CANVAS_WIDTH = 800;
const CANVAS_HEIGHT = 500;

// Ring
const RING_Y = 400;          // ground level
const RING_LEFT = 50;
const RING_RIGHT = 750;

// Fighter
const FIGHTER_WIDTH = 40;
const FIGHTER_HEIGHT = 80;
const MOVE_DISTANCE = 50;
const MIN_DISTANCE = 80;     // minimum gap between fighters
const ATTACK_COOLDOWN = 300;  // ms between any actions
const MOVE_COOLDOWN = 200;

// Attacks
const ATTACKS = {
  jab: {
    type: 'jab',
    damage: 10,
    range: 70,
    duration: 200,
    staminaCost: 15
  },
  cross: {
    type: 'cross',
    damage: 20,
    range: 100,
    duration: 400,
    staminaCost: 30
  },
  hook: {
    type: 'hook',
    damage: 15,
    range: 75,
    duration: 350,
    staminaCost: 20
  },
  uppercut: {
    type: 'uppercut',
    damage: 25,
    range: 70,
    duration: 500,
    staminaCost: 40
  }
};

// Defense
const BLOCK_DURATION = 1500;          // auto-release after 1.5s
const BLOCK_DAMAGE_REDUCTION = 0.6;   // 60% damage reduction
const DODGE_DURATION = 300;           // 300ms invincibility
const DODGE_COOLDOWN = 500;

// Stamina
const MAX_STAMINA = 100;
const STAMINA_REGEN_RATE = 10;        // per second
const BLOCK_STAMINA_COST = 15;         // per second while blocking
const DODGE_STAMINA_COST = 25;        // per second while dodging

// Knockdown
const KNOCKDOWN_THRESHOLD = 20;       // damage in one hit to trigger knockdown
const KNOCKDOWN_HP_THRESHOLD = 30;    // must be below this HP
const KNOCKDOWN_DURATION = 2000;      // ms on ground
const KNOCKDOWN_INVINCIBILITY = 500;  // ms invincible after getting up
const TKO_KNOCKDOWNS = 3;            // knockdowns per round for TKO

// Rounds
const ROUND_DURATION = 90;            // seconds
const MAX_ROUNDS = 3;
const COUNTDOWN_SECONDS = 3;
const INTERMISSION_SECONDS = 3;

// Colors
const COLOR_BG = '#1a1a1a';
const COLOR_RING = '#3a3a2a';
const COLOR_ROPE = '#888';
const COLOR_P1 = '#4488FF';
const COLOR_P2 = '#FF4444';
const COLOR_WHITE = '#FFFFFF';
const COLOR_HEALTH_BG = '#333';
const COLOR_HEALTH_LOW = '#FF4444';
