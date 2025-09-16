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

  preload() {
    this.load.json('levels', 'hkq-levels.json');

    // 画像アセット
    this.load.image('robot_idle0', 'assets/robot/idle/character_robot_idle0.png');
    this.load.image('robot_idle1', 'assets/robot/idle/character_robot_idle1.png');
    for (let i = 0; i <= 7; i++) {
      this.load.image(`robot_walk${i}`, `assets/robot/walk/character_robot_walk${i}.png`);
    }
    this.load.image('robot_cheer0', 'assets/robot/cheer/character_robot_cheer0.png');
    this.load.image('robot_cheer1', 'assets/robot/cheer/character_robot_cheer1.png');
    this.load.image('goal_png', 'assets/floor/moon_base_goal.png');

    // 床タイル
    this.load.image('floor_moon', 'assets/floor/moon.png');

    // 方向アイコン
    this.load.image('arrow-nw', 'assets/direction/arrow-nw.png');
    this.load.image('arrow-ne', 'assets/direction/arrow-ne.png');
    this.load.image('arrow-se', 'assets/direction/arrow-se.png');
    this.load.image('arrow-sw', 'assets/direction/arrow-sw.png');
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
  }

  snap(v) { return Math.round(v); }

  buildLevel(showTitle) {
    const L = this.levels[this.missionIndex] || {};
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

    this.goalCell = pickGoalFromSpec(this.gridW, this.gridH, this.startCell, L.goalSpec);

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
        detail: { mission: this.missionIndex }
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

    this.showDirectionIcon(op, nx, ny);

    const p = this.cellToXY(nx, ny);
    this.robotSpr.play('robot_walk', true);
    this.tweens.add({
      targets: this.robotSpr,
      x: this.snap(p.x), y: this.snap(p.y),
      duration: 260, ease: 'quad.out',
      onComplete: () => {
        if (this._cleared) return;
        if (this.isAtGoal()) this.handleGoalReached();
        else this.robotSpr.play('robot_idle', true);
      },
    });
  }

  cellToXY(x, y) {
    const sx = isoX(x, y, this._isoW, this._isoH) + (this._baseIsoX || 0);
    const sy = isoY(x, y, this._isoW, this._isoH);
    const OFFSET_Y = -10;
    return { x: this.snap(sx), y: this.snap(sy + OFFSET_Y) };
  }
}