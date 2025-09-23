// ▼ 追加：Mission欄のアイコン画像パス（あとから追加しやすいAPIつき）
export const MISSION_ICON_MAP = {
  "ロボット":     "assets/robot/idle/character_robot_idle0.png",
  "モンスター":   "assets/enemy/monster-a/idle/idle1.png",
  "ゲートカード": "assets/items/gatecard.png",
  "ゴール":       "assets/floor/moon_base_goal.png",
  "ブラスターガン":"assets/weapon/blaster-a.png",
};
/** アイコン登録（既存キー上書き可） */
export function registerMissionIcon(key, path){ MISSION_ICON_MAP[key] = path; }
/** 複数登録 */
export function registerMissionIcons(dict){ Object.assign(MISSION_ICON_MAP, dict); }

export class Mission {
  constructor(level){
    this.level = level;
    this.progress = {
      pos:{x:0,y:0}, reachedGoal:false,
      inventory:{}, stats:{ defeated:{} }
    };
    this._bindEvents();
    // ▼ 追加：初期のMission欄を描画
    this.renderMissionPanel();
  }

  _bindEvents(){
    this._handlers = {
      start : (e)=>{ if (e?.detail?.level) this.reset(e.detail.level); this.render(); this.renderMissionPanel(); },
      move  : (e)=>{ this.progress.pos = e.detail.pos; this.render(); },
      pick  : (e)=>{ const k=e.detail.id; this.progress.inventory[k]=(this.progress.inventory[k]||0)+1; this.render(); this.renderMissionPanel(); },
      down  : (e)=>{ const t=e.detail.type; this.progress.stats.defeated[t]=(this.progress.stats.defeated[t]||0)+1; this.render(); this.renderMissionPanel(); },
      reach : ()=>{ this.progress.reachedGoal = true; this.render(true); this.renderMissionPanel(); }
    };
    document.addEventListener('hkq:mission-start', this._handlers.start);
    document.addEventListener('hkq:move',          this._handlers.move);
    document.addEventListener('hkq:item-pick',     this._handlers.pick);
    document.addEventListener('hkq:enemy-down',    this._handlers.down);
    document.addEventListener('hkq:reach-goal',    this._handlers.reach);
  }

  reset(level){
    this.level = level || this.level;
    this.progress = { pos:{x:0,y:0}, reachedGoal:false, inventory:{}, stats:{ defeated:{} } };
    const el = document.getElementById('mission-clear-text');
    if (el){
      const conds = this.level?.clear?.conditions || [];
      el.innerHTML = conds.map(c=>`<div class="cc-item"><span class="cc-check">⬜️</span><span class="cc-text">${c.text}</span></div>`).join('');
    }
    // ▼ 追加：Mission欄を初期化
    this.renderMissionPanel();
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
    if (c.requires && !c.requires.every(k=>this._has(k))) return false;
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

  /** ▼ 追加：Mission欄（画像＋文字）の描画 */
  renderMissionPanel(options = {}){
    const panel = document.getElementById('mission-panel');
    if (!panel) return;

    const items = this._buildMissionItems();
    const { iconSize } = options;
    panel.style.setProperty('--mission-icon-size', typeof iconSize==='number'? `${iconSize}px` : '');

    panel.innerHTML = ''; // reset

    const ul = document.createElement('ul');
    ul.className = 'mission-list';
    ul.style.listStyle = 'none';
    ul.style.margin = '0';
    ul.style.padding = '0';

    items.forEach(item => {
      const li = document.createElement('li');
      li.className = 'mission-item';
      if (typeof item.size === 'number') li.setAttribute('data-size', String(item.size));

      const img = document.createElement('img');
      img.className = 'mission-item__icon';
      img.src = MISSION_ICON_MAP[item.key] || '';
      img.alt = item.label || item.key;
      img.decoding = 'async'; img.loading = 'lazy';

      const label = document.createElement('div');
      label.className = 'mission-item__label';
      label.textContent = item.label || item.key;

      const meta = document.createElement('div');
      meta.className = 'mission-item__meta';
      meta.textContent = item.meta || '';

      li.appendChild(img);
      li.appendChild(label);
      li.appendChild(meta);
      ul.appendChild(li);
    });

    panel.appendChild(ul);
  }

  /** ▼ 追加：現在のレベル/進捗からMission欄の行を構築 */
  _buildMissionItems(){
    // ここで「画像＋テキスト」の行を定義
    // （メタ情報は現在の進捗から生成）
    const L = this.level || {};
    const lines = [];

    // ロボット
    //lines.push({ key:'ロボット', label:'ロボット', meta:`(${this.progress.pos.x},${this.progress.pos.y})` });

    // モンスター
    const totalMon = (Array.isArray(L.enemies)? L.enemies.reduce((a,b)=>a+(b.count|0),0):0) | 0;
    const downMon  = Object.values(this.progress.stats.defeated||{}).reduce((a,b)=>a+(b|0),0);
    if (totalMon>0) lines.push({ key:'モンスター', label:'モンスター', meta:`討伐 ${downMon}/${totalMon}` });

    // ゲートカード（key）
    const needKey = !!(Array.isArray(L.pickups) && L.pickups.some(p=>p.type==='key'));
    if (needKey) {
      const have = (this.progress.inventory.key|0) > 0;
      lines.push({ key:'ゲートカード', label:'ゲートカード', meta: have ? '所持' : '未所持' });
    }

    // ブラスターガン（weapon）
    const needWeapon = !!(Array.isArray(L.pickups) && L.pickups.some(p=>p.type==='weapon'));
    if (needWeapon) {
      const haveW = (this.progress.inventory.weapon|0) > 0;
      lines.push({ key:'ブラスターガン', label:'ブラスターガン', meta: haveW ? '所持' : '未所持' });
    }

    // ゴール
    lines.push({ key:'ゴール', label:'ゴール', meta: this.progress.reachedGoal ? '到達' : '未到達' });

    return lines;
  }
}