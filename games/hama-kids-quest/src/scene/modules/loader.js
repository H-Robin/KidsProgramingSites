// Loader utilities centralization

// Manifest of texture keys to asset paths
export const TEXTURE_MANIFEST = {
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
};

// Keys that should be present before building core animations
export const REQUIRED_CORE_KEYS = [
  'robot_idle0','robot_idle1',
  'robot_walk0','robot_walk1','robot_walk2','robot_walk3',
  'robot_walk4','robot_walk5','robot_walk6','robot_walk7',
  'robot_cheer0','robot_cheer1',
  'robot_sad0','robot_sad1','robot_sad2',
];

/**
 * ensureTextures(scene, keys)
 * - Ensures the given texture keys are loaded into the scene's cache.
 * - Starts a load for any missing keys, and awaits completion.
 * - Resolves even if some files fail; caller can verify existence after.
 * @param {Phaser.Scene} scene
 * @param {string[]} keys
 * @returns {Promise<void>}
 */
export async function ensureTextures(scene, keys) {
  const miss = keys.filter(k => !scene.textures.exists(k));
  if (miss.length === 0) return;

  miss.forEach(k => {
    const url = TEXTURE_MANIFEST[k];
    if (!url) console.error('[assets] URL未定義', k);
    else scene.load.image(k, url);
  });

  await new Promise((resolve) => {
    scene.load.once('complete', resolve);
    scene.load.once('loaderror', (f) => {
      console.error('[assets] loaderror:', f?.key || f?.src || f);
    });
    scene.load.start();
  });

  const still = keys.filter(k => !scene.textures.exists(k));
  if (still.length) {
    console.error('[assets] 必須テクスチャ未ロード:', still);
  }
}

