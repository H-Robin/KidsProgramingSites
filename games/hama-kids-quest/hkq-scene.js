export class HkqScene extends Phaser.Scene {
  constructor(){ super("HkqScene"); }

  preload(){
    // 画像（idle / walk / cheer）
    const IDLE_FILES = [
      "assets/robot/idle/character_robot_idle0.png",
      "assets/robot/idle/character_robot_idle1.png"
    ];
    IDLE_FILES.forEach((url,i)=> this.load.image(`robot_idle_${i}`, url));
    for(let i=0;i<=7;i++){
      this.load.image(`robot_walk_${i}`, `assets/robot/walk/character_robot_walk${i}.png`);
    }
    const CHEER_FILES = [
      "assets/robot/cheer/character_robot_cheer0.png",
      "assets/robot/cheer/character_robot_cheer1.png"
    ];
    CHEER_FILES.forEach((url,i)=> this.load.image(`robot_cheer_${i}`, url));

    // レベル・下地
    this.load.json("levels","./hkq-levels.json");
    this.textures.generate("tile0",{ data:["2"], pixelWidth:8, pixelHeight:8 });
    this.textures.generate("tile1",{ data:["7"], pixelWidth:8, pixelHeight:8 });
  }

  create(){
    // ==== ミッション管理 ====
    this.levels = this.cache.json.get("levels") || [];
    this.missionIndex = 0;
    this.level  = this.levels?.[this.missionIndex] ?? null;
    this.titleText = null;
    this._cleared = false; // 1回だけクリア処理するためのガード

    // ==== CSS色 ====
    const css = getComputedStyle(document.documentElement);
    const hexToInt = (v, fb=0)=>{ const m=String(v||"").trim().match(/^#?([0-9a-f]{6})$/i); return m?parseInt(m[1],16):fb; };
    const col = name => hexToInt(css.getPropertyValue(name));
    this.heightColors = [
      col('--tile-h0')||0x1b243b, col('--tile-h1')||0x233154, col('--tile-h2')||0x2b3e6e,
      col('--tile-h3')||0x335a9a, col('--tile-h4')||0x3b77c8, col('--tile-h5')||0x4590e6,
    ];
    this.gridColor   = col('--grid-line') || 0x2c3e72;
    this.robotBaseC  = col('--robot-base')|| 0x2dd4bf;
    this.goalFill    = col('--goal-fill')     || 0xff3b30;
    this.goalStroke  = col('--goal-stroke')   || 0xff3b30;
    this.robotOnGoal = col('--robot-on-goal') || 0xffeb3b;
    this.robotDirC   = [col('--robot-up')||0xffffff, col('--robot-right')||0xffec6e,
                        col('--robot-down')||0x67e8f9, col('--robot-left')||0xa7f3d0];

    // ==== アニメ ====
    const idleFrames = this.textures.getTextureKeys().filter(k=>k.startsWith("robot_idle_"))
      .sort((a,b)=> +a.split("_").pop() - +b.split("_").pop()).map(key=>({key}));
    if (idleFrames.length) this.anims.create({ key:"robot_idle", frames:idleFrames, frameRate:4, repeat:-1 });
    const walkFrames = Array.from({length:8}, (_,i)=>({key:`robot_walk_${i}`}));
    this.anims.create({ key:"robot_walk", frames:walkFrames, frameRate:10, repeat:-1 });
    const cheerFrames = this.textures.getTextureKeys().filter(k=>k.startsWith("robot_cheer_"))
      .sort((a,b)=> +a.split("_").pop() - +b.split("_").pop()).map(key=>({key}));
    if (cheerFrames.length) this.anims.create({ key:"robot_cheer", frames:cheerFrames, frameRate:6, repeat:-1 });

    // ==== レイヤ/状態 ====
    this.coverGfx = this.add.graphics();
    this.goalGfx  = this.add.graphics();
    this.gridGfx  = this.add.graphics();
    this.map = new Map();
    this.robot = null; this.robotSpr = null; this.robotBase = null;
    this.goals = new Set(); this.lit = new Set();
    this.status = null;

    // 表示調整
    this.ROBOT_SCALE = 0.6;
    this.ROBOT_OFFSET_Y_RATIO = 0.15;
    this.tileToPx = (x, y) => {
      const { gridH } = this.level;
      const px = this.originX + x * this.cell;
      const py = this.originY + (gridH - 1 - y) * this.cell;
      return { x: px, y: py };
    };
    this.animLockUntil = 0;

    this.scale.on("resize", () => this.buildLevel());
    this.buildLevel(true); // タイトル表示して開始
  }

  // ==== ユーティリティ ====
  stageBox(){ const w=this.scale.width,h=this.scale.height,pad=16; return {x:pad,y:pad,w:Math.max(0,w-pad*2),h:Math.max(0,h-pad*2)}; }
  manhattan(a,b){ return Math.abs(a.x-b.x) + Math.abs(a.y-b.y); }
  randomRng(){ return Math.random(); }
  rx(a,b){ return Math.floor(this.randomRng()*(b-a+1))+a; }

  // ゴール生成（line / zigzag / perimeter / diagonal / random）
  generateGoals(spec, gridW, gridH, robot){
    const count = Math.max(1, spec.count|0);
    const minD  = Math.max(0, spec.minDistance|0);
    const ok = (p)=> this.manhattan(p, robot) >= minD;
    const pts = [];
    const uniqPush = (p)=>{ if(ok(p) && !pts.some(q=>q.x===p.x&&q.y===p.y)) pts.push(p); };
    const randomCell = ()=> ({x:this.rx(0,gridW-1), y:this.rx(0,gridH-1)});

    switch((spec.pattern||"random")){
      case "line": {
        const horiz = Math.random()<0.5;
        if(horiz){
          const y = this.rx(0,gridH-1);
          let xs = Array.from({length:gridW}, (_,i)=>i).sort(()=>Math.random()-0.5).slice(0,count).sort((a,b)=>a-b);
          xs.forEach(x=> uniqPush({x,y}));
        }else{
          const x = this.rx(0,gridW-1);
          let ys = Array.from({length:gridH}, (_,i)=>i).sort(()=>Math.random()-0.5).slice(0,count).sort((a,b)=>a-b);
          ys.forEach(y=> uniqPush({x,y}));
        }
        break;
      }
      case "zigzag": {
        let x0 = this.rx(0, Math.max(0, gridW-count));
        let y  = this.rx(0, gridH-1);
        let dir = Math.random()<0.5 ? 1 : -1;
        for(let i=0;i<count;i++){
          uniqPush({x:x0+i, y});
          y += dir; if(y<0){y=1;dir=1;} if(y>=gridH){y=gridH-2;dir=-1;}
        }
        break;
      }
      case "perimeter": {
        const border = [];
        for(let x=0;x<gridW;x++){ border.push({x, y:0}); border.push({x, y:gridH-1}); }
        for(let y=1;y<gridH-1;y++){ border.push({x:0,y}); border.push({x:gridW-1,y}); }
        while(pts.length<count && border.length){ const i=this.rx(0,border.length-1); uniqPush(border.splice(i,1)[0]); }
        break;
      }
      case "diagonal": {
        const down = Math.random()<0.5; const base = this.rx(0, Math.min(gridW,gridH)-1);
        for(let i=0;i<count;i++){
          const x = Math.min(gridW-1, base+i);
          const y = down ? Math.min(gridH-1, i) : Math.max(0, (gridH-1)-i);
          uniqPush({x,y});
        }
        break;
      }
      default: {
        let guard = 500;
        while(pts.length<count && guard--) uniqPush(randomCell());
      }
    }
    // 不足分補充
    let guard = 500;
    while(pts.length<count && guard--) uniqPush(randomCell());
    return pts.slice(0, count);
  }

  // タイトル表示（フェードIN→1秒→OUT→onDone）
  showMissionTitle(text, onDone){
    if (this.titleText) { this.titleText.destroy(); this.titleText = null; }
    const { x, y, w, h } = this.stageBox();
    this.titleText = this.add.text(x + w/2, y + h/2, text, {
      fontSize: Math.floor(Math.min(w,h)*0.08), color: "#ffffff", fontStyle: "bold"
    }).setOrigin(0.5).setAlpha(0);

    this.tweens.add({
      targets: this.titleText, alpha: 1, duration: 350, ease: "Sine.Out",
      onComplete: () => {
        this.time.delayedCall(1000, () => {
          this.tweens.add({
            targets: this.titleText, alpha: 0, duration: 350, ease: "Sine.In",
            onComplete: () => { this.titleText.destroy(); this.titleText = null; onDone && onDone(); }
          });
        });
      }
    });
  }

  // ==== レベル構築 ====
  buildLevel(showTitle=false){
    this.children.removeAll();
    this.coverGfx = this.add.graphics();
    this.goalGfx  = this.add.graphics();
    this.gridGfx  = this.add.graphics();

    if(!this.level){ this.add.text(20,20,"No level data",{color:"#fff"}); return; }

    const {gridW, gridH, robot} = this.level;

    // タイル（uniformH から自動生成）
    let tiles = this.level.tiles;
    if (!tiles || !Array.isArray(tiles) || tiles.length === 0) {
      const h = (this.level.uniformH|0) || 0;
      tiles = [];
      for (let y=0; y<gridH; y++) for (let x=0; x<gridW; x++) tiles.push({x, y, h});
    }

    // セル・原点
    const box = this.stageBox();
    const cell = Math.floor(Math.min(box.w/gridW, box.h/gridH));
    this.cell = Math.max(24, cell);
    const drawW=this.cell*gridW, drawH=this.cell*gridH;
    this.originX = box.x + Math.floor((box.w-drawW)/2);
    this.originY = box.y + Math.floor((box.h-drawH)/2);

    // タイル色カバー
    this.map.clear();
    tiles.forEach(t=>{
      this.map.set(`${t.x},${t.y}`, t);
      const idx = ((t.h|0)%this.heightColors.length + this.heightColors.length)%this.heightColors.length;
      this.coverGfx.fillStyle(this.heightColors[idx], 1);
      this.coverGfx.fillRect(
        this.originX + t.x*this.cell,
        this.originY + (gridH-1 - t.y)*this.cell,
        this.cell, this.cell
      );
    });

    // ゴール座標（固定 > spec生成）→ 1個に固定
    let goalsArr = Array.isArray(this.level.goals) ? [...this.level.goals] : [];
    if (goalsArr.length === 0 && this.level.goalSpec){
      goalsArr = this.generateGoals(this.level.goalSpec, gridW, gridH, robot);
    }
    goalsArr = goalsArr.slice(0, 1); // ★1ミッション=ゴール1個

    // ゴール描画
    this.goalGfx.clear();
    this.goalGfx.lineStyle(2, this.goalStroke, 0.95);
    this.goalGfx.fillStyle(this.goalFill, 0.45);
    goalsArr.forEach(g=>{
      const gx = this.originX + g.x*this.cell;
      const gy = this.originY + (gridH-1 - g.y)*this.cell;
      this.goalGfx.fillRect(gx, gy, this.cell, this.cell);
      this.goalGfx.strokeRect(gx+0.5, gy+0.5, this.cell-1, this.cell-1);
    });

    // グリッド
    this.gridGfx.lineStyle(1, this.gridColor, 0.65);
    for(let x=0; x<=gridW; x++){
      const gx=this.originX + x*this.cell + 0.5;
      this.gridGfx.beginPath(); this.gridGfx.moveTo(gx, this.originY+0.5);
      this.gridGfx.lineTo(gx, this.originY+drawH+0.5); this.gridGfx.strokePath();
    }
    for(let y=0; y<=gridH; y++){
      const gy=this.originY + y*this.cell + 0.5;
      this.gridGfx.beginPath(); this.gridGfx.moveTo(this.originX+0.5, gy);
      this.gridGfx.lineTo(this.originX+drawW+0.5, gy); this.gridGfx.strokePath();
    }

    // ロボ配置
    this.robot = { x: robot.x, y: robot.y, dir: robot.dir|0 };
    this.robotBase = this.add.rectangle(
      this.originX + this.robot.x*this.cell,
      this.originY + (gridH-1 - this.robot.y)*this.cell,
      this.cell, this.cell, this.robotBaseC, 0.35
    ).setOrigin(0);

    const firstIdleKey = this.textures.getTextureKeys().find(k=>k.startsWith("robot_idle_")) || "robot_walk_0";
    const p0 = this.tileToPx(this.robot.x, this.robot.y);
    this.robotSpr = this.add.sprite(p0.x, p0.y, firstIdleKey).setOrigin(0).setScale(this.ROBOT_SCALE);
    this.robotSpr.y -= this.cell * this.ROBOT_OFFSET_Y_RATIO;
    if (this.anims.exists("robot_idle")) this.robotSpr.play("robot_idle"); else this.robotSpr.play("robot_walk");

    this.goals = new Set(goalsArr.map(g=>`${g.x},${g.y}`));
    this.updateRobotTint();

    this.lit   = new Set();
    this.status = this.add.text(12, 8, `Mission ${this.missionIndex+1}/${this.levels.length}`, {fontSize:16, color:"#e2e8f0"});

    if (showTitle){
      const title = (this.missionIndex < this.levels.length)
        ? `Mission ${this.missionIndex+1}: ${this.level.id||""}`
        : "Mission Complete!";
      this.showMissionTitle(title, ()=>{});
    }

    // クリアガード解除（再開時）
    this._cleared = false;
  }

  resetLevel(){ this.buildLevel(true); }

  // ==== 見た目（色＆アニメ）更新 ====
  updateRobotTint(){
    if (this.time.now < this.animLockUntil && this.robotSpr.anims?.getName()==="robot_walk") return;
    const onGoal = this.goals?.has(`${this.robot.x},${this.robot.y}`);
    if(onGoal){
      this.robotSpr.setTint(this.robotOnGoal);
      if (this.anims.exists("robot_cheer")) this.robotSpr.play("robot_cheer", true);
    }else{
      this.robotSpr.setTint(this.robotDirC[this.robot.dir%4]);
      if (this.anims.exists("robot_idle")) this.robotSpr.play("robot_idle", true);
    }
  }
  playWalkPulse(){
    if (!this.anims.exists("robot_walk")) { this.updateRobotTint(); return; }
    this.robotSpr.play("robot_walk", true);
    this.animLockUntil = this.time.now + 280;
    this.time.delayedCall(280, ()=> this.updateRobotTint());
  }

  // ==== コマンド実行 ====
  onTick(op){
    if(!op) return;
    if (this.time.now >= this.animLockUntil && this.anims.exists("robot_idle")) this.robotSpr.play("robot_idle", true);

    switch(op){
      case "UP":    this.robot.dir=0; if(this.tryMove(false)) this.playWalkPulse(); else this.updateRobotTint(); break;
      case "RIGHT": this.robot.dir=1; if(this.tryMove(false)) this.playWalkPulse(); else this.updateRobotTint(); break;
      case "DOWN":  this.robot.dir=2; if(this.tryMove(false)) this.playWalkPulse(); else this.updateRobotTint(); break;
      case "LEFT":  this.robot.dir=3; if(this.tryMove(false)) this.playWalkPulse(); else this.updateRobotTint(); break;
      case "MOVE":  if(this.tryMove(false)) this.playWalkPulse(); else this.updateRobotTint(); break;
      case "LIGHT": this.lightTile(); this.updateRobotTint(); break;
    }

    this.updateSpritePosition();
    this.updateRobotTint();
    this.checkClear();
  }

  tryMove(usingJump){
    const dir=this.robot.dir;
    const dx=[0,1,0,-1][dir], dy=[1,0,-1,0][dir];
    const curr=this.map.get(`${this.robot.x},${this.robot.y}`);
    const next=this.map.get(`${this.robot.x+dx},${this.robot.y+dy}`);
    if(!next||!curr) return false;
    const dh=(next.h|0)-(curr.h|0);
    const can= usingJump ? (dh===1 || dh<=0) : (dh===0);
    if(can){ this.robot.x+=dx; this.robot.y+=dy; return true; }
    return false;
  }

  lightTile(){
    const key=`${this.robot.x},${this.robot.y}`;
    if(this.goals.has(key)) this.lit.add(key);
    this.status?.setText(`Lit: ${this.lit.size}/${this.goals.size}`);
  }

  updateSpritePosition(){
    const p = this.tileToPx(this.robot.x, this.robot.y);
    this.robotBase?.setPosition(p.x, p.y);
    this.robotSpr.setPosition(p.x, p.y - this.cell * this.ROBOT_OFFSET_Y_RATIO);
  }

  // ==== クリア → 次ミッションへ ====
  checkClear(){
    if (this._cleared) return;
    if (this.goals.size>0 && this.lit.size===this.goals.size){
      this._cleared = true;
      this.status?.setText("Mission Clear!");
      if (this.anims.exists("robot_cheer")) this.robotSpr.play("robot_cheer", true);

      if (this.missionIndex < this.levels.length - 1){
        const nextIdx = this.missionIndex + 1;
        const title = `Mission ${nextIdx+1}: ${this.levels[nextIdx].id || ""}`;
        this.showMissionTitle(title, ()=> {
          this.missionIndex = nextIdx;
          this.level = this.levels[this.missionIndex];
          this.buildLevel(true);
        });
      }else{
        this.showMissionTitle("Mission Complete!", ()=>{});
      }
    }
  }
}