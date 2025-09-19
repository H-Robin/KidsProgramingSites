// Interpreter — data-op 優先で Main を読み取り、repeatブロックを展開
export class Runner {
  constructor(scene){
    this.scene = scene;
    this.queue = [];       // 実行中のコマンド列
    this.paused = false;   // ロック状態
    this._bindLockEvents();
  }
  _bindLockEvents(){
    document.addEventListener('hkq:lock',   () => { this.paused = true;  });
    document.addEventListener('hkq:unlock', () => {
      if (!this.paused) return;
      this.paused = false;
      this.tick(); // 再開時に次のコマンドを流す
    });
  }
  enqueue(cmds){ this.queue.push(...cmds); }
  tick(){
    if (this.paused) return;              // ロック中は進めない
    const op = this.queue.shift();
    if (!op) return;
    this.scene.onTick(op);                // ここでロボを動かす
    setTimeout(()=>this.tick(), 0);       // 必要ならディレイ調整
  }
}

export class Interpreter {
  constructor({ programList, onTick, onReset, tickDelay = 300 }){
    this.programList = programList;
    this.onTick = onTick;
    this.onReset = onReset;
    this.timer = null;         // setTimeout のハンドル
    this.ip = 0;               // 現在の命令ポインタ
    this.tickDelay = tickDelay;
    this._prog = [];           // 展開済みの命令列

    // ★ ロック対応（hkq:lock / hkq:unlock）
    this.paused = false;
    this._lockDepth = 0;       // ネストに備える
    this._bindLockEvents();
  }

  _bindLockEvents(){
    document.addEventListener('hkq:lock',   () => {
      this._lockDepth++;
      this._applyPause(true);
    });
    document.addEventListener('hkq:unlock', () => {
      if (this._lockDepth > 0) this._lockDepth--;
      if (this._lockDepth === 0) this._applyPause(false);
    });
  }

  _applyPause(flag){
    this.paused = !!flag;
    if (this.paused){
      // 進行予約を止める（デキューしない）
      if (this.timer){ clearTimeout(this.timer); this.timer = null; }
      // _prog と ip は保持する（解除後に続きから）
    }else{
      // 再開：未了ならループを再セット
      if (this._prog.length && this.ip < this._prog.length && !this.timer){
        this.timer = setTimeout(()=>this._loop(), this.tickDelay);
      }
    }
  }

  // Main を読み取り：通常<li>はそのまま、repeatブロックは count × body内 を展開
  readProgram(){
    const seq = [];
    const items = [...this.programList.children];
    for (const el of items){
      if (el.classList.contains('cmd')){
        const op = el.dataset?.op || el.textContent?.trim();
        if (op) seq.push(op);
      }else if (el.classList.contains('repeat')){
        const body = el.querySelector('.repeat-body');
        const countInput = el.querySelector('.repeat-count');
        const n = Math.max(1, Math.min(10, parseInt(countInput?.value||'1',10) || 1));
        const inner = [...(body?.querySelectorAll('.cmd') || [])]
          .map(li => li.dataset?.op || li.textContent?.trim())
          .filter(Boolean);
        // 入れ子は禁止：inner に repeat があれば無視
        if (inner.some(op => op === 'repeat')) continue;
        for (let i=0;i<n;i++) seq.push(...inner);
      }
    }
    return seq;
  }

  run(){
    this.stop();
    this._prog = this.readProgram();
    this.ip = 0;

    // ロック中なら解除待ち（_applyPause が再開を担当）
    if (this.paused) return;

    this.timer = setTimeout(()=>this._loop(), this.tickDelay);
  }

  // 進行ループ本体
  _loop(){
    if (!this.timer) return;         // 停止済み
    if (this.paused){                // 予防的ガード
      clearTimeout(this.timer);
      this.timer = null;
      return;
    }
    if (this.ip >= this._prog.length){
      this.stop();
      return;
    }

    try { this.onTick?.(this._prog[this.ip++]); }
    catch(e){ console.error("[Interpreter] onTick error:", e); }

    if (this.timer) this.timer = setTimeout(()=>this._loop(), this.tickDelay);
  }

  step(){
    // ロック中は単発実行もしない
    if (this.paused) return;

    if (!this._prog.length || this.ip >= this._prog.length) {
      this._prog = this.readProgram();
      this.ip = 0;
    }
    this.stop();
    if (this.ip < this._prog.length) {
      try { this.onTick?.(this._prog[this.ip++]); }
      catch(e){ console.error("[Interpreter] onTick error:", e); }
    }
  }

  stop(){
    if (this.timer){
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  reset(){
    this.stop();
    this.ip = 0;
    this._prog = [];
    this.onReset?.();
  }
}