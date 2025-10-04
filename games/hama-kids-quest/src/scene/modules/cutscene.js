// Cutscene helpers extracted from hkq-scene.js

/** 条件1件を見つける */
export function getCondition(scene, predicate) {
  const list = getConditionsList(scene);
  return Array.isArray(list) ? (list.find(predicate) || null) : null;
}

/** 条件の cutscene パスを取る（success/fail） */
export function getCondCutscene(cond, resultType) {
  return cond?.cutscenes?.[resultType] || null;
}

/** カテゴリ（battle/goal 等）デフォルトを取る（success/fail） */
export function getDefaultCutscene(scene, category, resultType) {
  return scene.level?.defaults?.cutscenes?.[category]?.[resultType] || null;
}

/** レベル内の conditions を合算（トップ/clear 両方を見る） */
export function getConditionsList(scene) {
  const list = [];
  const a = scene.level?.conditions;
  if (Array.isArray(a)) list.push(...a);
  const b = scene.level?.clear?.conditions;
  if (Array.isArray(b)) list.push(...b);
  return list;
}

// 新: 第2引数 overridePath でパス上書き可
export function playCutsceneThen(scene, next, overridePath) {
  const imgPath = overridePath || scene.level?.cutscene?.image || null;
  if (!imgPath) { next?.(); return; }

  const texKey = `cutscene:${imgPath}`;
  const startShow = () => {
    const cam = scene.cameras.main;
    const cx = cam.worldView.centerX ?? cam.centerX;
    const cy = cam.worldView.centerY ?? cam.centerY;

    const node = scene.add.image(cx, cy, texKey)
      .setScrollFactor(0).setDepth(10000).setOrigin(0.5, 0.5).setAlpha(0);

    const vw = cam.width, vh = cam.height;
    const iw = node.width || 1024, ih = node.height || 512;
    node.setScale(Math.min(vw * 0.95 / iw, vh * 0.95 / ih));

    scene._cutscenePlaying = true;
    scene.lockGame?.();
    document.dispatchEvent(new CustomEvent('hkq:lock', { detail: { reason: 'cutscene' } }));

    scene.tweens.add({
      targets: node, alpha: 1, duration: 500, ease: 'quad.out',
      onComplete: () => {
        scene.time.delayedCall(1000, () => {
          scene.tweens.add({
            targets: node, alpha: 0, duration: 500, ease: 'quad.in',
            onComplete: () => {
              node.destroy();
              scene._cutscenePlaying = false;
              scene.unlockGame?.();
              document.dispatchEvent(new CustomEvent('hkq:unlock', { detail: { reason: 'cutscene' } }));
              next?.();
            }
          });
        });
      }
    });
  };

  if (scene.textures.exists(texKey)) startShow();
  else { scene.load.once('complete', startShow); scene.load.image(texKey, imgPath); scene.load.start(); }
}

export function playMidCutscene(scene, path, next) {
  if (scene._cutscenePlaying) return;
  if (!path) { next?.(); return; }

  const texKey = `mid:${path}`;
  const startShow = () => {
    const cam = scene.cameras.main;
    const cx = cam.worldView.centerX ?? cam.centerX;
    const cy = cam.worldView.centerY ?? cam.centerY;

    const node = scene.add.image(cx, cy, texKey)
      .setScrollFactor(0).setDepth(10000).setOrigin(0.5, 0.5).setAlpha(0);

    const vw = cam.width, vh = cam.height;
    const iw = node.width || 1024, ih = node.height || 512;
    node.setScale(Math.min(vw * 0.95 / iw, vh * 0.95 / ih));

    // 開始で lock
    scene._cutscenePlaying = true;
    scene.lockGame?.();
    document.dispatchEvent(new CustomEvent('hkq:lock', { detail: { reason: 'cutscene' } }));

    scene.tweens.add({
      targets: node, alpha: 1, duration: 500, ease: 'quad.out',
      onComplete: () => {
        scene.time.delayedCall(1000, () => {
          scene.tweens.add({
            targets: node, alpha: 0, duration: 500, ease: 'quad.in',
            onComplete: () => {
              node.destroy();
              // 終了で unlock
              scene._cutscenePlaying = false;
              scene.unlockGame?.();
              document.dispatchEvent(new CustomEvent('hkq:unlock', { detail: { reason: 'cutscene' } }));
              next?.();
            }
          });
        });
      }
    });
  };

  if (scene.textures.exists(texKey)) startShow();
  else { scene.load.once('complete', startShow); scene.load.image(texKey, path); scene.load.start(); }
}

export function playFailCutscene(scene, path, next) {
  if (!path) { next?.(); return; }

  const texKey = `fail:${path}`;
  const startShow = () => {
    const cam = scene.cameras.main;
    const cx = cam.worldView.centerX ?? cam.centerX;
    const cy = cam.worldView.centerY ?? cam.centerY;

    const node = scene.add.image(cx, cy, texKey)
      .setScrollFactor(0).setDepth(10000).setOrigin(0.5, 0.5).setAlpha(0);

    const vw = cam.width, vh = cam.height;
    const iw = node.width || 1024, ih = node.height || 512;
    node.setScale(Math.min(vw * 0.95 / iw, vh * 0.95 / ih));

    // 開始で lock
    scene._cutscenePlaying = true;
    scene.lockGame?.();
    document.dispatchEvent(new CustomEvent('hkq:lock', { detail: { reason: 'cutscene' } }));

    scene.tweens.add({
      targets: node, alpha: 1, duration: 500, ease: 'quad.out',
      onComplete: () => {
        scene.time.delayedCall(1300, () => {
          scene.tweens.add({
            targets: node, alpha: 0, duration: 500, ease: 'quad.in',
            onComplete: () => {
              node.destroy();
              // restart 前に必ずキューを空にする
              scene.clearRunnerQueue?.();
              // 終了で unlock
              scene._cutscenePlaying = false;
              scene.unlockGame?.();
              document.dispatchEvent(new CustomEvent('hkq:unlock', { detail: { reason: 'cutscene' } }));
              next?.();
            }
          });
        });
      }
    });
  };

  if (scene.textures.exists(texKey)) startShow();
  else { scene.load.once('complete', startShow); scene.load.image(texKey, path); scene.load.start(); }
}

