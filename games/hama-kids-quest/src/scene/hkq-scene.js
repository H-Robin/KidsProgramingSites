// games/hama-kids-quest/src/scene/hkq-scene.js
import { isoX, isoY, fieldSize } from '../render/iso-math.js';
import { buildTileLayer } from '../render/tilemap-renderer.js';
import { loadLevels, pickGoalFromSpec } from '../data/level-loader.js';
import { Mission, getLifeCountFrom } from './hkq-mission.js';
import * as Cut from './modules/cutscene.js';
import * as Inter from './modules/interactions.js';
import * as Warp from './modules/warp.js';
import * as Builder from './modules/builder.js';
import * as UI from './modules/ui.js';
import { createCoreAnimations } from './modules/animations.js';
import { ensureCoreReady } from './modules/loader.js';
import { HKQ_EVENTS } from '../common/events.js';

const ISO_ARROW = {
  up: 'arrow-nw',   // ↖︎
  right: 'arrow-ne',// ↗︎
  down: 'arrow-se', // ↘︎
  left: 'arrow-sw', // ↙︎
};

// Loader helpers moved to modules/loader.js

// createCoreAnimations moved to modules/animations.js

export class HkqScene extends Phaser.Scene {
  /**
   * HkqScene
   * 処理概要:
   *  - シーン共通フラグ（カットシーン再生中/入力ロック中）を初期化
   *  - シーンキーを 'HkqScene' に固定
   */
  constructor() {
    super('HkqScene');
    this._cutscenePlaying = false;
    this._inputLocked = false;
    this._builtForMission = -1; // どのミッションを build 済みか
    this._building = false;     // 再入防止
  }

  /**
   * gotoMission(idx=0)
   * 処理概要:
   *  - Runner（命令実行器）のキューを強制クリア
   *  - ミッション番号を範囲内に正規化してセット
   *  - レベルを再構築（タイトル表示あり）
   * @param {number} idx
   */
  gotoMission(idx = 0) {
    this.clearRunnerQueue();
    const last = (this.levels?.length || 1) - 1;
    const clamped = Phaser.Math.Clamp(idx|0, 0, last);
    if (this._building) return;                 // 再入防止
    if (this._builtForMission === clamped) {    // 同じ面なら再buildしない
      this.updateBackground?.();
      return;
    }
    this._building = true;
    this.missionIndex = clamped;
    this.buildLevel(true);
    this.updateBackground?.();
    this._builtForMission = clamped;
    this._building = false;
  }

  // ---- Lock helpers -------------------------------------------------------

  /**
   * lockGame()
   * 処理概要:
   *  - ゲーム内の入力とUI操作をロック（カットシーン等の演出中に使用）
   */
  lockGame() {
    this._inputLocked = true;
    try { if (this.input.keyboard) this.input.keyboard.enabled = false; } catch(_) {}
    document.body.classList.add('ui-locked');
  }

  /**
   * unlockGame()
   * 処理概要:
   *  - ロック解除（演出終了時に呼び出し）
   */
  unlockGame() {
    this._inputLocked = false;
    try { if (this.input.keyboard) this.input.keyboard.enabled = true; } catch(_) {}
    document.body.classList.remove('ui-locked');
  }

  /** 内部: 占有セル用キー作成 */
  occKey(x, y) { return `${x},${y}`; }
  /** 内部: 占有セル集合に追加 */
  addOccupied(set, x, y) { set.add(this.occKey(x, y)); }

  /**
   * pickFreeCell(occupied)
   * 処理概要:
   *  - 占有セル集合を避けて空きマスをランダムに探索
   *  - 一定回数失敗したら走査で補完
   * @param {Set<string>} occupied
   * @returns {{x:number,y:number}|null}
   */
  pickFreeCell(occupied) {
    for (let i = 0; i < 100; i++) {
      const x = Phaser.Math.Between(0, this.gridW - 1);
      const y = Phaser.Math.Between(0, this.gridH - 1);
      const k = this.occKey(x, y);
      if (!occupied.has(k)) { occupied.add(k); return { x, y }; }
    }
    for (let y = 0; y < this.gridH; y++) {
      for (let x = 0; x < this.gridW; x++) {
        const k = this.occKey(x, y);
        if (!occupied.has(k)) { occupied.add(k); return { x, y }; }
      }
    }
    return null;
  }

  // ---- Assets -------------------------------------------------------------

  /**
   * アセットの事前読み込み
   * 概要:
   *  - レベルデータ（JSON）と各種アセット（ロボ/敵/床/ゴール/矢印/背景）をロード
   *  - 画像はキー名で参照できるよう登録
   * @returns {void}
   */
  preload() {
    //this.load.json('levels', 'assets/data/hkq-levels.json');

    // Robot
    this.load.image('robot_idle0', 'assets/robot/idle/character_robot_idle0.png');
    this.load.image('robot_idle1', 'assets/robot/idle/character_robot_idle1.png');
    for (let i = 0; i <= 7; i++) {
      this.load.image(`robot_walk${i}`, `assets/robot/walk/character_robot_walk${i}.png`);
    }
    this.load.image('robot_cheer0', 'assets/robot/cheer/character_robot_cheer0.png');
    this.load.image('robot_cheer1', 'assets/robot/cheer/character_robot_cheer1.png');
    // しょんぼり
    this.load.image('robot_sad0', 'assets/robot/sad/sad0.png');
    this.load.image('robot_sad1', 'assets/robot/sad/sad1.png');
    this.load.image('robot_sad2', 'assets/robot/sad/sad2.png');

    // Items / Enemy / Tiles
//    this.load.image('goal_png', 'assets/floor/moon_base_goal.png');
    this.load.image('key_icon', 'assets/items/gatecard.png'); //月面基地入館用
    this.load.image('portalkey_icon', 'assets/items/portalkey.png'); // ポータルゲート用
    this.load.image('weapon_icon', 'assets/weapon/blaster-a.png');
    this.load.image('monsterA_idle0', 'assets/enemy/monster-a/idle/idle0.png');
    this.load.image('monsterA_idle1', 'assets/enemy/monster-a/idle/idle1.png');
    this.load.image('floor_moon', 'assets/floor/moon.png');

    // Direction icons
    this.load.image('arrow-nw', 'assets/direction/arrow-nw.png');
    this.load.image('arrow-ne', 'assets/direction/arrow-ne.png');
    this.load.image('arrow-se', 'assets/direction/arrow-se.png');
    this.load.image('arrow-sw', 'assets/direction/arrow-sw.png');

    this.load.image('bg_moon', 'assets/wallpaper/moon.png');
    // 設計図アイコン（新規）
    this.load.image('blueprint_icon', 'assets/items/blueprint1.png');

    // Obstacles / Gates（ルート探索用）
    this.load.image('ob_rock',     'assets/floor/rock.png');
    this.load.image('ob_wall',     'assets/floor/wall.png');
    this.load.image('gate_closed', 'assets/floor/closed-gate.png');
    this.load.image('gate_opened', 'assets/floor/opened-gate2.png');
    this.load.image('portalgate',  'assets/floor/opened-gate.png');
  }

    
  // ---- Cutscenes (success / mid / fail) ----------------------------------

  // 条件/Cutscene ユーティリティ（委譲）
  getCondition(predicate) { return Cut.getCondition(this, predicate); }
  getCondCutscene(cond, resultType) { return Cut.getCondCutscene(cond, resultType); }
  getDefaultCutscene(category, resultType) { return Cut.getDefaultCutscene(this, category, resultType); }
  getConditionsList() { return Cut.getConditionsList(this); }
  /**
   * 成功カットシーンの再生とコールバック実行
   * 概要:
   *  - レベル定義のカットシーン画像を全画面表示（In→Hold→Out）
   *  - 再生中は lock、終了時に unlock → next() を呼ぶ
   * @param {Function} [next] - 再生完了後のコールバック
   * @param {string}   [overridePath] - 画像パスの上書き（省略時はレベル定義を使用）
   * @returns {void}
   */
  // 新: 第2引数 overridePath でパス上書き可
  playCutsceneThen(next, overridePath) { return Cut.playCutsceneThen(this, next, overridePath); }
  /**
   * 途中（ミッド）カットシーンの再生
   * 概要:
   *  - 途中演出のカットシーンを表示（lock/unlock は成功と同じ）
   * @param {string} path  - 画像ファイルパス
   * @param {Function} [next] - 再生完了後のコールバック
   * @returns {void}
   */
    playMidCutscene(path, next) { return Cut.playMidCutscene(this, path, next); }

  /**
   * 失敗カットシーンの再生
   * 概要:
   *  - 失敗演出のカットシーンを表示（最後に Runner キューを確実にクリア）
   *  - 終了時に unlock し、next() を呼ぶ（多くは restart）
   * @param {string} path - 画像ファイルパス
   * @param {Function} [next] - 再生完了後のコールバック
   * @returns {void}
   */
  playFailCutscene(path, next) { return Cut.playFailCutscene(this, path, next); }

  /**
   * シーン初期化（restart 時の引き継ぎ）
   * 概要:
   *  - restart 時に渡された missionIndex を引き継ぐ
   * @param {{missionIndex?:number}} [data]
   * @returns {void}
   */
  init(data) {
    if (data && Number.isFinite(data.missionIndex)) {
      this.missionIndex = data.missionIndex;
    }
  }

  // ---- Scene lifecycle ----------------------------------------------------

  /**
   * シーン生成（Phaser lifecycle）
   * 概要:
   *  - レベルデータ読込・ミッション番号の安全化
   *  - アニメーション一度だけ構築 → レベル生成 → 背景反映
   *  - 画面リサイズ時に背景のみ調整
   * @returns {void}
   */
  create() {
    if (!Number.isFinite(this.missionIndex)) this.missionIndex = 0;
    const last = (this.levels?.length || 1) - 1;
    if (this.missionIndex < 0 || this.missionIndex > last) this.missionIndex = 0;

    // ★ コアアセット読み込み → アニメ生成完了を待つ（Promise）
    (async () => {
      await ensureCoreReady(this);
      // scene-ready を通知（UI/メインがフック可能）
      document.dispatchEvent(new CustomEvent(HKQ_EVENTS.SCENE_READY, { detail: { key: this.scene.key } }));
      // すでに levels が注入済みならこの場で 1 回だけビルド
      if (Array.isArray(this.levels) && this.levels.length) {
        this.gotoMission(this.missionIndex | 0);
        this.updateBackground?.();
      }
    })();

    // ★ JSON 注入待ち（hkq-main.js が投げるイベントを一度だけ受け取る）
    const onSetLevels = (e) => {
      if (this._building) return; // 再入防止
      this.levels = e?.detail?.levels || [];
      this.missionIndex = Number.isFinite(e?.detail?.startIdx) ? (e.detail.startIdx|0) : 0;
      this.gotoMission(this.missionIndex);
      this.updateBackground?.();
    };
    document.addEventListener(HKQ_EVENTS.SET_LEVELS, onSetLevels, { once:true });

    // Resize handling（連続 resize をデバウンス）
    this._lastSize = { w: this.scale.width, h: this.scale.height };
    this._resizeTid = null;
    this.scale.on('resize', () => {
      const w = this.scale.width, h = this.scale.height;
      if (Math.abs(w - this._lastSize.w) < 8 && Math.abs(h - this._lastSize.h) < 8) return;
      clearTimeout(this._resizeTid);
      this._resizeTid = setTimeout(() => {
        this._lastSize = { w, h };
        // レベル再構築はしない（背景のみ調整）
        this.updateBackground?.();
      }, 120);
    });

    const sc = this; // Sceneインスタンスをキャプチャ
    document.addEventListener(HKQ_EVENTS.LIFE_ZERO, () => {
      const level = sc.levels?.[sc.missionIndex ?? 0] || sc.level;
      const conds = level?.clear?.conditions || [];
      const lifeCond = conds.find(c => (c.type === 'life0' || c.id === 'life_zero'));
      const failPath = lifeCond?.cutscenes?.fail || 'assets/cutscene/mission-failed3.png';
      const maxLife = getLifeCountFrom(level);

      sc.playFailCutscene(failPath, () => {
        sc.buildLevel(true);  // リスタート時は buildLevel でOK（画像は既にロード済）
      });
      document.dispatchEvent(new CustomEvent(HKQ_EVENTS.MISSION_START, { detail:{ level } }));
      document.dispatchEvent(new CustomEvent(HKQ_EVENTS.LIFE_CHANGED,   { detail:{ value:maxLife } }));
      window.HKQ_LIFE_MAX = maxLife;
      window.HKQ_LIFE     = maxLife;
    });
  }


  /**
   * 方向アイコンの一時表示
   * 概要:
   *  - 一手の移動時にアイソメ矢印をふわっと表示 → 自動消滅
   * @param {'up'|'down'|'left'|'right'} dirKey - 方向キー
   * @param {number} cellX - グリッドX
   * @param {number} cellY - グリッドY
   * @returns {void}
   */
  showDirectionIcon(dirKey, cellX, cellY) {
    const key = ISO_ARROW[dirKey];
    if (!key) return;
    const p = this.cellToXY(cellX, cellY);
    const spr = this.add.image(p.x, p.y, key).setOrigin(0.5, 1).setDepth(50).setScale(0.9);
    spr.setAlpha(0);
    this.tweens.add({
      targets: spr, alpha: 1, y: p.y - 8, duration: 150, ease: 'quad.out',
      yoyo: true, hold: 100, onComplete: () => spr.destroy()
    });
  }

  /**
   * createAnimations()
   * 処理概要:
   *  - アニメーション（robot/monster）をゲーム単位で一度だけ作成
   *  - シーン再起動時の重複登録を回避
   */
  createAnimations() {
    if (this.sys.game.__hkqAnimsBuilt) return;
    this.sys.game.__hkqAnimsBuilt = true;

    this.anims.create({ key: 'robot_idle',
      frames: [{ key: 'robot_idle0' }, { key: 'robot_idle1' }],
      frameRate: 2, repeat: -1
    });
    this.anims.create({ key: 'robot_walk',
      frames: Array.from({ length: 8 }, (_, i) => ({ key: `robot_walk${i}` })),
      frameRate: 10, repeat: -1
    });
    this.anims.create({ key: 'robot_cheer',
      frames: [{ key: 'robot_cheer0' }, { key: 'robot_cheer1' }],
      frameRate: 6, repeat: -1
    });
    this.anims.create({ key: 'monsterA_idle',
      frames: [{ key: 'monsterA_idle0' }, { key: 'monsterA_idle1' }],
      frameRate: 2, repeat: -1
    });
    this.anims.create({ key: 'robot_sad',
      frames: [{ key: 'robot_sad1' }, { key: 'robot_sad2' }, { key: 'robot_sad3' }],
      frameRate: 6, repeat: -1
    });
  }

    /**
     * アニメ再生の安全ヘルパ
     * @param {Phaser.GameObjects.Sprite} spr - スプライト
     * @param {string} key - アニメーションキー
     * @param {string} [fallbackFrameKey] - 未登録時に使用する静的フレームキー
     * @returns {void}
     */
  safePlay(spr, key, fallbackFrameKey) {
    if (!spr) return;
    if (this.anims?.exists?.(key)) {
      spr.play(key, true);
    } else if (fallbackFrameKey) {
      // アニメが未登録でも見た目が消えないように保険
      spr.setTexture(fallbackFrameKey);
    }
  }

  /**
   * ピクセル位置の丸め
   * @param {number} v - 値
   * @returns {number} 丸め後の値
   */
  snap(v) { return Math.round(v); }

  /**
   * ピックアップの配置
   * @param {{x?:number,y?:number}} def - 定義（座標が無ければ空きマスへ）
   * @param {string} texKey - テクスチャキー
   * @param {(cell:{x:number,y:number}, spr:Phaser.GameObjects.Sprite)=>void} setTo - 参照を保持するsetter
   * @returns {void}
   */
  placePickup(def, texKey, setTo) {
    // 座標があればそのマス、なければ空きマス
    const cell = (Number.isFinite(def.x) && Number.isFinite(def.y))
      ? { x:def.x|0, y:def.y|0 }
      : this.pickFreeCell(this._occupiedForPickups);

    if (!cell) return;

    const pos = this.cellToXY(cell.x, cell.y);
    const spr = this.add.sprite(this.snap(pos.x), this.snap(pos.y), texKey)
      .setOrigin(0.5, 1).setDepth(9)
      .setDisplaySize(Math.floor(this._isoW*0.8), Math.floor(this._isoH*0.9));
    this.fieldLayer.add(spr);
    setTo(cell, spr);
  }
  // ---- Build a level ------------------------------------------------------

  /**
   * レベル構築
   * 概要:
   *  - Runner キューの完全クリア（前ミッション残りを無効化）
   *  - グリッド/開始位置/コマンド上限/背景など、レベル要素を組み立て
   *  - UI へ上限を通知し、タイトル表示やインベントリも初期化
   * @param {boolean} showTitle - タイトル演出を表示するか
   * @returns {void}
   */
  buildLevel(showTitle) {
    console.log('[DBG] buildLevel once:',
        { idx: this.missionIndex, id: this.levels?.[this.missionIndex]?.id });
    // --- Restart reset: インベントリとUIを初期化（必ず鍵は未所持へ） ---
    this.inventory = this.inventory || {};
    this.inventory.key = false;        // ← 重要：ゲートは閉に戻したいので false
    // （必要なら）武器等も同時に初期化
    this.inventory.weapon = false;
    // 既存のピックアップ表示が残っていたら消す
    try { this.keySpr?.destroy(); } catch(_) {}
    this.keySpr = null;
    try { this.weaponSpr?.destroy(); } catch(_) {}
    this.weaponSpr = null;
    // 旧ポータルキー片付け（単体/配列の両方をケア）
    if (Array.isArray(this.portalKeys)) {
      this.portalKeys.forEach(k => { try { k.spr?.destroy(); } catch(_) {} });
    }
    this.portalKeys = [];
    try { this.portalKeySpr?.destroy(); } catch(_) {}
    this.portalKeySpr = null;
    this.portalKeyCell = null;
    // アイテムボックスも空表示へ
    this.renderItemBox?.();

    const btn = document.getElementById("btn-toggle-mission");
    const sr = btn.querySelector(".sr-only");

    btn.addEventListener("click", () => {
      const isPressed = btn.getAttribute("aria-pressed") === "true";
      // aria-pressed をトグル
      btn.setAttribute("aria-pressed", String(!isPressed));

      // sr-only のテキスト切り替え
      if (!isPressed) {
        sr.textContent = "ミッションタスク非表示"; // 表示中 → 非表示にできる
      } else {
        sr.textContent = "ミッションタスク表示";   // 非表示中 → 表示にできる
      }
    });
//    this.createAnimations(); // 念のため常に先に登録（重複は内部で弾く）
    this.clearRunnerQueue();   // ミッション開始の度に必ずキューを空に
    const L = this.levels[this.missionIndex] || {};
    this.level = L;

    const label = document.getElementById('level-id-label');
    if (label) {
      const idText = (L && L.id) ? String(L.id) : '(no id)';
      label.textContent = `ID: ${idText}`;
      // 長いIDなら省略表示にしたい場合は CSS で text-overflow を指定すると◎
    }
    this.gridW = L.gridW ?? 6;
    this.gridH = L.gridH ?? 8;

    const startX = L.robot?.x ?? 0;
    const startY = L.robot?.y ?? this.gridH - 1;
    this.startCell = { x: startX, y: startY };

    this.cmdCap = Number.isFinite(L.cmdCap) ? L.cmdCap : 10;
    this.repeatInnerCap = Number.isFinite(L.repeatInnerCap) ? L.repeatInnerCap : 3;

    // UIへ通知（レベル切り替え時）
    document.dispatchEvent(new CustomEvent(HKQ_EVENTS.LIMITS, {
      detail: { cmdCap: this.cmdCap, repeatInnerCap: this.repeatInnerCap }
    }));

    const W = this.scale.gameSize.width;
    const H = this.scale.gameSize.height;
    const pad = 16;
    const availW = W - pad * 2, availH = H - pad * 2;

    const cell = Math.floor(Math.min(availW / this.gridW, availH / this.gridH) * 0.5);
    const DIAMOND_RATIO = 0.55;
    const isoW = Math.max(32, Math.floor(cell * 2));
    const isoH = Math.max(16, Math.floor(isoW * DIAMOND_RATIO));

    const fIsoW = Math.floor(isoW * 1.0);
    const fIsoH = Math.floor(isoH * 1.0);

    const f = fieldSize(this.gridW, this.gridH, fIsoW, fIsoH);
    const alignX = 0.7;
    const x0 = this.snap(pad + (availW - f.width) * alignX);
    const y0 = this.snap(pad + (availH - f.height) / 2);

    this._fieldBounds = { x: x0, y: y0, w: f.width, h: f.height };

    this.cameras.main.setBackgroundColor('#0b1020');
    this.fieldLayer?.destroy(true);
    this.fieldLayer = this.add.container(x0, y0);

   // --- サブレイヤー分割（床/ゴール用と役者用） ---
    this.groundLayer?.destroy(true);
    this.actorLayer?.destroy(true);
    this.groundLayer = this.add.container(0, 0);
    this.actorLayer  = this.add.container(0, 0);
    this.fieldLayer.add(this.groundLayer); // 奥：床・ゴール
    this.fieldLayer.add(this.actorLayer);  // 手前：ロボ・敵・アイテム

    this._baseIsoX = (this.gridH - 1) * (fIsoW / 2);

    const tiles = buildTileLayer(this, this.gridW, this.gridH, fIsoW, fIsoH, 'floor_moon', {
      gap: 2, lineColor: 0x44506b, lineAlpha: 1, baseIsoX: this._baseIsoX
    });
    this.groundLayer.add(tiles);
    if (window.clearRunnerQueue) window.clearRunnerQueue();

    // ゴール位置：level.goal を優先。なければ spec に従う
    this.goalCell = (L.goal && Number.isFinite(L.goal.x) && Number.isFinite(L.goal.y))
      ? { x: L.goal.x, y: L.goal.y }
      : pickGoalFromSpec(this.gridW, this.gridH, this.startCell, L.goalSpec);

    this._isoW = isoW; this._isoH = isoH;

    // ---- portals（座標ペアワープ）を正規化して保持 ----
    this.portals = Array.isArray(L.portals) ? L.portals.map(p => ({
      a: { x: (p?.a?.x|0), y: (p?.a?.y|0) },
      b: { x: (p?.b?.x|0), y: (p?.b?.y|0) },
      requires: Array.isArray(p?.requires) ? p.requires.slice() : [],
      bidirectional: (p?.bidirectional !== false)
    })) : [];

    // Goal sprite
    const gpx = this.cellToXY(this.goalCell.x, this.goalCell.y);
    this.goalSpr?.destroy();


    // JSON側が指定されていればそれを使う
    const goalPath = this.level?.goalIcon;
    // 専用テクスチャキー（キーに '?v=' は付けない）
    const texKey = `goal:${goalPath}`;
    console.debug('[DBG] goalPath=', goalPath, ' texKey=', texKey, ' level.id=', this.level?.id);

    // ゴール座標が外れていても動くように保険
    this.goalCell.x = Phaser.Math.Clamp(this.goalCell.x, 0, this.gridW - 1);
    this.goalCell.y = Phaser.Math.Clamp(this.goalCell.y, 0, this.gridH - 1);
    if (!this.textures.exists(texKey)) {
      this.load.image(texKey, goalPath);
      this.load.once('complete', () => {
        this.goalSpr = this.add.image(this.snap(gpx.x), this.snap(gpx.y), texKey)
          .setOrigin(0.5, 1)
          .setDisplaySize(Math.floor(isoW * 0.9), Math.floor(isoH * 1.3))
          .setDepth(5);
        this.groundLayer.add(this.goalSpr);
        
      });
      this.load.start();
    } else {
      this.goalSpr = this.add.image(this.snap(gpx.x), this.snap(gpx.y), texKey)
        .setOrigin(0.5, 1)
        .setDisplaySize(Math.floor(isoW * 0.9), Math.floor(isoH * 1.3))
        .setDepth(5);
      this.groundLayer.add(this.goalSpr);

    }

    // 占有セル集合：先に初期化しておく（この後で obstacles/pickups で使う）
    const occupied = new Set();
    occupied.add(this.occKey(this.startCell.x, this.startCell.y));
    occupied.add(this.occKey(this.goalCell.x,  this.goalCell.y));
    this._occupiedForPickups = occupied; // ★追加（ピックアップ共通で使用）
    // --- Obstacles (rock/wall/gate) from JSON ---
    this.obstacles = [];
    this.occObstacles = new Map();
    const obDefs = Array.isArray(L.obstacles) ? L.obstacles : [];

    obDefs.forEach(def => {
      const x = def.x|0, y = def.y|0;
      if (x<0||y<0||x>=this.gridW||y>=this.gridH) return;

      let key = null;
      switch (def.type) {
        case 'rock': key = 'ob_rock'; break;
        case 'wall': key = 'ob_wall'; break;
        case 'gate': key = (this.inventory?.key ? 'gate_opened' : 'gate_closed'); break;
        case 'portalgate':key = 'portalgate'; break;
      }
      if (!key) return;

      const pos = this.cellToXY(x, y);
      const spr = this.add.image(this.snap(pos.x), this.snap(pos.y), key)
        .setOrigin(0.5,1).setDepth(7)
        .setDisplaySize(Math.floor(this._isoW*0.7), Math.floor(this._isoH*1.0));
      this.groundLayer.add(spr);

      const ob = { x, y, type:def.type, pass:(def.pass||'never'), item:(def.item||null), spr };
      this.obstacles.push(ob);
      this.occObstacles.set(this.occKey(x,y), ob);

      // 占有セルとしてマーク（ピックアップ/敵の重なりを避ける）
      this.addOccupied(occupied, x, y);
    });

    // 初期状態のゲート見た目を整える（鍵未所持なら閉、所持なら開）
    this.refreshGates?.();

    // Robot sprite
    const spx = this.cellToXY(this.startCell.x, this.startCell.y);
    this.robotSpr?.destroy();
    this.robotSpr = this.add.sprite(this.snap(spx.x), this.snap(spx.y), 'robot_idle0')
      .setOrigin(0.5, 1).setDisplaySize(Math.floor(isoW * 0.7), Math.floor(isoH * 1.2)).setDepth(100)
      this.safePlay(this.robotSpr, 'robot_idle', 'robot_idle0');
    this.actorLayer.add(this.robotSpr);
    this.fieldLayer.bringToTop(this.robotSpr); // Container 内でロボットを最前面に移動

    this.cellSize = cell;
    this.robotCell = { ...this.startCell };
    this._cleared = false;

    // 旧ピックアップ片付け
    try { this.weaponSpr?.destroy(); } catch(_) {}
    this.weaponSpr = null;
    this.weaponCell = null;
    try { this.keySpr?.destroy(); } catch(_) {}
    this.keySpr = null;
    this.keyCell = null;

    // 旧モンスター片付け
    if (this.monsters?.length) this.monsters.forEach(m => { try { m.spr.destroy(); } catch(_) {} });
    this.monsters = [];

    // ピックアップ定義
    const pickupDefs = Array.isArray(L.pickups) ? L.pickups : [];

    // WEAPON（ヘルパで座標優先→無ければ空きマス）
    const weaponDef = pickupDefs.find(p => p.type === 'weapon');
    if (weaponDef) {
      this.placePickup(weaponDef, 'weapon_icon', (cell, spr) => {
        this.weaponCell = cell; this.weaponSpr = spr;
      }, occupied);
    }

    // KEY（count 未指定は 1 扱い。x,y が有効ならそこに置く）
    const keyDef = (Array.isArray(pickupDefs) ? pickupDefs : []).find(p => (p.type||'').toLowerCase() === 'key');
    const keyCount = Number.isFinite(keyDef?.count) ? (keyDef.count|0) : 1;
    this._hasKeyPickup = !!(keyDef && keyCount > 0);

    if (this._hasKeyPickup) {
      // まず JSON 指定座標を試す
      let cellK = null;
      if (Number.isFinite(keyDef.x) && Number.isFinite(keyDef.y)) {
        const kx = keyDef.x|0, ky = keyDef.y|0;
        const inBounds = (kx>=0 && ky>=0 && kx<this.gridW && ky<this.gridH);
        const blocked  = this.occObstacles?.has?.(this.occKey(kx,ky)) || occupied.has(this.occKey(kx,ky));
        if (inBounds && !blocked) cellK = { x:kx, y:ky };
      }
      // 置けなければ空きマスへ
      if (!cellK) cellK = this.pickFreeCell(occupied);

      if (cellK) {
        this.keyCell = cellK;
        const pos = this.cellToXY(cellK.x, cellK.y);
        this.keySpr = this.add.sprite(this.snap(pos.x), this.snap(pos.y), 'key_icon')
          .setOrigin(0.5,1).setDepth(9)
          .setDisplaySize(Math.floor(this._isoW * 0.8), Math.floor(this._isoH * 0.9));
        this.fieldLayer.add(this.keySpr);
        this.addOccupied(occupied, cellK.x, cellK.y);
      }
    }

    // PORTAL KEY（ワープ用キー）— 複数配置に対応
    const pkeyDefs = pickupDefs.filter(p => (p.type||'').toLowerCase() === 'portalkey');
    this._hasPortalKeyPickup = pkeyDefs.length > 0;
    this.portalKeys = [];
    pkeyDefs.forEach(def => {
      this.placePickup(def, 'portalkey_icon', (cell, spr) => {
        this.portalKeys.push({ cell, spr });
      }, occupied);
    });
    // --- BLUEPRINTS (設計図) ここから -------------
    const bpDef = (Array.isArray(L.pickups) ? L.pickups : []).find(p => p.type === 'blueprint');
    this.blueprints = [];                 // [{cell:{x,y}, spr:Phaser.GameObjects.Sprite}]
    this.blueprintTotal = 0;

    // 既存の占有セル集合 occupied を流用
    if (bpDef && (bpDef.count|0) > 0) {
      this.blueprintTotal = bpDef.count|0;
      for (let i = 0; i < this.blueprintTotal; i++) {
        const cell = this.pickFreeCell(occupied);
        if (!cell) break;
        const pos = this.cellToXY(cell.x, cell.y);
        const spr = this.add.sprite(this.snap(pos.x), this.snap(pos.y), 'blueprint_icon')
          .setOrigin(0.5, 1).setDepth(9)
          .setDisplaySize(Math.floor(this._isoW * 0.75), Math.floor(this._isoH * 0.85));
        this.actorLayer.add(spr);
        this.blueprints.push({ cell, spr });
      }
    }
    // --- BLUEPRINTS ここまで -------------

    // 敵配置
    const enemyDefs = Array.isArray(L.enemies) ? L.enemies : [];
    const pickFreeCell = () => {
      for (let tries = 0; tries < 100; tries++) {
        const rx = Phaser.Math.Between(0, this.gridW - 1);
        const ry = Phaser.Math.Between(0, this.gridH - 1);
        const k = this.occKey(rx, ry);
        if (!occupied.has(k)) { occupied.add(k); return { x: rx, y: ry }; }
      }
      for (let y = 0; y < this.gridH; y++) for (let x = 0; x < this.gridW; x++) {
        const k = this.occKey(x, y);
        if (!occupied.has(k)) { occupied.add(k); return { x, y }; }
      }
      return null;
    };

    enemyDefs.forEach(def => {
      const type = def.type || 'monster-a';
      const count = Math.max(0, def.count | 0 || 0);
      for (let i = 0; i < count; i++) {
        const cell = pickFreeCell();
        if (!cell) break;
        const pos = this.cellToXY(cell.x, cell.y);
        const spr = this.add.sprite(this.snap(pos.x), this.snap(pos.y), 'monsterA_idle0')
          .setOrigin(0.5, 1).setDepth(8)
          .setDisplaySize(Math.floor(this._isoW * 1.2), Math.floor(this._isoH * 1.6))
          this.safePlay(spr, 'monsterA_idle', 'monsterA_idle0');
        this.actorLayer.add(spr);
        (this.monsters || (this.monsters = [])).push({ type, cell, spr });
      }
      
    });

    // クリア条件UI更新
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
    } catch (_) {}

    this.emitMissionStart();

    if (showTitle) {
      const title = `ミッション ${this.missionIndex + 1}: ${L.id ?? ''}`;
      this.showMissionTitle(title, () => {});
    } else {
      document.body.classList.remove('ui-locked', 'boot');
    }

    // インベントリ初期化
    this.inventory =  { weapon:false, 
                        key:false, 
                        portalkey:false, 
                        blueprint:0 };    
//    this.inventory.blueprint = 0;
   // ポータル多重発火防止（ms）
    this._warpCooldownMs = 220;
    this._lastWarpAt = 0;
    this._lastWarpCell = null;
    // buildLevel() の末尾あたり
    this.mission = new Mission(this.level);
    this.mission.reset(this.level);   // ← 追加

    this.renderItemBox();
    this.updateBackground();

  }

  /**
   * emitMissionStart()
   * 処理概要:
   *  - 現在のミッション番号とレベル定義を DOM へ通知（UI/外部側がフック）
   */
  emitMissionStart() {
    document.dispatchEvent(new CustomEvent(HKQ_EVENTS.MISSION_START, {
      detail: { mission: this.missionIndex, level: this.level }
    }));
  }

  /**
   * showMissionTitle(text, onDone)
   * 処理概要:
   *  - 画面上部にタイトルをふわっと表示（In→Hold→Out）
   *  - 演出中は UI をロックし、終了時に解除してコールバック
   */
  showMissionTitle(text, onDone) {
    const W = this.scale.gameSize.width, H = this.scale.gameSize.height;
    try { this.titleText?.destroy(); } catch (_) {}
    const t = this.add.text(W / 2, H * 0.15, text, {
      fontSize: '40px', color: '#ffffff',
      fontFamily: "system-ui, -apple-system, 'Noto Sans JP', sans-serif",
    }).setOrigin(0.5).setAlpha(0);
    this.titleText = t;
    document.body.classList.add('ui-locked');
    this.tweens.add({
      targets: t, alpha: 1, y: H * 0.18, duration: 300, ease: 'quad.out',
      yoyo: true, hold: 700,
      onComplete: () => {
        try { t.destroy(); } catch (_) {}
        this.titleText = null;
        document.body.classList.remove('ui-locked', 'boot');
        onDone && onDone();
      }
    });
  }

  /**
   * ゴール到達判定
   * 概要:
   *  - ロボの現在セル/座標がゴールに到達しているかを厳密/近似で判定
   * @returns {boolean} 到達していれば true
   */
  isAtGoal() { return Inter.isAtGoal(this); }

  /**
   * ゴール到達時の処理
   * 概要:
   *  - ゴール到達時の演出 → 次ミッション/リセットへ遷移
   *  - 最終面ならコンプリート後に1面へ戻る
   * @returns {void}
   */
  handleGoalReached() { return Inter.handleGoalReached(this); }

  // ---- Tick (one op) ------------------------------------------------------

  /**
   * 1手（Tick）の処理
   * 概要:
   *  - 1手（↑↓→←）を処理。移動・演出・ピックアップ・敵判定・ゴール判定を包括
   *  - カットシーン中/ロック中/クリア後は進めない
   * @param {'up'|'down'|'left'|'right'|'↑'|'↓'|'→'|'←'|'まえ'|'うしろ'|'みぎ'|'ひだり'} op - 入力
   * @returns {void}
   */
  onTick(op) { return Inter.onTick(this, op); }

  /**
   * グリッド座標を画面座標へ変換
   * 概要:
   *  - グリッド座標→アイソメ座標へ変換（描画用オフセット含む）
   * @param {number} x - グリッドX
   * @param {number} y - グリッドY
   * @returns {{x:number,y:number}} 変換後の座標
   */
  cellToXY(x, y) {
    const sx = isoX(x, y, this._isoW, this._isoH) + (this._baseIsoX || 0);
    const sy = isoY(x, y, this._isoW, this._isoH);
    const OFFSET_Y = -10;
    return { x: this.snap(sx), y: this.snap(sy + OFFSET_Y) };
  }

  /**
   * 所持アイテムUIの反映
   * 概要:
   *  - 所持中の武器/キーをUIスロットに反映（アイコン画像を差し替え）
   * @returns {void}
   */
  renderItemBox() {
    const box = document.getElementById('item-box');
    if (!box) return;
    const slots = box.querySelectorAll('.slot');
    slots.forEach(s => { s.classList.remove('on'); s.innerHTML = ''; });
    // 1: weapon
    if (this.inventory.weapon && slots[0]) {
      slots[0].classList.add('on');
      slots[0].innerHTML = `<img src="assets/weapon/blaster-a.png" alt="weapon" style="width:90%;height:auto;">`;
    }
    // 2: gate key（基地ゲート）
    if (this.inventory.key && slots[1]) {
      slots[1].classList.add('on');
      slots[1].innerHTML = `<img src="assets/items/gatecard.png" alt="key" style="width:90%;height:auto;">`;
    }
    // 3: portal key（ワープ）
    if (this.inventory.portalkey && slots[2]) {
      slots[2].classList.add('on');
      slots[2].innerHTML = `<img src="assets/items/portalkey.png" alt="portalkey" style="width:90%;height:auto;">`;
    }
    /*
    // renderItemBox() の末尾に追記（ラベルだけ）
    const info = document.getElementById('mission-clear-text'); // 既存の説明欄を流用
    if (info && (this.blueprintTotal|0) > 0) {
      const got = this.inventory.blueprint|0;
      const line = `<div class="cc-item"><span class="cc-text">設計図：${got}/${this.blueprintTotal}</span></div>`;
      info.insertAdjacentHTML('beforeend', line);
    }
    */
 
  }


  /**
   * updateBackground()
   * 処理概要:
   *  - マップ（fieldBounds）に合わせて背景画像(bg_moon)を拡大/配置
   *  - 画面中央に準わせて少し大きめに表示（雰囲気重視）
   */
  updateBackground() {
    const b = this._fieldBounds;
    if (!b) return;

    const cam = this.cameras.main;
    cam.setBounds(0, 0, this.scale.gameSize.width, this.scale.gameSize.height);

    // ① 拡大係数（例: 2.50 = 2.5倍）
    const scaleK = 2.50;
    const w = Math.floor(b.w * scaleK);
    const h = Math.floor(b.h * scaleK);

    // ② フィールド中心に合わせて配置（はみ出し分の半分だけ左上にずらす）
    const x = Math.floor(b.x - (w - b.w) / 2);
    const y = Math.floor(b.y - (h - b.h) / 2);

    if (!this.bg) {
      this.bg = this.add.image(x, y, 'bg_moon')
        .setOrigin(0, 0)
        .setDepth(-100)
        .setScrollFactor(0); // 画面固定（必要に応じて 1 に）
    }

    this.bg.setPosition(x, y).setDisplaySize(w, h);
  }

  /**
   * Runner キューの完全クリア
   * 概要:
   *  - Main 側（window.clearRunnerQueue）に委譲して命令キュー/実行器を完全リセット
   *  - ミッション切替/失敗カットシーン前などで呼ぶ安全フック
   * @returns {void}
   */
  clearRunnerQueue() {
    window.clearRunnerQueue?.();
  }

  /**
   * 進入可否の判定
   * 概要:
   *  - 岩/壁は不可、ゲートは pass 規則＆アイテムで可否
   * @param {number} x - グリッドX
   * @param {number} y - グリッドY
   * @returns {boolean} 進入可能なら true
   */
  canEnter(x, y) {
    const ob = this.occObstacles?.get?.(this.occKey(x,y));
    if (!ob) return true;

    if (ob.type === 'rock' || ob.type === 'wall') return false;

    if (ob.type === 'gate' || ob.type === 'portalgate') {
      const pass = ob.pass || 'never';     // 'never' | 'need_item' | 'always'
      if (pass === 'always') return true;
      if (pass === 'never')  return false;
      if (pass === 'need_item') {
        const need = ob.item || 'key';
        return !!this.inventory?.[need];
      }
    }
    return true;
  }

  /**
   * ゲート表示の更新
   * 概要:
   *  - 所持鍵に応じてゲートの見た目を一括更新
   * @returns {void}
   */
  refreshGates() {
    if (!Array.isArray(this.obstacles)) return;
    const opened = !!this.inventory?.key;
    this.obstacles.forEach(ob => {
      if (ob.type !== 'gate' || !ob.spr) return;
      const want = opened ? 'gate_opened' : 'gate_closed';
      if (ob.spr.texture.key !== want) ob.spr.setTexture(want);
    });
  }
  /**
   * ポータルワープの試行
   * 概要:
   *  - 現在セルが portalgate なら、同グループの“次の”portalgate へ転送
   *  - need_item が設定されている場合は inventory を確認（canEnter と同一基準）
   *  - クールダウンで多重発火を防止
   * @param {number} x - 現在のグリッドX
   * @param {number} y - 現在のグリッドY
   * @returns {boolean} 実際にワープしたら true
   */
  tryWarpAt(x, y) { return Warp.tryWarpAt(this, x, y); }

  /**
   * 内部：フェード付き瞬間移動
   * @param {number} dx - 目的地グリッドX
   * @param {number} dy - 目的地グリッドY
   * @returns {boolean} 常に true（ワープ実行）
   */
  _doWarpTo(dx, dy) { return Warp._doWarpTo(this, dx, dy); }
}
