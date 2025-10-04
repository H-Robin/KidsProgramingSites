// Warp helpers extracted from hkq-scene.js

export function tryWarpAt(scene, x, y) {
  const now = (performance && performance.now) ? performance.now() : Date.now();
  if (now - (scene._lastWarpAt || 0) < (scene._warpCooldownMs || 180)) return false; // 連発防止

  // 1) portals 配列があれば「a<->b」優先で処理
  if (Array.isArray(scene.portals) && scene.portals.length) {
    let link = null, dir = null;
    for (const p of scene.portals) {
      if ((p?.a?.x === x && p?.a?.y === y)) { link = p; dir = 'a2b'; break; }
      if (p?.bidirectional !== false && (p?.b?.x === x && p?.b?.y === y)) { link = p; dir = 'b2a'; break; }
    }
    if (!link) return false;

    // 要件チェック（portals.requires を全て満たす必要あり）
    if (Array.isArray(link.requires) && link.requires.length) {
      const lacks = link.requires.some(k => !scene.inventory?.[k]);
      if (lacks) {
        // 要件不足は“失敗演出→リスタート”で明確化
        const condReach = scene.getCondition?.(c => c.id === 'reach_goal');
        const pathFail  = scene.getCondCutscene?.(condReach, 'fail')
                      || scene.getDefaultCutscene?.('goal', 'fail')
                      || 'assets/cutscene/mission-failed2.png';
        scene.playFailCutscene?.(pathFail, () => { scene.buildLevel(true); });
        return true;
      }
    }

    const dest = (dir === 'a2b') ? link.b : link.a;
    // ★ ポータルキー消費：portals.requires に portalkey が含まれていれば消費
    if (Array.isArray(link.requires) && link.requires.includes('portalkey') && scene.inventory.portalkey) {
      scene.inventory.portalkey = false;
      // 進捗やカウントは付けず、アイテムボックスのみ反映
      scene.renderItemBox?.();
    }
    scene._lastWarpAt = now;
    scene._lastWarpCell = scene.occKey?.(dest.x, dest.y);
    return _doWarpTo(scene, dest.x, dest.y);
  }

  // 2) フォールバック：portalgate の group 循環（従来動作）
  const here = scene.occObstacles?.get?.(scene.occKey?.(x,y));
  if (!here || here.type !== 'portalgate') return false;
  if (!scene.canEnter?.(x, y)) return false; // obstacles 側の pass/item も尊重
  const group = here.group ?? null;
  const list = (scene.obstacles || []).filter(ob =>
    ob.type === 'portalgate' && (ob.group ?? null) === group
  );
  if (list.length <= 1) return false;
  const idx = list.findIndex(ob => ob.x === x && ob.y === y);
  const next = list[(idx + 1 + list.length) % list.length];
  const dest = { x: next.x, y: next.y };
  // ★ フォールバック時も、入場条件が portalkey なら消費
  //    （canEnter で通過済み＝所持している前提）
  if ((here.pass === 'need_item' && here.item === 'portalkey') && scene.inventory.portalkey) {
    scene.inventory.portalkey = false;
    scene.renderItemBox?.();
  }
  scene._lastWarpAt = now;
  scene._lastWarpCell = scene.occKey?.(dest.x, dest.y);
  return _doWarpTo(scene, dest.x, dest.y);
}

export function _doWarpTo(scene, dx, dy) {
  scene._cutscenePlaying = true;
  scene.lockGame?.();
  scene.tweens.add({
    targets: scene.robotSpr, alpha: 0.0, duration: 120, ease: 'quad.out',
    onComplete: () => {
      scene.robotCell = { x: dx, y: dy };
      const p2 = scene.cellToXY?.(dx, dy);
      scene.robotSpr.setPosition(scene.snap?.(p2.x), scene.snap?.(p2.y));
      scene.tweens.add({
        targets: scene.robotSpr, alpha: 1.0, duration: 120, ease: 'quad.in',
        onComplete: () => {
          scene._cutscenePlaying = false;
          scene.unlockGame?.();
          scene.safePlay?.(scene.robotSpr, 'robot_idle', 'robot_idle0');
          document.dispatchEvent(new CustomEvent('hkq:tick'));
        }
      });
    }
  });
  return true;
}

