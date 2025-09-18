// src/main/hkq-mission.js
export class Mission {
  constructor(level){
    this.level = level;                // level.clear を参照
    this.progress = {
      pos:{x:0,y:0}, reachedGoal:false,
      inventory:{}, stats:{ defeated:{} }
    };
    this._bindEvents();
  }
  _bindEvents(){
    this._handlers = {
      start : (e)=>{ if (e?.detail?.level) this.reset(e.detail.level); this.render(); },
      move  : (e)=>{ this.progress.pos = e.detail.pos; this.render(); },
      pick  : (e)=>{ const k=e.detail.id; this.progress.inventory[k]=(this.progress.inventory[k]||0)+1; this.render(); },
      down  : (e)=>{ const t=e.detail.type; this.progress.stats.defeated[t]=(this.progress.stats.defeated[t]||0)+1; this.render(); },
      reach : ()=>{ this.progress.reachedGoal = true; this.render(true); }
    };
    document.addEventListener('hkq:mission-start', () => this.render());
    document.addEventListener('hkq:move',      e => { this.progress.pos = e.detail.pos; this.render(); });
    document.addEventListener('hkq:item-pick', e => { const k=e.detail.id; this.progress.inventory[k]=(this.progress.inventory[k]||0)+1; this.render();});
    document.addEventListener('hkq:enemy-down',e => { const t=e.detail.type; this.progress.stats.defeated[t]=(this.progress.stats.defeated[t]||0)+1; this.render();});
    document.addEventListener('hkq:reach-goal',() => { this.progress.reachedGoal=true; this.render(true); });
  }

  reset(level){
    // 新しい面に入った時に進捗を完全初期化（取り消し線をリセット）
    this.level = level || this.level;
    this.progress = { pos:{x:0,y:0}, reachedGoal:false, inventory:{}, stats:{ defeated:{} } };
    const el = document.getElementById('mission-clear-text');
    if (el){
      const conds = this.level?.clear?.conditions || [];
      el.innerHTML = conds.map(c=>`<div class="cc-item"><span class="cc-check">⬜️</span><span class="cc-text">${c.text}</span></div>`).join('');
    }
  }

  dispose(){
    if (!this._handlers) return;
    document.removeEventListener('hkq:mission-start', this._handlers.start);
    document.removeEventListener('hkq:move',          this._handlers.move);
    document.removeEventListener('hkq:item-pick',     this._handlers.pick);
    document.removeEventListener('hkq:enemy-down',    this._handlers.down);
    document.removeEventListener('hkq:reach-goal',    this._handlers.reach);
    this._handlers = null;
  }

  _has(k){ const v=this.progress.inventory[k]; return typeof v==='number'? v>0: !!v; }
  _ok(c){
    // 前提
    if (c.requires && !c.requires.every(k=>this._has(k))) return false;
    // 種別
    switch(c.type){
      case 'obtain': return (this.progress.inventory[c.item]||0) >= (c.count||1);
      case 'defeat': return (this.progress.stats.defeated[c.enemy]||0) >= (c.count||1);
      case 'reach' : return c.target==='lunar_base' ? this.progress.reachedGoal : false;
      default: return false;
    }
  }
  evaluate(){
    const cs = this.level.clear?.conditions || [];
    const results = cs.map(c => ({ id:c.id, ok:this._ok(c), text:c.text }));
    const done = (this.level.clear?.logic === 'AND')
      ? results.every(r=>r.ok) : results.some(r=>r.ok);
    return { done, results };
  }
  render(fireClear=false){
    const el = document.getElementById('mission-clear-text');
    if (!el) return;
    const {done, results} = this.evaluate();
    el.innerHTML = results.map(r=>`<div class="cc-item ${r.ok?'ok':''}">
      <span class="cc-check">${r.ok?'✅':'⬜️'}</span>
      <span class="cc-text">${r.text}</span>
    </div>`).join('');
    if (done && fireClear){
      document.dispatchEvent(new CustomEvent('hkq:mission-cleared'));
    }
  }
}