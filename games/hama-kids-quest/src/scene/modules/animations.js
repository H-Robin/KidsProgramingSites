// Core animations for HKQ scene
// Exports a function to create animations once per game instance.

/**
 * createCoreAnimations(scene)
 * - Builds essential animations once per game instance.
 * - Safe to call multiple times; guarded by a game-level flag.
 * @param {Phaser.Scene} scene
 */
export function createCoreAnimations(scene) {
  if (scene?.sys?.game?.__hkqAnimsBuilt) return;
  if (scene?.sys?.game) scene.sys.game.__hkqAnimsBuilt = true;

  const F = (keys) => keys.map(k => ({ key: k }));

  // Robot animations
  scene.anims.create({
    key: 'robot_idle',
    frames: F(['robot_idle0','robot_idle1']),
    frameRate: 2, repeat: -1
  });
  scene.anims.create({
    key: 'robot_walk',
    frames: F(['robot_walk0','robot_walk1','robot_walk2','robot_walk3','robot_walk4','robot_walk5','robot_walk6','robot_walk7']),
    frameRate: 10, repeat: -1
  });
  scene.anims.create({
    key: 'robot_cheer',
    frames: F(['robot_cheer0','robot_cheer1']),
    frameRate: 6, repeat: -1
  });
  scene.anims.create({
    key: 'robot_sad',
    frames: F(['robot_sad0','robot_sad1','robot_sad2']),
    frameRate: 6, repeat: -1
  });

  // Optional: monster animations are created only if textures exist
  if (scene.textures.exists('monsterA_idle0') && scene.textures.exists('monsterA_idle1')) {
    scene.anims.create({
      key: 'monsterA_idle',
      frames: F(['monsterA_idle0','monsterA_idle1']),
      frameRate: 2, repeat: -1
    });
  }
}

