// Central configuration for data→display mappings

// Map tile key → levels JSON path
export const LEVEL_JSON_BY_TILE = Object.freeze({
  "moonland":    "assets/data/levels-tutorial2.json",
  "moon-alien":  "assets/data/levels-monster.json",
  "planed-area": "assets/data/levels-blueprint.json",
  "route-dev":   "assets/data/levels-route.json",
  "kids-dev1":   "assets/data/levels-kidsmap1.json",
  "kids-dev2":   "assets/data/levels-kidsmap2.json",
  "kids-dev3":   "assets/data/levels-kidsmap3.json",
  "kids-dev4":   "assets/data/levels-kidsmap4.json",
  "moon-base":   "assets/data/levels-tutorial1.json"
});

// Texture key → asset path (core character/optional enemy)
export const TEXTURE_MANIFEST = Object.freeze({
  // idle
  'robot_idle0':  'assets/robot/idle/character_robot_idle0.png',
  'robot_idle1':  'assets/robot/idle/character_robot_idle1.png',
  // walk (0..7)
  'robot_walk0':  'assets/robot/walk/character_robot_walk0.png',
  'robot_walk1':  'assets/robot/walk/character_robot_walk1.png',
  'robot_walk2':  'assets/robot/walk/character_robot_walk2.png',
  'robot_walk3':  'assets/robot/walk/character_robot_walk3.png',
  'robot_walk4':  'assets/robot/walk/character_robot_walk4.png',
  'robot_walk5':  'assets/robot/walk/character_robot_walk5.png',
  'robot_walk6':  'assets/robot/walk/character_robot_walk6.png',
  'robot_walk7':  'assets/robot/walk/character_robot_walk7.png',
  // cheer
  'robot_cheer0': 'assets/robot/cheer/character_robot_cheer0.png',
  'robot_cheer1': 'assets/robot/cheer/character_robot_cheer1.png',
  // sad
  'robot_sad0':   'assets/robot/sad/sad0.png',
  'robot_sad1':   'assets/robot/sad/sad1.png',
  'robot_sad2':   'assets/robot/sad/sad2.png',

  // optional monster
  'monsterA_idle0': 'assets/enemy/monster-a/idle/idle0.png',
  'monsterA_idle1': 'assets/enemy/monster-a/idle/idle1.png',
});

// Mission icon name (JP label) → image path
// Mutable: gameplay/UI code may register additions at runtime.
export const MISSION_ICON_MAP = {
  "ロボット":       "assets/robot/idle/character_robot_idle0.png",
  "モンスター":     "assets/enemy/monster-a/idle/idle1.png",
  "ポータルキー":   "assets/items/portalkey.png",
  "ゲートカード":   "assets/items/gatecard.png",
  "ゴール":         "assets/floor/moon-base2.png",
  "建設予定地":     "assets/floor/planedsite_goal.png",
  "ブラスターガン": "assets/weapon/blaster-a.png",
  "設計図":         "assets/items/blueprint1.png",
};
