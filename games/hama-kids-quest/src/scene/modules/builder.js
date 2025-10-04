// Level builder extracted from hkq-scene.js
import { buildTileLayer } from '../../render/tilemap-renderer.js';
import { pickGoalFromSpec } from '../../data/level-loader.js';
import { fieldSize } from '../../render/iso-math.js';

export function buildLevel(scene, showTitle) {
  console.log('[DBG] buildLevel once:', { idx: scene.missionIndex, id: scene.levels?.[scene.missionIndex]?.id });
  // --- Restart reset: インベントリとUIを初期化（必ず鍵は未所持へ） ---
  scene.inventory = scene.inventory || {};
  scene.inventory.key = false;
  scene.inventory.weapon = !!scene.inventory.weapon && false; // 明示的に解除（仕様に合わせるなら調整）
  scene.inventory.portalkey = !!scene.inventory.portalkey && false;
  scene.inventory.blueprint = 0;
  scene.renderItemBox?.();

  // Level/mission
  scene.level = (Array.isArray(scene.levels) ? scene.levels[scene.missionIndex|0] : null) || {};
  const L = scene.level || {};

  // UI: レベルID表示
  try {
    const label = document.getElementById('level-id-label');
    if (label) {
      const idText = (L && L.id) ? String(L.id) : '(no id)';
      label.textContent = `ID: ${idText}`;
    }
  } catch(_) {}

  // UI: ミッションパネルのトグルボタン（多重バインド防止）
  try {
    const btn = document.getElementById('btn-toggle-mission');
    const sr = btn?.querySelector?.('.sr-only');
    if (btn && !btn.dataset.hkqBound) {
      btn.dataset.hkqBound = '1';
      btn.addEventListener('click', () => {
        const isPressed = btn.getAttribute('aria-pressed') === 'true';
        btn.setAttribute('aria-pressed', String(!isPressed));
        if (sr) sr.textContent = !isPressed ? 'ミッションタスク非表示' : 'ミッションタスク表示';
      });
    }
  } catch(_) {}

  // Runner をクリア
  scene.clearRunnerQueue?.();
  scene.gridW = Math.max(4, Math.min(20, (L.gridW|0)||10));
  scene.gridH = Math.max(4, Math.min(20, (L.gridH|0)||10));
  scene.startCell = { x: Math.max(0, Math.min(scene.gridW-1, (L.start?.x|0)||0)), y: Math.max(0, Math.min(scene.gridH-1, (L.start?.y|0)||0)) };
  scene.cmdCap = Number.isFinite(L.cmdCap) ? (L.cmdCap|0) : 20;
  scene.repeatInnerCap = Number.isFinite(L.repeatInnerCap) ? (L.repeatInnerCap|0) : 12;

  // タイトル表示
  if (showTitle) {
    const title = `ミッション ${ (scene.missionIndex|0)+1 }: ${ L.id || '' }`;
    scene.showMissionTitle?.(title, null);
  }

  // cmd上限をUIへ通知（hkq-main.js 側で受信）
  document.dispatchEvent(new CustomEvent('hkq:limits', {
    detail: { cmdCap: scene.cmdCap, repeatInnerCap: scene.repeatInnerCap }
  }));

  const W = scene.scale.gameSize.width;
  const H = scene.scale.gameSize.height;
  const pad = 16;
  const availW = W - pad * 2, availH = H - pad * 2;

  const cell = Math.floor(Math.min(availW / scene.gridW, availH / scene.gridH) * 0.5);
  const DIAMOND_RATIO = 0.55;
  const isoW = Math.max(32, Math.floor(cell * 2));
  const isoH = Math.max(16, Math.floor(isoW * DIAMOND_RATIO));

  const fIsoW = Math.floor(isoW * 1.0);
  const fIsoH = Math.floor(isoH * 1.0);

  const f = fieldSize(scene.gridW, scene.gridH, fIsoW, fIsoH);
  const alignX = 0.7;
  const x0 = scene.snap?.(pad + (availW - f.width) * alignX);
  const y0 = scene.snap?.(pad + (availH - f.height) / 2);

  scene._fieldBounds = { x: x0, y: y0, w: f.width, h: f.height };

  scene.cameras.main.setBackgroundColor('#0b1020');
  scene.fieldLayer?.destroy(true);
  scene.fieldLayer = scene.add.container(x0, y0);

  // --- サブレイヤー分割（床/ゴール用と役者用） ---
  scene.groundLayer?.destroy(true);
  scene.actorLayer?.destroy(true);
  scene.groundLayer = scene.add.container(0, 0);
  scene.actorLayer  = scene.add.container(0, 0);
  scene.fieldLayer.add(scene.groundLayer);
  scene.fieldLayer.add(scene.actorLayer);

  scene._baseIsoX = (scene.gridH - 1) * (fIsoW / 2);

  const tiles = buildTileLayer(scene, scene.gridW, scene.gridH, fIsoW, fIsoH, 'floor_moon', {
    gap: 2, lineColor: 0x44506b, lineAlpha: 1, baseIsoX: scene._baseIsoX
  });
  scene.groundLayer.add(tiles);
  if (window.clearRunnerQueue) window.clearRunnerQueue();

  // ゴール位置
  scene.goalCell = (L.goal && Number.isFinite(L.goal.x) && Number.isFinite(L.goal.y))
    ? { x: L.goal.x, y: L.goal.y }
    : pickGoalFromSpec(scene.gridW, scene.gridH, scene.startCell, L.goalSpec);

  scene._isoW = isoW; scene._isoH = isoH;

  // ---- portals（座標ペアワープ）を正規化して保持 ----
  scene.portals = Array.isArray(L.portals) ? L.portals.map(p => ({
    a: { x: (p?.a?.x|0), y: (p?.a?.y|0) },
    b: { x: (p?.b?.x|0), y: (p?.b?.y|0) },
    requires: Array.isArray(p?.requires) ? p.requires.slice() : [],
    bidirectional: (p?.bidirectional !== false)
  })) : [];

  // Goal sprite
  const gpx = scene.cellToXY?.(scene.goalCell.x, scene.goalCell.y);
  scene.goalSpr?.destroy();

  const goalPath = scene.level?.goalIcon;
  const texKey = `goal:${goalPath}`;
  console.debug('[DBG] goalPath=', goalPath, ' texKey=', texKey, ' level.id=', scene.level?.id);

  scene.goalCell.x = Phaser.Math.Clamp(scene.goalCell.x, 0, scene.gridW - 1);
  scene.goalCell.y = Phaser.Math.Clamp(scene.goalCell.y, 0, scene.gridH - 1);
  if (!scene.textures.exists(texKey)) {
    scene.load.image(texKey, goalPath);
    scene.load.once('complete', () => {
      scene.goalSpr = scene.add.image(scene.snap?.(gpx.x), scene.snap?.(gpx.y), texKey)
        .setOrigin(0.5, 1)
        .setDisplaySize(Math.floor(isoW * 0.9), Math.floor(isoH * 1.3))
        .setDepth(5);
      scene.groundLayer.add(scene.goalSpr);
    });
    scene.load.start();
  } else {
    scene.goalSpr = scene.add.image(scene.snap?.(gpx.x), scene.snap?.(gpx.y), texKey)
      .setOrigin(0.5, 1)
      .setDisplaySize(Math.floor(isoW * 0.9), Math.floor(isoH * 1.3))
      .setDepth(5);
    scene.groundLayer.add(scene.goalSpr);
  }

  // 占有セル集合
  const occupied = new Set();
  occupied.add(scene.occKey?.(scene.startCell.x, scene.startCell.y));
  occupied.add(scene.occKey?.(scene.goalCell.x,  scene.goalCell.y));
  scene._occupiedForPickups = occupied;

  // Obstacles (rock/wall/gate) from JSON
  scene.obstacles = [];
  scene.occObstacles = new Map();
  const obDefs = Array.isArray(L.obstacles) ? L.obstacles : [];

  obDefs.forEach(def => {
    const x = def.x|0, y = def.y|0;
    if (x<0||y<0||x>=scene.gridW||y>=scene.gridH) return;

    let key = null;
    switch (def.type) {
      case 'rock': key = 'ob_rock'; break;
      case 'wall': key = 'ob_wall'; break;
      case 'gate': key = (scene.inventory?.key ? 'gate_opened' : 'gate_closed'); break;
      case 'portalgate':key = 'portalgate'; break;
    }
    if (!key) return;

    const pos = scene.cellToXY?.(x, y);
    const spr = scene.add.image(scene.snap?.(pos.x), scene.snap?.(pos.y), key)
      .setOrigin(0.5,1).setDepth(7)
      .setDisplaySize(Math.floor(scene._isoW*0.7), Math.floor(scene._isoH*1.0));
    scene.groundLayer.add(spr);

    const ob = { x, y, type:def.type, pass:(def.pass||'never'), item:(def.item||null), spr };
    scene.obstacles.push(ob);
    scene.occObstacles.set(scene.occKey?.(x,y), ob);
    scene.addOccupied?.(occupied, x, y);
  });

  scene.refreshGates?.();

  // Robot sprite
  const spx = scene.cellToXY?.(scene.startCell.x, scene.startCell.y);
  scene.robotSpr?.destroy();
  scene.robotSpr = scene.add.sprite(scene.snap?.(spx.x), scene.snap?.(spx.y), 'robot_idle0')
    .setOrigin(0.5, 1).setDisplaySize(Math.floor(isoW * 0.7), Math.floor(isoH * 1.2)).setDepth(100)
  scene.safePlay?.(scene.robotSpr, 'robot_idle', 'robot_idle0');
  scene.actorLayer.add(scene.robotSpr);
  scene.fieldLayer.bringToTop(scene.robotSpr);

  scene.cellSize = cell;
  scene.robotCell = { ...scene.startCell };
  scene._cleared = false;

  // 旧ピックアップ片付け
  try { scene.weaponSpr?.destroy(); } catch(_) {}
  scene.weaponSpr = null; scene.weaponCell = null;
  try { scene.keySpr?.destroy(); } catch(_) {}
  scene.keySpr = null; scene.keyCell = null;

  // 旧モンスター片付け
  if (scene.monsters?.length) scene.monsters.forEach(m => { try { m.spr.destroy(); } catch(_) {} });
  scene.monsters = [];

  // ピックアップ定義
  const pickupDefs = Array.isArray(L.pickups) ? L.pickups : [];

  // WEAPON
  const weaponDef = pickupDefs.find(p => p.type === 'weapon');
  if (weaponDef) {
    scene.placePickup?.(weaponDef, 'weapon_icon', (cell, spr) => {
      scene.weaponCell = cell; scene.weaponSpr = spr;
    }, occupied);
  }

  // KEY
  const keyDef = (Array.isArray(pickupDefs) ? pickupDefs : []).find(p => (p.type||'').toLowerCase() === 'key');
  const keyCount = Number.isFinite(keyDef?.count) ? (keyDef.count|0) : 1;
  scene._hasKeyPickup = !!(keyDef && keyCount > 0);
  if (scene._hasKeyPickup) {
    let cellK = null;
    if (Number.isFinite(keyDef.x) && Number.isFinite(keyDef.y)) {
      const kx = keyDef.x|0, ky = keyDef.y|0;
      const inBounds = (kx>=0 && ky>=0 && kx<scene.gridW && ky<scene.gridH);
      const blocked  = scene.occObstacles?.has?.(scene.occKey?.(kx,ky)) || occupied.has(scene.occKey?.(kx,ky));
      if (inBounds && !blocked) cellK = { x:kx, y:ky };
    }
    if (!cellK) cellK = scene.pickFreeCell?.(occupied);
    if (cellK) {
      scene.keyCell = cellK;
      const pos = scene.cellToXY?.(cellK.x, cellK.y);
      scene.keySpr = scene.add.sprite(scene.snap?.(pos.x), scene.snap?.(pos.y), 'key_icon')
        .setOrigin(0.5,1).setDepth(9)
        .setDisplaySize(Math.floor(scene._isoW * 0.8), Math.floor(scene._isoH * 0.9));
      scene.fieldLayer.add(scene.keySpr);
      scene.addOccupied?.(occupied, cellK.x, cellK.y);
    }
  }

  // PORTAL KEYS
  const pkeyDefs = pickupDefs.filter(p => (p.type||'').toLowerCase() === 'portalkey');
  scene._hasPortalKeyPickup = pkeyDefs.length > 0;
  scene.portalKeys = [];
  pkeyDefs.forEach(def => {
    scene.placePickup?.(def, 'portalkey_icon', (cell, spr) => {
      scene.portalKeys.push({ cell, spr });
    }, occupied);
  });

  // BLUEPRINTS
  const bpDef = (Array.isArray(L.pickups) ? L.pickups : []).find(p => p.type === 'blueprint');
  scene.blueprints = []; scene.blueprintTotal = 0;
  if (bpDef && (bpDef.count|0) > 0) {
    scene.blueprintTotal = bpDef.count|0;
    for (let i = 0; i < scene.blueprintTotal; i++) {
      const cellB = scene.pickFreeCell?.(occupied);
      if (!cellB) break;
      const pos = scene.cellToXY?.(cellB.x, cellB.y);
      const spr = scene.add.sprite(scene.snap?.(pos.x), scene.snap?.(pos.y), 'blueprint_icon')
        .setOrigin(0.5, 1).setDepth(9)
        .setDisplaySize(Math.floor(scene._isoW * 0.75), Math.floor(scene._isoH * 0.85));
      scene.actorLayer.add(spr);
      scene.blueprints.push({ cell: cellB, spr });
    }
  }

  // Enemies
  const enemyDefs = Array.isArray(L.enemies) ? L.enemies : [];
  const pickFreeCell = () => {
    for (let tries = 0; tries < 100; tries++) {
      const rx = Phaser.Math.Between(0, scene.gridW - 1);
      const ry = Phaser.Math.Between(0, scene.gridH - 1);
      const k = scene.occKey?.(rx, ry);
      if (!occupied.has(k)) { occupied.add(k); return { x: rx, y: ry }; }
    }
    for (let y = 0; y < scene.gridH; y++) for (let x = 0; x < scene.gridW; x++) {
      const k = scene.occKey?.(x, y);
      if (!occupied.has(k)) { occupied.add(k); return { x, y }; }
    }
    return null;
  };

  scene.monsters = [];
  enemyDefs.forEach(def => {
    const type = def.type || 'monster-a';
    const count = Math.max(0, def.count | 0 || 0);
    for (let i = 0; i < count; i++) {
      const cellE = pickFreeCell(); if (!cellE) break;
      const p = scene.cellToXY?.(cellE.x, cellE.y);
      const spr = scene.add.sprite(scene.snap?.(p.x), scene.snap?.(p.y), 'monsterA_idle0')
        .setOrigin(0.5, 1).setDepth(12)
        .setDisplaySize(Math.floor(scene._isoW*0.8), Math.floor(scene._isoH*1.0));
      if (scene.anims?.exists?.('monsterA_idle')) spr.play('monsterA_idle');
      scene.actorLayer.add(spr);
      scene.monsters.push({ type, cell: cellE, spr });
    }
  });

  // 背景
  scene.updateBackground?.();
}
