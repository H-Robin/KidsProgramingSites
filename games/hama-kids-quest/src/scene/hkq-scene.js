// games/hama-kids-quest/src/scene/hkq-scene.js
import { isoX, isoY, fieldSize } from '../render/iso-math.js';
import { buildTileLayer } from '../render/tilemap-renderer.js';
import { loadLevels, pickGoalFromSpec } from '../data/level-loader.js';

const ISO_ARROW = {
  up:    'arrow-nw', // ↖︎
  right: 'arrow-ne', // ↗︎
  down:  'arrow-se', // ↘︎
  left:  'arrow-sw'  // ↙︎
};

export class HkqScene extends Phaser.Scene {
  constructor() {
    super('HkqScene');
  }

  occKey(x,y){ return `${x},${y}`; }
  addOccupied(set,x,y){ set.add(this.occKey(x,y)); }
  pickFreeCell(occupied){
    // ランダム100回トライ
    for (let i=0;i<100;i++){
      const x = Phaser.Math.Between(0, this.gridW-1);
      const y = Phaser.Math.Between(0, this.gridH-1);
      const k = this.occKey(x,y);
      if (!occupied.has(k)) { occupied.add(k); return {x,y}; }
    }
    // 総当たりフォールバック
    for (let y=0;y<this.gridH;y++){
      for (let x=0;x<this.gridW;x++){
        const k=this.occKey(x,y);
        if(!occupied.has(k)){ occupied.add(k); return {x,y}; }
      }
    }
    return null;
  }

  preload() {
    this.load.json('levels', 'assets/data/hkq-levels.json');

    // 画像アセット
    this.load.image('robot_idle0', 'assets/robot/idle/character_robot_idle0.png');
    this.load.image('robot_idle1', 'assets/robot/idle/character_robot_idle1.png');
    for (let i = 0; i <= 7; i++) {
      this.load.image(`robot_walk${i}`, `assets/robot/walk/character_robot_walk${i}.png`);
    }
    this.load.image('robot_cheer0', 'assets/robot/cheer/character_robot_cheer0.png');
    this.load.image('robot_cheer1', 'assets/robot/cheer/character_robot_cheer1.png');
    this.load.image('goal_png', 'assets/floor/moon_base_goal.png');

    // hkq-scene.js / preload()
    this.load.image('robot_sad1', 'assets/robot/sad/sad1.png');
    this.load.image('robot_sad2', 'assets/robot/sad/sad2.png');
    this.load.image('robot_sad3', 'assets/robot/sad/sad3.png');

    // ゲートカード & ブラスター
    this.load.image('key_icon',    'assets/items/gatecard.png');
    this.load.image('weapon_icon', 'assets/weapon/blaster-a.png');
    // monster-a idle frames
    this.load.image('monsterA_idle1', 'assets/enemy/monster-a/idle/idle1.png');
    this.load.image('monsterA_idle2', 'assets/enemy/monster-a/idle/idle2.png');    
    // 床タイル
    this.load.image('floor_moon', 'assets/floor/moon.png');

    // 方向アイコン
    this.load.image('arrow-nw', 'assets/direction/arrow-nw.png');
    this.load.image('arrow-ne', 'assets/direction/arrow-ne.png');
    this.load.image('arrow-se', 'assets/direction/arrow-se.png');
    this.load.image('arrow-sw', 'assets/direction/arrow-sw.png');
  }

      /**
   * ミッションクリア時カットシーンを再生してから next() を呼ぶ
   * フェードイン0.5s → 表示1.0s → フェードアウト0.5s
   */
  playCutsceneThen(next) {
    const imgPath = this.level?.cutscene?.image;
    if (!imgPath) { next?.(); return; }

    // ミッションごとにユニークなテクスチャキーにする
    const texKey = `cutscene:${this.level.id}`;
    const startShow = () => {
      const cam = this.cameras.main;
      const cx = cam.worldView.centerX ?? cam.centerX;
      const cy = cam.worldView.centerY ?? cam.centerY;

      const node = this.add.image(cx, cy, texKey)
        .setScrollFactor(0)
        .setDepth(10000)
        .setOrigin(0.5, 0.5)
        .setAlpha(0);

      // 画面サイズに合わせて軽くスケール（任意）
      const vw = cam.width, vh = cam.height;
      const iw = node.width || 1024, ih = node.height || 512;
      const scale = Math.min(vw * 0.95 / iw, vh * 0.95 / ih);
      node.setScale(scale);

      // フェードイン → 表示 → フェードアウト（timeline を使わない版）
      this.tweens.add({
        targets: node,
        alpha: 1,
        duration: 500,
        ease: 'quad.out',
        onComplete: () => {
          // 表示キープ 1.0s
          this.time.delayedCall(1000, () => {
            // フェードアウト 0.5s
            this.tweens.add({
              targets: node,
              alpha: 0,
              duration: 500,
              ease: 'quad.in',
              onComplete: () => {
                node.destroy();
                next?.();
              }
            });
          });
        }
      });
    };

    // すでに読み込み済みなら即再生、未ロードなら動的ロード
    if (this.textures.exists(texKey)) {
      startShow();
    } else {
      this.load.once('complete', startShow);
      this.load.image(texKey, imgPath);
      this.load.start();
    }
  }

/**
 * ミッション進行中のカットシーン（遷移なし）
 * path: 画像パス, next: 再生後コールバック
 */
playMidCutscene(path, next) {
  if (this._cutscenePlaying) return;
  this._cutscenePlaying = true;

  if (!path) { this._cutscenePlaying = false; next?.(); return; }

  const texKey = `mid:${path}`;
  const startShow = () => {
    const cam = this.cameras.main;
    const cx = cam.worldView.centerX ?? cam.centerX;
    const cy = cam.worldView.centerY ?? cam.centerY;

    const node = this.add.image(cx, cy, texKey)
      .setScrollFactor(0)
      .setDepth(10000)
      .setOrigin(0.5, 0.5)
      .setAlpha(0);

    // 画面にフィット
    const vw = cam.width, vh = cam.height;
    const iw = node.width || 1024, ih = node.height || 512;
    const scale = Math.min(vw * 0.95 / iw, vh * 0.95 / ih);
    node.setScale(scale);

    // フェードイン(0.5) → 表示(1.0) → フェードアウト(0.5)
    this.tweens.add({
      targets: node, alpha: 1, duration: 500, ease: 'quad.out',
      onComplete: () => {
        this.time.delayedCall(1000, () => {
          this.tweens.add({
            targets: node, alpha: 0, duration: 500, ease: 'quad.in',
            onComplete: () => {
              node.destroy();
              this._cutscenePlaying = false;
              next?.();
            }
          });
        });
      }
    });
  };

  if (this.textures.exists(texKey)) { startShow(); }
  else { this.load.once('complete', startShow); this.load.image(texKey, path); this.load.start(); }
} 
  /**
 * 失敗カットシーンを再生してから next() を呼ぶ
 * path: 画像ファイルパス
 */
playFailCutscene(path, next) {
  if (!path) { next?.(); return; }

  const texKey = `fail:${path}`;
  const startShow = () => {
    const cam = this.cameras.main;
    const cx = cam.worldView.centerX ?? cam.centerX;
    const cy = cam.worldView.centerY ?? cam.centerY;

    const node = this.add.image(cx, cy, texKey)
      .setScrollFactor(0)
      .setDepth(10000)
      .setOrigin(0.5, 0.5)
      .setAlpha(0);

    const vw = cam.width, vh = cam.height;
    const iw = node.width || 1024, ih = node.height || 512;
    const scale = Math.min(vw * 0.95 / iw, vh * 0.95 / ih);
    node.setScale(scale);

    // フェードイン → 表示 → フェードアウト
    this.tweens.add({
      targets: node,
      alpha: 1,
      duration: 500,
      ease: 'quad.out',
      onComplete: () => {
        this.time.delayedCall(1300, () => {
          this.tweens.add({
            targets: node,
            alpha: 0,
            duration: 500,
            ease: 'quad.in',
            onComplete: () => {
              node.destroy();
              next?.();
            }
          });
        });
      }
    });
  };

  if (this.textures.exists(texKey)) {
    startShow();
  } else {
    this.load.once('complete', startShow);
    this.load.image(texKey, path);
    this.load.start();
  }
}

  create() {
    this.levels = loadLevels(this);
    this.missionIndex = 0;

    this.createAnimations();
    this.buildLevel(true);

    // リサイズ処理
    this._lastSize = { w: this.scale.width, h: this.scale.height };
    this._resizeTid = null;
    this.scale.on('resize', () => {
      const w = this.scale.width, h = this.scale.height;
      if (Math.abs(w - this._lastSize.w) < 8 && Math.abs(h - this._lastSize.h) < 8) return;
      clearTimeout(this._resizeTid);
      this._resizeTid = setTimeout(() => {
        this._lastSize = { w, h };
        this.buildLevel(false);
      }, 120);
    });
  }

  // 方向アイコンを一時表示
  showDirectionIcon(dirKey, cellX, cellY) {
    const key = ISO_ARROW[dirKey];
    if (!key) return;

    const p = this.cellToXY(cellX, cellY);

    const spr = this.add.image(p.x, p.y, key)
      .setOrigin(0.5, 1)
      .setDepth(50)
      .setScale(0.9);

    spr.setAlpha(0);
    this.tweens.add({
      targets: spr,
      alpha: 1,
      y: p.y - 8,
      duration: 150,
      ease: 'quad.out',
      yoyo: true,
      hold: 100,
      onComplete: () => spr.destroy()
    });
  }

  createAnimations() {
    this.anims.create({ key: 'robot_idle', frames: [{ key: 'robot_idle0' }, { key: 'robot_idle1' }], frameRate: 2, repeat: -1 });
    this.anims.create({ key: 'robot_walk', frames: Array.from({ length: 8 }, (_, i) => ({ key: `robot_walk${i}` })), frameRate: 10, repeat: -1 });
    this.anims.create({ key: 'robot_cheer', frames: [{ key: 'robot_cheer0' }, { key: 'robot_cheer1' }], frameRate: 6, repeat: -1 });
    this.anims.create({
      key: 'monsterA_idle',
      frames: [{ key: 'monsterA_idle1' }, { key: 'monsterA_idle2' }],
      frameRate: 2,
      repeat: -1
    });
    this.anims.create({
      key: 'robot_sad',
      frames: [{ key: 'robot_sad1' }, { key: 'robot_sad2' }, { key: 'robot_sad3' }],
      frameRate: 6,
      repeat: -1
    });
  }

  snap(v) { return Math.round(v); }

  buildLevel(showTitle) {
    const L = this.levels[this.missionIndex] || {};
    this.level = L; // ← Mission側に渡すため保持
    this.gridW = L.gridW ?? 6;
    this.gridH = L.gridH ?? 8;

    const startX = L.robot?.x ?? 0;
    const startY = L.robot?.y ?? this.gridH - 1;
    this.startCell = { x: startX, y: startY };

    const W = this.scale.gameSize.width;
    const H = this.scale.gameSize.height;
    const pad = 16;
    const availW = W - pad * 2;
    const availH = H - pad * 2;

    const cell = Math.floor(Math.min(availW / this.gridW, availH / this.gridH) * 0.5);
    const DIAMOND_RATIO = 0.55;
    const isoW = Math.max(32, Math.floor(cell * 2));
    const isoH = Math.max(16, Math.floor(isoW * DIAMOND_RATIO));

    const FLOOR_SCALE = 1.0;
    const fIsoW = Math.floor(isoW * FLOOR_SCALE);
    const fIsoH = Math.floor(isoH * FLOOR_SCALE);

    const f = fieldSize(this.gridW, this.gridH, fIsoW, fIsoH);
    const alignX = 0.7;
    const x0 = this.snap(pad + (availW - f.width) * alignX);
    const y0 = this.snap(pad + (availH - f.height) / 2);

    this.cameras.main.setBackgroundColor('#0b1020');
    this.fieldLayer?.destroy(true);
    this.fieldLayer = this.add.container(x0, y0);

    this._baseIsoX = (this.gridH - 1) * (fIsoW / 2);

    const tiles = buildTileLayer(this, this.gridW, this.gridH, fIsoW, fIsoH, 'floor_moon', {
      gap: 2, lineColor: 0x44506b, lineAlpha: 1, baseIsoX: this._baseIsoX
    });
    this.fieldLayer.add(tiles);

//    this.goalCell = pickGoalFromSpec(this.gridW, this.gridH, this.startCell, L.goalSpec);// 置き換え（直指定があれば使い、なければ従来どおり）
    this.goalCell = (L.goal && Number.isFinite(L.goal.x) && Number.isFinite(L.goal.y))
      ? { x: L.goal.x, y: L.goal.y }
      : pickGoalFromSpec(this.gridW, this.gridH, this.startCell, L.goalSpec);
    this._isoW = isoW; this._isoH = isoH;

    const gpx = this.cellToXY(this.goalCell.x, this.goalCell.y);
    this.goalSpr?.destroy();
    this.goalSpr = this.add.image(this.snap(gpx.x), this.snap(gpx.y), 'goal_png')
      .setOrigin(0.5, 1)
      .setDisplaySize(Math.floor(isoW * 1.6), Math.floor(isoH * 1.4))
      .setDepth(5);
    this.fieldLayer.add(this.goalSpr);

    const spx = this.cellToXY(this.startCell.x, this.startCell.y);
    this.robotSpr?.destroy();
    this.robotSpr = this.add.sprite(this.snap(spx.x), this.snap(spx.y), 'robot_idle0')
      .setOrigin(0.5, 1)
      .setDisplaySize(Math.floor(isoW * 0.7), Math.floor(isoH * 1.2))
      .setDepth(10)
      .play('robot_idle', true);
    this.fieldLayer.add(this.robotSpr);

    this.cellSize = cell;
    this.robotCell = { ...this.startCell };
    this._cleared = false;
    // 古いピックアップ破棄
    if (this.weaponSpr) { try{ this.weaponSpr.destroy(); }catch(_){} this.weaponSpr=null; }
    this.weaponCell = null;

    // 既存モンスターの後始末（リビルド対策）
    if (this.monsters && this.monsters.length) {
      this.monsters.forEach(s => { try { s.destroy(); } catch(_){} });
    }
    this.monsters = [];

    // 占有セル集合（重なり回避）
    const occupied = new Set();
    const occKey = (x,y)=>`${x},${y}`;
    occupied.add(occKey(this.startCell.x, this.startCell.y));
    occupied.add(occKey(this.goalCell.x,  this.goalCell.y));


    // --- WEAPON（ブラスター）をランダム配置 ---
    const pickupDefs = Array.isArray(this.level?.pickups) ? this.level.pickups : [];
    const weaponDef = pickupDefs.find(p => p.type === 'weapon');
    if (weaponDef && (weaponDef.count|0) > 0){
      const cell = this.pickFreeCell(occupied);
      if (cell){
        this.weaponCell = cell;
        const pos = this.cellToXY(cell.x, cell.y);
        this.weaponSpr = this.add.sprite(this.snap(pos.x), this.snap(pos.y), 'weapon_icon')
          .setOrigin(0.5, 1)
          .setDepth(9)
          .setDisplaySize(Math.floor(this._isoW*0.8), Math.floor(this._isoH*0.9));
        this.fieldLayer.add(this.weaponSpr);
      }
    }

    // --- KEY（ゲートカード）をランダム配置 ---
    this.keySpr && (()=>{ try{ this.keySpr.destroy(); }catch(_){} this.keySpr=null; })();
    this.keyCell = null;

    const keyDef = pickupDefs.find(p => p.type === 'key');
    if (keyDef && (keyDef.count|0) > 0){
      const cell = this.pickFreeCell(occupied); // 既存のヘルパを再利用
      if (cell){
        this.keyCell = cell;
        const pos = this.cellToXY(cell.x, cell.y);
        this.keySpr = this.add.sprite(this.snap(pos.x), this.snap(pos.y), 'key_icon')
          .setOrigin(0.5, 1)
          .setDepth(9)
          .setDisplaySize(Math.floor(this._isoW*0.8), Math.floor(this._isoH*0.9));
        this.fieldLayer.add(this.keySpr);
      }
    }
    // ランダム空きセルを一つ取るヘルパ
    const pickFreeCell = () => {
      for (let tries=0; tries<100; tries++){
        const rx = Phaser.Math.Between(0, this.gridW-1);
        const ry = Phaser.Math.Between(0, this.gridH-1);
        const k = occKey(rx,ry);
        if (!occupied.has(k)) {
          occupied.add(k);
          return {x:rx, y:ry};
        }
      }
      // フォールバック（最悪、スタートから掃く）
      for (let y=0; y<this.gridH; y++){
        for (let x=0; x<this.gridW; x++){
          const k = occKey(x,y);
          if (!occupied.has(k)) { occupied.add(k); return {x,y}; }
        }
      }
      return null;
    };

    // --- アイテムボックス（インベントリUI）初期化 ---
    this.inventory = { weapon:false, key:false };
    this.renderItemBox();
    // レベル定義からモンスター数を取得（未指定は0）
    const enemyDefs = Array.isArray(this.level?.enemies) ? this.level.enemies : [];
    enemyDefs.forEach(def=>{
      const type = def.type || 'monster-a';
      const count = Math.max(0, def.count|0 || 0);
      for (let i=0; i<count; i++){
        const cell = pickFreeCell();
        if (!cell) break;

        const pos = this.cellToXY(cell.x, cell.y);
        const spr = this.add.sprite(this.snap(pos.x), this.snap(pos.y), 'monsterA_idle1')
          .setOrigin(0.5, 1)
          .setDepth(8) // goal(5)とrobot(10)の間
          .setDisplaySize(Math.floor(this._isoW * 1.2), Math.floor(this._isoH * 1.6)) /* monster size */
          .play('monsterA_idle', true);

        this.fieldLayer.add(spr);
        // 管理用に保持（将来の当たり判定などで利用）
        (this.monsters || (this.monsters=[])).push({ type, cell, spr });
      }
    });

    // クリア条件パネルに初期文言（あれば）を表示
    try {
      const t = document.getElementById('mission-clear-text');
      if (t) {
        const conds = this.level?.clear?.conditions || [];
        if (conds.length) {
          t.innerHTML = conds.map(c => 
            `<div class="cc-item"><span class="cc-check">⬜️</span><span class="cc-text">${c.text}</span></div>`
          ).join('');
        }
      }
    } catch(_) {}

    this.emitMissionStart();
    if (showTitle) {
      const title = `ミッション ${this.missionIndex + 1}: ${L.id ?? ''}`;
      this.showMissionTitle(title, () => {});
    } else {
      document.body.classList.remove('ui-locked', 'boot');
    }
  }

  emitMissionStart() {
    document.dispatchEvent(
      new CustomEvent('hkq:mission-start', {
        detail: { mission: this.missionIndex, level: this.level }
      })
    );
  }
  showMissionTitle(text, onDone) {
    const W = this.scale.gameSize.width,
          H = this.scale.gameSize.height;
    try { this.titleText?.destroy(); } catch (_) {}
    const t = this.add.text(W / 2, H * 0.15, text, {
      fontSize: '40px',
      color: '#ffffff',
      fontFamily: "system-ui, -apple-system, 'Noto Sans JP', sans-serif",
    })
      .setOrigin(0.5)
      .setAlpha(0);
    this.titleText = t;
    document.body.classList.add('ui-locked');
    this.tweens.add({
      targets: t,
      alpha: 1,
      y: H * 0.18,
      duration: 300,
      ease: 'quad.out',
      yoyo: true,
      hold: 700,
      onComplete: () => {
        try { t.destroy(); } catch (_) {}
        this.titleText = null;
        document.body.classList.remove('ui-locked', 'boot');
        onDone && onDone();
      }
    });
  }
  isAtGoal() {
    if (!this.goalCell || !this.robotCell) return false;
    if (this.robotCell.x === this.goalCell.x && this.robotCell.y === this.goalCell.y)
      return true;

    if (this.robotSpr && this.goalSpr) {
      const dx = Math.abs(this.robotSpr.x - this.goalSpr.x);
      const dy = Math.abs(this.robotSpr.y - this.goalSpr.y);
      const tol = Math.max(2, Math.floor(this.cellSize * 0.2));
      return dx <= tol && dy <= tol;
    }
    return false;
  }

  handleGoalReached() {
    this._cleared = true;
    this.robotSpr.play('robot_cheer', true);
    document.dispatchEvent(
      new CustomEvent('hkq:mission-cleared', {
        detail: { mission: this.missionIndex }
      })
    );
    this.time.delayedCall(900, () => {
      this.robotSpr.play('robot_cheer', true);
      this.time.delayedCall(900, () => {
        const last = (this.levels?.length || 1) - 1;
        if (this.missionIndex < last) {
          const nextIdx = this.missionIndex + 1;
          const nextTitle = `ミッション ${nextIdx + 1}: ${this.levels[nextIdx]?.id ?? ''}`;
          this.showMissionTitle(nextTitle, () => {
            this.missionIndex = nextIdx;
            this.buildLevel(true);
          });
        } else {
          this.showMissionTitle('Mission Complete!', () => {
            this.missionIndex = 0;
            this.buildLevel(true);
          });
        }
      });
    });
  }
  onTick(op) {
    if (this._cleared) return;
    const DIR = {
      up: { dx: 0, dy: -1 }, down: { dx: 0, dy: 1 },
      right: { dx: 1, dy: 0 }, left: { dx: -1, dy: 0 },
      '↑': { dx: 0, dy: -1 }, '↓': { dx: 0, dy: 1 },
      '→': { dx: 1, dy: 0 }, '←': { dx: -1, dy: 0 },
      まえ: { dx: 0, dy: -1 }, うしろ: { dx: 0, dy: 1 },
      みぎ: { dx: 1, dy: 0 }, ひだり: { dx: -1, dy: 0 },
    };
    const dir = DIR[op];
    if (!dir) return;

    const nx = Phaser.Math.Clamp(this.robotCell.x + dir.dx, 0, this.gridW - 1);
    const ny = Phaser.Math.Clamp(this.robotCell.y + dir.dy, 0, this.gridH - 1);
    this.robotCell = { x: nx, y: ny };

    // 移動イベント（セル座標）
    document.dispatchEvent(new CustomEvent('hkq:move', { detail: { pos: { x: nx, y: ny } } }));

    this.showDirectionIcon(op, nx, ny);

    const p = this.cellToXY(nx, ny);
    this.robotSpr.play('robot_walk', true);
    this.tweens.add({
      targets: this.robotSpr,
      x: this.snap(p.x), y: this.snap(p.y),
      duration: 260, ease: 'quad.out',
      onComplete: () => {
        if (this._cleared) return;

        const cx = nx, cy = ny;

        // 1) WEAPON拾得（同マス＆未取得なら）
        if (this.weaponCell && cx === this.weaponCell.x && cy === this.weaponCell.y && !this.inventory.weapon) {
          this.inventory.weapon = true;
          try { this.weaponSpr?.destroy(); } catch(_) {}
          this.weaponSpr = null;
          this.renderItemBox();
          document.dispatchEvent(new CustomEvent('hkq:item-pick', { detail:{ id:'weapon' }}));
        }
        // 2) ENEMY（同マスにいる？）
        const enemy = (this.monsters || []).find(m => m.cell.x === cx && m.cell.y === cy);
        if (enemy) {
          if (this.inventory.weapon){
            // ★ 先に途中演出を再生 → 終了後に撃破処理
            this.playMidCutscene('assets/cutscene/monster_battle.png', () => {
              try { enemy.spr.destroy(); } catch(_) {}
              this.monsters = this.monsters.filter(m => m !== enemy);
              document.dispatchEvent(new CustomEvent('hkq:enemy-down', { detail:{ type:'monster-a' }}));

              if (!this.inventory.key) {
                this.inventory.key = true;
                this.renderItemBox();
                document.dispatchEvent(new CustomEvent('hkq:item-pick', { detail:{ id:'key' }}));
              }

              this.robotSpr.play('robot_idle', true);
              document.dispatchEvent(new CustomEvent('hkq:tick'));
            });
            return;
          } else {
            // 武器なし → 失敗＆リスタート
//            this.showMissionFailAndRestart('モンスターにやられた…');
            this.playFailCutscene('assets/cutscene/mission-failed1.png', () => {
              this.scene.restart({ missionIndex: this.missionIndex });
             });
            return;
          }
        }
        // 3) KEY拾得（同マス＆未取得なら）
        if (this.keyCell && cx === this.keyCell.x && cy === this.keyCell.y && !this.inventory.key) {
          this.inventory.key = true;
          try { this.keySpr?.destroy(); } catch(_) {}
          this.keySpr = null;
          this.renderItemBox();
          // Mission 側のインベントリと連動（obtain 条件で評価される）
          document.dispatchEvent(new CustomEvent('hkq:item-pick', { detail:{ id:'key' }}));
        }
        // 4) GOAL（鍵が必要）
        if (this.isAtGoal()) {
          if (this.inventory.key) {
            document.dispatchEvent(new CustomEvent('hkq:reach-goal', { detail:{ pos:{ x: cx, y: cy }}}));
            this.playCutsceneThen(() => this.handleGoalReached());
            return;
          } else {
            this.robotSpr.play('robot_sad', true); // しょんぼり表示
            this.playFailCutscene('assets/cutscene/mission-failed2.png', () => {  
              this.scene.restart({ missionIndex: this.missionIndex });
            });
            return;
          }
        }

        // 4) 通常
        this.robotSpr.play('robot_idle', true);
        document.dispatchEvent(new CustomEvent('hkq:tick'));
      }
    });
  }

  cellToXY(x, y) {
    const sx = isoX(x, y, this._isoW, this._isoH) + (this._baseIsoX || 0);
    const sy = isoY(x, y, this._isoW, this._isoH);
    const OFFSET_Y = -10;
    return { x: this.snap(sx), y: this.snap(sy + OFFSET_Y) };
  }
  renderItemBox(){
    const box = document.getElementById('item-box');
    if (!box) return;
    const slots = box.querySelectorAll('.slot');
    // 全スロット初期化
    slots.forEach(s=>{ s.classList.remove('on'); s.innerHTML=''; });
    // weapon
    if (this.inventory.weapon && slots[0]){
      slots[0].classList.add('on');
      slots[0].innerHTML = `<img src="assets/weapon/blaster-a.png" alt="weapon" style="width:90%;height:auto;">`;
    }
    // key
    if (this.inventory.key && slots[1]){
      slots[1].classList.add('on');
      slots[1].innerHTML = `<img src="assets/items/gatecard.png" alt="key" style="width:90%;height:auto;">`;
    }
  }

    showMissionFailAndRestart(message='Mission失敗'){
    // 失敗UI（軽いトースト）
    try {
      const el = document.getElementById('mission-clear-text');
      if (el){
        const div = document.createElement('div');
        div.textContent = `【${message}】`;
        div.style.color = '#c00';
        div.style.fontWeight = 'bold';
        div.style.marginTop = '6px';
        el.appendChild(div);
      }
    } catch(_){}

    // 少し待ってリスタート
    this.time.delayedCall(700, ()=>{
      this.scene.restart({ missionIndex: this.missionIndex }); // 既存の再読込に合わせて調整
    });
  }

}

