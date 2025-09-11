// interpreter.js — data-op 優先で Main を読み取り、onTick に順次渡す
export class Interpreter {
  constructor({ programList, onTick, onReset, tickDelay = 220 }){
    this.programList = programList;
    this.onTick = onTick;
    this.onReset = onReset;
    this.timer = null;
    this.ip = 0;
    this.tickDelay = tickDelay; // 歩行Tween(~180ms)に少し余裕
    this._prog = [];
  }

  // Main の <li> からプログラムを収集（data-op 優先）
  readProgram(){
    const items = [...this.programList.querySelectorAll("li")];
    return items
      .map(li => li.dataset?.op || li.dataset?.cmd || li.textContent?.trim())
      .filter(Boolean);
  }

  run(){
    this.stop();
    this._prog = this.readProgram();
    this.ip = 0;

    const tick = () => {
      if (this.ip >= this._prog.length) { this.stop(); return; }
      try { this.onTick?.(this._prog[this.ip++]); }
      catch(e){ console.error("[Interpreter] onTick error:", e); }
    };

    // setInterval より setTimeout ループの方が停止/再開が安全
    const loop = () => {
      if (!this.timer) return; // 停止済み
      tick();
      if (this.timer) {
        this.timer = setTimeout(loop, this.tickDelay);
      }
    };
    this.timer = setTimeout(loop, this.tickDelay);
  }

  step(){
    // 直前に run を呼ばず単発で進めたい場合も考慮
    if (!this._prog.length || this.ip >= this._prog.length) {
      this._prog = this.readProgram();
      this.ip = 0;
    }
    this.stop(); // 同時実行防止
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