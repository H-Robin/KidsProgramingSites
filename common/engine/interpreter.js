// Interpreter — data-op 優先で Main を読み取り、repeatブロックを展開
export class Interpreter {
  constructor({ programList, onTick, onReset, tickDelay = 300 }){
    this.programList = programList;
    this.onTick = onTick;
    this.onReset = onReset;
    this.timer = null;
    this.ip = 0;
    this.tickDelay = tickDelay;
    this._prog = [];
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

    const tick = () => {
      if (this.ip >= this._prog.length) { this.stop(); return; }
      try { this.onTick?.(this._prog[this.ip++]); }
      catch(e){ console.error("[Interpreter] onTick error:", e); }
    };

    const loop = () => {
      if (!this.timer) return;
      tick();
      if (this.timer) this.timer = setTimeout(loop, this.tickDelay);
    };
    this.timer = setTimeout(loop, this.tickDelay);
  }

  step(){
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