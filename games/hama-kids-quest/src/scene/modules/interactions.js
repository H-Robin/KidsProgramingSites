// Interaction & goal helpers extracted from hkq-scene.js

export function isAtGoal(scene) {
  if (!scene.goalCell || !scene.robotCell) return false;
  if (scene.robotCell.x === scene.goalCell.x && scene.robotCell.y === scene.goalCell.y) return true;
  if (scene.robotSpr && scene.goalSpr) {
    const dx = Math.abs(scene.robotSpr.x - scene.goalSpr.x);
    const dy = Math.abs(scene.robotSpr.y - scene.goalSpr.y);
    const tol = Math.max(2, Math.floor(scene.cellSize * 0.2));
    return dx <= tol && dy <= tol;
  }
  return false;
}

export function handleGoalReached(scene) {
  scene._cleared = true;
  scene.safePlay?.(scene.robotSpr, 'robot_cheer', 'robot_cheer0');
  document.dispatchEvent(new CustomEvent('hkq:mission-cleared', {
    detail: { mission: scene.missionIndex }
  }));
  scene.time.delayedCall(900, () => {
    scene.safePlay?.(scene.robotSpr, 'robot_cheer', 'robot_cheer0');
    scene.time.delayedCall(900, () => {
      const last = (scene.levels?.length || 1) - 1;
      if (scene.missionIndex < last) {
        const nextIdx = scene.missionIndex + 1;
        const nextTitle = `ミッション ${nextIdx + 1}: ${scene.levels[nextIdx]?.id ?? ''}`;
        scene.showMissionTitle?.(nextTitle, () => {
          scene.missionIndex = nextIdx;
          scene.buildLevel?.(true);
        });
      } else {
        scene.showMissionTitle?.('Mission Complete!', () => {
          scene.missionIndex = 0;
          scene.buildLevel?.(true);
        });
      }
    });
  });
}

export function onTick(scene, op) {
  if (scene._cleared) return;
  if (scene._cutscenePlaying || scene._inputLocked) return;

  const DIR = {
    up: { dx: 0, dy: -1 }, down: { dx: 0, dy: 1 },
    right: { dx: 1, dy: 0 }, left: { dx: -1, dy: 0 },
    '↑': { dx: 0, dy: -1 }, '↓': { dx: 0, dy: 1 }, '→': { dx: 1, dy: 0 }, '←': { dx: -1, dy: 0 },
    まえ: { dx: 0, dy: -1 }, うしろ: { dx: 0, dy: 1 }, みぎ: { dx: 1, dy: 0 }, ひだり: { dx: -1, dy: 0 },
  };
  const dir = DIR[op];
  if (!dir) return;

  const nx = Phaser.Math.Clamp(scene.robotCell.x + dir.dx, 0, scene.gridW - 1);
  const ny = Phaser.Math.Clamp(scene.robotCell.y + dir.dy, 0, scene.gridH - 1);

  // === 進行先の通行可否を先に確認 ===
  if (!scene.canEnter?.(nx, ny)) {
    scene.showDirectionIcon?.(op, nx, ny);
    scene.safePlay?.(scene.robotSpr, 'robot_sad', 'robot_sad0');

    // 軽いバンプ演出（行き先へ少しだけ動いて戻す）
    const p1 = scene.cellToXY?.(nx, ny);
    const back = scene.cellToXY?.(scene.robotCell.x, scene.robotCell.y);
    scene.tweens.add({
      targets: scene.robotSpr,
      x: scene.snap?.(p1.x), y: scene.snap?.(p1.y),
      duration: 120, yoyo: true, repeat: 0, ease: 'quad.out',
      onComplete: () => document.dispatchEvent(new CustomEvent('hkq:tick'))
    });
    return;
  }

  // ここで初めてセルを更新（通行可の場合）
  scene.robotCell = { x: nx, y: ny };

  document.dispatchEvent(new CustomEvent('hkq:move', { detail: { pos: { x: nx, y: ny } } }));

  scene.showDirectionIcon?.(op, nx, ny);

  const p = scene.cellToXY?.(nx, ny);
  scene.safePlay?.(scene.robotSpr, 'robot_walk', 'robot_walk0');
  scene.tweens.add({
    targets: scene.robotSpr,
    x: scene.snap?.(p.x), y: scene.snap?.(p.y),
    duration: 260, ease: 'quad.out',
    onComplete: () => {
      if (scene._cleared) return;

      const cx = nx, cy = ny;

      // 1) 武器ピックアップ
      if (scene.weaponCell && cx === scene.weaponCell.x && cy === scene.weaponCell.y && !scene.inventory.weapon) {
        scene.inventory.weapon = true;
        try { scene.weaponSpr?.destroy(); } catch(_) {}
        scene.weaponSpr = null;
        scene.renderItemBox?.();
        document.dispatchEvent(new CustomEvent('hkq:item-pick', { detail: { id: 'weapon' } }));
      }

      // 2) 敵
      const enemy = (scene.monsters || []).find(m => m.cell.x === cx && m.cell.y === cy);
      if (enemy) {
        const condGetKey = scene.getCondition?.(c => c.id === 'get_key'); // 条件(敵→キー取得)
        if (scene.inventory.weapon) {
          const path = scene.getCondCutscene?.(condGetKey, 'success')
                    || scene.getDefaultCutscene?.('battle', 'success');
          if (path) {
            scene.playMidCutscene?.(path, () => {
              try { enemy.spr.destroy(); } catch(_) {}
              scene.monsters = scene.monsters.filter(m => m !== enemy);
              document.dispatchEvent(new CustomEvent('hkq:enemy-down', { detail: { type: 'monster-a' } }));

              if (!scene.inventory.key && !scene._hasKeyPickup) {
                scene.inventory.key = true;
                scene.renderItemBox?.();
                document.dispatchEvent(new CustomEvent('hkq:item-pick', { detail:{ id:'key' }}));
              }
              scene.refreshGates?.();
              scene.safePlay?.(scene.robotSpr, 'robot_idle', 'robot_idle0');
              document.dispatchEvent(new CustomEvent('hkq:tick'));
            });
          } else {
            try { enemy.spr.destroy(); } catch(_) {}
            scene.monsters = scene.monsters.filter(m => m !== enemy);
          }
          return;
        } else {
          const path = scene.getCondCutscene?.(condGetKey, 'fail')
                    || scene.getDefaultCutscene?.('battle', 'fail');
          if (path) {
            scene.playFailCutscene?.(path, () => {
              scene.buildLevel?.(true);
            });
          } else {
            scene.scene.restart({ missionIndex: scene.missionIndex });
          }
          return;
        }
      }
      // 2.5) 設計図（踏んだら取得）
      if (scene.blueprints?.length) {
        const hitIndex = scene.blueprints.findIndex(b => b.cell.x === cx && b.cell.y === cy);
        if (hitIndex >= 0) {
          try { scene.blueprints[hitIndex].spr.destroy(); } catch(_) {}
          scene.blueprints.splice(hitIndex, 1);
          scene.inventory.blueprint = Math.min(
            (scene.inventory.blueprint|0) + 1,
            scene.blueprintTotal|0
          );
          document.dispatchEvent(new CustomEvent('hkq:item-pick', { detail: { id: 'blueprint' } }));

          if ((scene.inventory.blueprint|0) >= (scene.blueprintTotal|0) && scene.blueprintTotal > 0) {
            const condBP = scene.getCondition?.(c => c.id === 'collect_blueprints');
            const pathBP = scene.getCondCutscene?.(condBP, 'success');
            if (pathBP) {
              scene.playMidCutscene?.(pathBP, () => {
                scene.safePlay?.(scene.robotSpr, 'robot_idle', 'robot_idle0');
                document.dispatchEvent(new CustomEvent('hkq:tick'));
              });
              return;
            }
          }
        }
      }
      // 3) カードキー（基地ゲート用）
      if (scene.keyCell && cx === scene.keyCell.x && cy === scene.keyCell.y && !scene.inventory.key) {
        scene.inventory.key = true;
        try { scene.keySpr?.destroy(); } catch(_) {}
        scene.keySpr = null;
        scene.renderItemBox?.();
        document.dispatchEvent(new CustomEvent('hkq:item-pick', { detail: { id: 'key' } }));
      }
      scene.refreshGates?.();
      // 3.5) ポータルキー（ワープ用）— 複数対応
      if (scene.portalKeys?.length) {
        const hit = scene.portalKeys.findIndex(k => k.cell.x === cx && k.cell.y === cy);
        if (hit >= 0 && !scene.inventory.portalkey) {
          scene.inventory.portalkey = true;
          try { scene.portalKeys[hit].spr?.destroy(); } catch(_) {}
          scene.portalKeys.splice(hit, 1);
          scene.renderItemBox?.();
          document.dispatchEvent(new CustomEvent('hkq:item-pick', { detail: { id: 'portalkey' } }));
        }
      }
      // 3.9) ポータル（portalgate）転送
      if (scene.tryWarpAt?.(cx, cy)) {
        return;
      }
      // 4) ゴール到達（鍵チェック）
      if (scene.isAtGoal?.()) {
        const condReach = scene.getCondition?.(c => c.id === 'reach_goal');

        const pathSuccess = scene.getCondCutscene?.(condReach, 'success')
                              || scene.getDefaultCutscene?.('goal', 'success')
                              || scene.level?.cutscene?.image || null;

        const pathFail = scene.getCondCutscene?.(condReach, 'fail')
                            || scene.getDefaultCutscene?.('goal', 'fail');

        const result = scene.mission.evaluate({
          inventory: scene.inventory,
          progress: { reachedGoal: true }
        });
        console.log("【DEBUG】evaluate result:", result);
        if (result.done) {
          document.dispatchEvent(new CustomEvent('hkq:reach-goal', { detail: { pos: { x: cx, y: cy } } }));
          scene.playCutsceneThen?.(() => scene.handleGoalReached?.(), pathSuccess);
        } else {
          scene.safePlay?.(scene.robotSpr, 'robot_sad', 'robot_sad0');
          if (pathFail) {
            scene.playFailCutscene?.(pathFail, () => {
              scene.buildLevel?.(true);
            });
          } else {
            scene.scene.restart({ missionIndex: scene.missionIndex });
          }
        }
        return;
      }
      // ライフ0
      if (Number(window.HKQ_LIFE ?? 3) <= 0){
        document.dispatchEvent(new CustomEvent('hkq:life-zero'));
        return;
      }
      // 5) 通常
      scene.safePlay?.(scene.robotSpr, 'robot_idle', 'robot_idle0');
      document.dispatchEvent(new CustomEvent('hkq:tick'));
    }
  });
}

