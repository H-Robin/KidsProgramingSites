export class HkqScene extends Phaser.Scene {
  constructor(){ super("HkqScene"); }

  preload(){
    // レベル定義（5ステージ）をロード
    this.load.json("levels", "hkq-levels.json");

    // 画像アセット
    this.load.image("robot_idle0", "assets/robot/idle/character_robot_idle0.png");
    this.load.image("robot_idle1", "assets/robot/idle/character_robot_idle1.png");
    for (let i=0;i<=7;i++){
      this.load.image(`robot_walk${i}`, `assets/robot/walk/character_robot_walk${i}.png`);
    }
    this.load.image("robot_cheer0", "assets/robot/cheer/character_robot_cheer0.png");
    this.load.image("robot_cheer1", "assets/robot/cheer/character_robot_cheer1.png");
    this.load.image("goal_png", "assets/goal.png");
  }

  create(){
    // JSONを展開
    this.levels = this.cache.json.get("levels") || [];
    this.missionIndex = 0;

    this.createAnimations();
    this.buildLevel(true);

    // リサイズ最適化
    this._lastSize = { w: this.scale.width, h: this.scale.height };
    this._resizeTid = null;
    this.scale.on("resize", () => {
      const w = this.scale.width, h = this.scale.height;
      if (Math.abs(w - this._lastSize.w) < 8 && Math.abs(h - this._lastSize.h) < 8) return;
      clearTimeout(this._resizeTid);
      this._resizeTid = setTimeout(() => {
        this._lastSize = { w, h };
        this.buildLevel(false);
      }, 120);
    });
  }

  createAnimations(){
    this.anims.create({ key:"robot_idle", frames:[ { key:"robot_idle0" }, { key:"robot_idle1" } ], frameRate:2, repeat:-1 });
    this.anims.create({ key:"robot_walk", frames: Array.from({length:8}, (_,i)=>({ key:`robot_walk${i}` })), frameRate:10, repeat:-1 });
    this.anims.create({ key:"robot_cheer", frames:[ {key:"robot_cheer0"}, {key:"robot_cheer1"} ], frameRate:6, repeat:-1 });
  }

  snap(v){ return Math.round(v); }

  // ========= レベル構築 =========
  buildLevel(showTitle){
    const L = this.levels[this.missionIndex] || {};
    this.gridW = L.gridW ?? 5;
    this.gridH = L.gridH ?? 5;

    const startX = (L.robot && Number.isInteger(L.robot.x)) ? L.robot.x : 0;
    const startY = (L.robot && Number.isInteger(L.robot.y)) ? L.robot.y : (this.gridH - 1);
    this.startCell = { x:startX, y:startY };

    const W = this.scale.gameSize.width;
    const H = this.scale.gameSize.height;

    const leftW = Math.floor(W * 0.90);
    const pad = 16;

　  // フィールドの最大横幅を制限（縮小の上限）
　  const FIELD_MAX_W = 800; // ← 500〜600 の間で好みに調整
　  const availW = Math.min(leftW - pad*2, FIELD_MAX_W);
   const availH = H     - pad*2;

    // 80%程度に縮めて見切れ防止
    const cell = Math.floor(Math.min(availW/this.gridW, availH/this.gridH) * 0.8);
    const fieldPXW = cell * this.gridW;
    const fieldPXH = cell * this.gridH;

    const x0 = this.snap(pad + (availW - fieldPXW)/2);
    const y0 = this.snap(pad + (availH - fieldPXH)/2);

    this.cameras.main.setBackgroundColor("#0b1020");
    if (this.fieldLayer) this.fieldLayer.destroy(true);
    this.fieldLayer = this.add.container(x0, y0);

    // グリッド
    const g = this.add.graphics();
    g.fillStyle(0x96e9dd, 1);
    g.fillRect(0, 0, fieldPXW, fieldPXH);
    g.lineStyle(2, 0x2c3e72, 1);
    for (let y=0;y<=this.gridH;y++){
      g.strokeLineShape(new Phaser.Geom.Line(0, y*cell + 0.5, fieldPXW, y*cell + 0.5));
    }
    for (let x=0;x<=this.gridW;x++){
      g.strokeLineShape(new Phaser.Geom.Line(x*cell + 0.5, 0, x*cell + 0.5, fieldPXH));
    }
    this.fieldLayer.add(g);
   // ゴール（goalSpecに基づき1点抽選・背面）
    const goal = this.pickGoalFromSpec(L.goalSpec);
    this.goalCell = goal;
    if (this.goalSpr) this.goalSpr.destroy();
    const gpx = this.cellToXY(goal.x, goal.y, cell);
    this.goalSpr = this.add.image(this.snap(gpx.x), this.snap(gpx.y), "goal_png")
      .setOrigin(0.5)
      .setDisplaySize(Math.floor(cell*0.60), Math.floor(cell*0.60))
      .setDepth(5);
    this.fieldLayer.add(this.goalSpr);

    // ロボット（前面）
    const startPx = this.cellToXY(this.startCell.x, this.startCell.y, cell);
    if (this.robotSpr) this.robotSpr.destroy();
    this.robotSpr = this.add.sprite(this.snap(startPx.x), this.snap(startPx.y), "robot_idle0")
      .setOrigin(0.5)
      .setDisplaySize(Math.floor(cell*0.70), Math.floor(cell*0.70))
      .setDepth(10);
    this.robotSpr.play("robot_idle", true);
    this.fieldLayer.add(this.robotSpr);

 

    // 状態
    this.cellSize = cell;
    this.robotCell = { ...this.startCell };
    this._cleared = false;

    // タイトル・ミッション開始通知
    this.emitMissionStart();
    if (showTitle){
      const title = `ミッション ${this.missionIndex+1}: ${L.id ?? ""}`;
      this.showMissionTitle(title, ()=>{});
    } else {
      document.body.classList.remove('ui-locked','boot');
    }
  }

  emitMissionStart(){
    const ev = new CustomEvent("hkq:mission-start", { detail:{ mission:this.missionIndex }});
    document.dispatchEvent(ev);
  }

  showMissionTitle(text, onDone){
    const W = this.scale.gameSize.width;
    const H = this.scale.gameSize.height;
    if (this.titleText) { try{ this.titleText.destroy(); }catch(e){} this.titleText = null; }

    const t = this.add.text(W/2, H*0.15, text, {
      fontSize: "40px",
      color: "#ffffff",
      fontFamily: "system-ui, -apple-system, 'Noto Sans JP', sans-serif"
    }).setOrigin(0.5).setAlpha(0);
    this.titleText = t;

    document.body.classList.add('ui-locked');
    this.tweens.add({
      targets: t, alpha:1, duration:300, y: H*0.18, ease:"quad.out",
      yoyo:true, hold:700,
      onComplete:()=>{
        try{ t.destroy(); }catch(e){}
        this.titleText = null;
        document.body.classList.remove('ui-locked','boot');
        onDone && onDone();
      }
    });
  }

  // ===== goalSpec 処理：候補から1点抽選 =====
  pickGoalFromSpec(spec){
    const minDist = Math.max(0, spec?.minDistance ?? 0);
    const start = this.startCell;
    const inside = (x,y)=> x>=0 && x<this.gridW && y>=0 && y<this.gridH;
    const farEnough = (x,y)=> Math.abs(x-start.x)+Math.abs(y-start.y) >= minDist;

    let candidates = [];
    switch (spec?.pattern) {
      case "line": {
        const y = Math.floor(this.gridH/2);
        for (let x=0;x<this.gridW;x++)
          if (!(x===start.x&&y===start.y)) candidates.push({x,y});
        break;
      }
      case "zigzag": {
        for (let x=0;x<this.gridW;x++){
          const y = (x%2===0) ? 0 : Math.min(this.gridH-1, 1);
          if (inside(x,y) && !(x===start.x&&y===start.y)) candidates.push({x,y});
        }
        break;
      }
      case "perimeter": {
        for (let x=0;x<this.gridW;x++){
          [{x,y:0},{x,y:this.gridH-1}].forEach(p=>{ if(inside(p.x,p.y)) candidates.push(p); });
        }
        for (let y=1;y<this.gridH-1;y++){
          [{x:0,y},{x:this.gridW-1,y}].forEach(p=>{ if(inside(p.x,p.y)) candidates.push(p); });
        }
        candidates = candidates.filter(p=>!(p.x===start.x&&p.y===start.y));
        break;
      }
      case "diagonal": {
        const m = Math.min(this.gridW, this.gridH);
        for (let i=0;i<m;i++) if (!(i===start.x && i===start.y)) candidates.push({x:i,y:i});
        break;
      }
      case "random":
      default: {
        for (let x=0;x<this.gridW;x++){
          for (let y=0;y<this.gridH;y++){
            if (!(x===start.x && y===start.y)) candidates.push({x,y});
          }
        }
      }
    }

    const filtered = candidates.filter(p=>farEnough(p.x,p.y));
    const pool = filtered.length ? filtered : candidates;
    if (!pool.length) return this.randomGoalFallback();

    return pool[Math.floor(Math.random()*pool.length)];
  }

  // 最後の砦（全セルからランダム）
  randomGoalFallback(){
    while(true){
      const gx = Math.floor(Math.random()*this.gridW);
      const gy = Math.floor(Math.random()*this.gridH);
      if (gx !== this.startCell.x || gy !== this.startCell.y) return {x:gx,y:gy};
    }
  }

  // ===== 判定（セル一致 + 座標誤差許容） =====
  isAtGoal(){
    if (!this.goalCell || !this.robotCell) return false;
    if (this.robotCell.x === this.goalCell.x && this.robotCell.y === this.goalCell.y) return true;
    if (this.robotSpr && this.goalSpr){
      const dx = Math.abs(this.robotSpr.x - this.goalSpr.x);
      const dy = Math.abs(this.robotSpr.y - this.goalSpr.y);
      const tol = Math.max(2, Math.floor(this.cellSize * 0.2));
      return dx <= tol && dy <= tol;
    }
    return false;
  }

  handleGoalReached(){
    this._cleared = true;
    this.robotSpr.play("robot_cheer", true);

    // cheer 2回後に次ミッションへ
    this.time.delayedCall(900, ()=>{
      this.robotSpr.play("robot_cheer", true);
      this.time.delayedCall(900, ()=>{
        const last = (this.levels?.length || 1) - 1;
        if (this.missionIndex < last){
          const nextIdx = this.missionIndex + 1;
          const nextTitle = `ミッション ${nextIdx+1}: ${this.levels[nextIdx]?.id ?? ""}`;
          this.showMissionTitle(nextTitle, ()=>{
            this.missionIndex = nextIdx;
            this.buildLevel(true);
          });
        } else {
          this.showMissionTitle("Mission Complete!", ()=>{
            this.missionIndex = 0; // 最初に戻す
            this.buildLevel(true);
          });
        }
      });
    });
  }

  // ===== 1ステップ実行（英語/矢印/日本語 いずれもOK） =====
  onTick(op){
    if (this._cleared) return;
    const DIR = {
      up:{dx:0,dy:-1},    "↑":{dx:0,dy:-1}, "まえ":{dx:0,dy:-1},
      down:{dx:0,dy:1},   "↓":{dx:0,dy:1},  "うしろ":{dx:0,dy:1},
      right:{dx:1,dy:0},  "→":{dx:1,dy:0},  "みぎ":{dx:1,dy:0},
      left:{dx:-1,dy:0},  "←":{dx:-1,dy:0}, "ひだり":{dx:-1,dy:0},
    };
    const dir = DIR[op];
    if (!dir) return;

    const nx = Phaser.Math.Clamp(this.robotCell.x + dir.dx, 0, this.gridW-1);
    const ny = Phaser.Math.Clamp(this.robotCell.y + dir.dy, 0, this.gridH-1);
    this.robotCell = { x:nx, y:ny };

    const p = this.cellToXY(nx, ny, this.cellSize);
    this.robotSpr.play("robot_walk", true);
    this.tweens.add({
      targets: this.robotSpr,
      x: this.snap(p.x), y: this.snap(p.y),
      duration: 260,
      ease: "quad.out",
      onComplete: ()=>{
        if (this._cleared) return;
        if (this.isAtGoal()){
          this.handleGoalReached();
        } else {
          this.robotSpr.play("robot_idle", true);
        }
      }
    });
  }

  // ===== API =====
  resetLevel(){ this.buildLevel(false); }
  gotoMission(idx){ this.missionIndex = Math.max(0, idx|0); this.buildLevel(true); }

  // セル中心（コンテナ座標系）
  cellToXY(x, y, cell){ return { x: this.snap(x*cell + cell/2), y: this.snap(y*cell + cell/2) }; }
}