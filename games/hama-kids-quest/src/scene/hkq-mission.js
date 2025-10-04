// hkq-mission.js — Mission UI / conditions evaluator / HUD sync

// ▼ Mission欄のアイコン画像パス（必要に応じて追加）
export const MISSION_ICON_MAP = {
  "ロボット":       "assets/robot/idle/character_robot_idle0.png",
  "モンスター":     "assets/enemy/monster-a/idle/idle1.png",
  "ポータルキー":   "assets/items/portalkey.png",
  "ゲートカード":   "assets/items/gatecard.png",
  "ゴール":         "assets/floor/moon-base2.png",
  "建設予定地":     "assets/floor/planedsite_goal.png",
  "ブラスターガン": "assets/weapon/blaster-a.png",
  "設計図":         "assets/items/blueprint1.png",
  // "エネルギー":   "assets/ui/energy.png", // 任意: 用意できたら使う
};
export function registerMissionIcon(key, path){ MISSION_ICON_MAP[key] = path; }
export function registerMissionIcons(dict){ Object.assign(MISSION_ICON_MAP, dict); }

// デフォルトライフ値
export const DEFAULT_LIFE = 3;

// JSONからライフ最大値を取得
export function getLifeCountFrom(level){
  const list = []
    .concat(Array.isArray(level?.conditions) ? level.conditions : [])
    .concat(Array.isArray(level?.clear?.conditions) ? level.clear.conditions : []);
  const c = list.find(x => x?.type === 'life0' || x?.id === 'life_zero');
  const n = Number(c?.count);
  return (Number.isFinite(n) && n > 0) ? n : DEFAULT_LIFE;
}

export class Mission {
  constructor(level){
    this.level = level || null;
    this.lifeMax = getLifeCountFrom(this.level);
    this.progress = {
      pos:{x:0,y:0},
      reachedGoal:false,
      inventory:{},         // { key:number|bool, weapon:bool, blueprint:number, ... }
      stats:{ life:this.lifeMax, defeated:{} } // defeated: { 'monster-a': n, ... }
    };
    this._bindEvents();
    this.renderMissionPanel();
    this._initMissionToggleButton();
    this._syncMissionPanelFromAria();
  }

  /**
   * ミッションパネルの可視状態を強制同期
   * - hidden 属性 / .is-hidden / .collapsed / style.display を一括管理
   */
  _setMissionPanelVisible(on){
    const btn = document.getElementById('btn-toggle-mission');
    if (!btn) return;
    const targetId = btn.getAttribute('aria-controls') || 'hud-mission';
    const panel = document.getElementById(targetId);
    if (!panel) return;

    if (on){
      panel.hidden = false;
      panel.removeAttribute('hidden');
      panel.classList.remove('is-hidden');
      panel.classList.remove('collapsed');
      panel.style.display = '';
    } else {
      panel.hidden = true;
      panel.setAttribute('hidden', '');
      panel.classList.add('is-hidden');
      panel.style.display = 'none';
    }
  }

  /* ------------------------------------------------------------------------ *
   * Events bridge (DOM CustomEvents)
   * ------------------------------------------------------------------------ */
  _bindEvents(){
    this._handlers = {
      start : (e)=>{
        if (e?.detail?.level) this.reset(e.detail.level);
        this.render(false);
        this.renderMissionPanel();
      },
      move  : (e)=>{
        this.progress.pos = e?.detail?.pos || this.progress.pos;
        this.render(false);
      },
      pick  : (e)=>{
        const id = e?.detail?.id;
        if (!id) return;
        const inv = this.progress.inventory;
        // weapon/key は booleanでも数でも対応
        if (id === 'weapon' || id === 'key' || id==='portalkey') {
          inv[id] = (inv[id]|0) + 1; // boolean→数に寄せる（UI上は有無を見る）
        } else {
          inv[id] = (inv[id]|0) + 1;
        }
        this.render(false);
        this.renderMissionPanel();
      },
      down  : (e)=>{
        const t = e?.detail?.type || 'enemy';
        const map = this.progress.stats.defeated;
        map[t] = (map[t]|0) + 1;
        this.render(false);
        this.renderMissionPanel();
      },
      reach : ()=>{
        this.progress.reachedGoal = true;
        this.render(true);
        this.renderMissionPanel();
      },
      // 追加: ライフのUI同期
      life  : (e)=>{
        const v = Number(e?.detail?.value ?? DEFAULT_LIFE);
        this.progress.stats.life = Number.isFinite(v) ? v : DEFAULT_LIFE;
        this.renderMissionPanel();
      }
    };

    document.addEventListener('hkq:mission-start', this._handlers.start);
    document.addEventListener('hkq:move',          this._handlers.move);
    document.addEventListener('hkq:item-pick',     this._handlers.pick);
    document.addEventListener('hkq:enemy-down',    this._handlers.down);
    document.addEventListener('hkq:reach-goal',    this._handlers.reach);
    document.addEventListener('hkq:life-changed',  this._handlers.life);
  }

  /**
   * HUD ミッションの表示/非表示トグルボタンのラベル（sr-only）と状態同期
   * - aria-pressed=true なら「ミッションタスク非表示」
   * - aria-pressed=false なら「ミッションタスク表示」
   * - 可能なら対象パネルの開閉もここで制御（既存実装があっても二重にならないよう class+hidden を統一）
   */
  _initMissionToggleButton(){
    const btn = document.getElementById('btn-toggle-mission');
    if (!btn) return;

    // 重複バインド防止
    if (this._onMissionToggle){
      btn.removeEventListener('click', this._onMissionToggle);
    }

    const targetId = btn.getAttribute('aria-controls') || 'hud-mission';
    const panel = document.getElementById(targetId) || null;
    const sr = btn.querySelector('.sr-only');

    // 現在の可視状態を推定
    const isVisible = (el)=>{
      if (!el) return btn.getAttribute('aria-pressed') === 'true';
      const cs = window.getComputedStyle(el);
      const hiddenAttr = el.hasAttribute('hidden');
      const hiddenClass = el.classList.contains('is-hidden');
      const none = cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0';
      return !(hiddenAttr || hiddenClass || none);
    };

    const setPressed = (on)=>{
      btn.setAttribute('aria-pressed', String(on));
      // SRテキスト＆title切替
      const label = on ? 'ミッションタスク非表示' : 'ミッションタスク表示';
      if (sr) sr.textContent = label;
      btn.title = `ミッションタスクの${on ? '非表示' : '表示'} (M)`;
    };

    const applyPanel = (on)=> this._setMissionPanelVisible(!!on);

    // クリックでトグル（開閉も行う）
    this._onMissionToggle = (ev)=>{
      ev.preventDefault();
      ev.stopPropagation();
      const next = !(btn.getAttribute('aria-pressed') === 'true');
      setPressed(next);
      applyPanel(next);
    };
    btn.addEventListener('click', this._onMissionToggle);

    // 外部から表示状態が変わる可能性に備え、簡易同期（任意：必要なら有効に）
    // const observer = new MutationObserver(()=> setPressed(isVisible(panel)));
    // if (panel) observer.observe(panel, { attributes:true, attributeFilter:['class','hidden','style'] });
  }

  dispose(){
    if (!this._handlers) return;
    document.removeEventListener('hkq:mission-start', this._handlers.start);
    document.removeEventListener('hkq:move',          this._handlers.move);
    document.removeEventListener('hkq:item-pick',     this._handlers.pick);
    document.removeEventListener('hkq:enemy-down',    this._handlers.down);
    document.removeEventListener('hkq:reach-goal',    this._handlers.reach);
    document.removeEventListener('hkq:life-changed',  this._handlers.life);
    this._handlers = null;
  }

  /* ------------------------------------------------------------------------ *
   * State reset
   * ------------------------------------------------------------------------ */
  reset(level){
    this.level = level || this.level || {};
    this.lifeMax = getLifeCountFrom(this.level);
    this.progress = { pos:{x:0,y:0}, 
        reachedGoal:false, inventory:{}, 
        stats:{ life:this.lifeMax, defeated:{} }
    };

    // クリア条件表示の初期化（チェックボックス欄）
    const el = document.getElementById('mission-clear-text');
    if (el){
      const conds = this.level?.clear?.conditions || [];
      el.innerHTML = conds.map(c =>
        `<div class="cc-item"><span class="cc-check">⬜️</span><span class="cc-text">${c.text || ''}</span></div>`
      ).join('');
    }

    this.renderMissionPanel();
  }

  /* ------------------------------------------------------------------------ *
   * Conditions evaluator (UI side)
   * - ゲーム本体（scene）から inventory / reachedGoal を受け取り評価
   * ------------------------------------------------------------------------ */
  _ok(c, ctx){
    switch (c.type) {
      case 'obtain': {
        const have = Number(ctx.inventory?.[c.item] || 0);
        const need = (c.count !== undefined) ? Number(c.count) : 1;

        // requires を全部持っていること
        if (Array.isArray(c.requires)) {
          for (const req of c.requires) {
            const reqHave = Number(ctx.inventory?.[req] || 0);
            if (reqHave <= 0) return false;
          }
        }
        return have >= need;
      }

      case 'reach': {
        // scene 側から reachedGoal:true で evaluate が呼ばれる前提
        return !!ctx.reachedGoal;
      }

      case 'life0': {
        // 「エネルギーが0にならない」= ライフ>0でOK
        const life = Number(this.progress?.stats?.life ?? DEFAULT_LIFE);
        return life > 0;
      }

      default:
        return false;
    }
  }

  evaluate(ctx = {}){
    const evalCtx = {
      inventory  : ctx.inventory || this.progress.inventory || {},
      reachedGoal: !!(ctx.progress?.reachedGoal || this.progress.reachedGoal)
    };

    const cs = Array.isArray(this.level?.clear?.conditions) ? this.level.clear.conditions : [];
    const results = cs.map(c => {
      const ok = this._ok(c, evalCtx);
      return { id: c.id, type: c.type, ok, text: c.text || '' };
    });

    const logic = (this.level?.clear?.logic || 'AND').toUpperCase();
    const done  = (logic === 'AND')
      ? results.every(r => r.ok)
      : results.some(r => r.ok);

    return { done, results };
  }

  render(fireClear=false){
    const el = document.getElementById('mission-clear-text');
    if (!el) return;

    const { done, results } = this.evaluate();
    el.innerHTML = results.map(r => `
      <div class="cc-item ${r.ok ? 'ok' : ''}">
        <span class="cc-check">${r.ok ? '✅' : '⬜️'}</span>
        <span class="cc-text">${r.text}</span>
      </div>
    `).join('');

    if (done && fireClear){
      document.dispatchEvent(new CustomEvent('hkq:mission-cleared'));
    }
  }

  /* ------------------------------------------------------------------------ *
   * Mission panel (icon + text list)
   * ------------------------------------------------------------------------ */
  renderMissionPanel(options = {}){
    const panel = document.getElementById('mission-panel');
    if (!panel) return;

    const lines = this._buildMissionItems();
    const { iconSize } = options;
    panel.style.setProperty('--mission-icon-size', (typeof iconSize==='number') ? `${iconSize}px` : '');

    panel.innerHTML = '';
    const ul = document.createElement('ul');
    ul.className = 'mission-list';
    ul.style.listStyle = 'none';
    ul.style.margin = '0';
    ul.style.padding = '0';

    lines.forEach(item => {
      const li = document.createElement('li');
      li.className = 'mission-item';
      if (typeof item.size === 'number') li.setAttribute('data-size', String(item.size));

      // 画像（あれば）
      const iconPath = item.iconPath || (item.key ? MISSION_ICON_MAP[item.key] : '');
      if (iconPath) {
        const img = document.createElement('img');
        img.className = 'mission-item__icon';
        img.src = iconPath;
        img.alt = item.label || item.key || '';
        img.decoding = 'async';
        img.loading  = 'lazy';
        li.appendChild(img);
      }

      // ラベル
      const label = document.createElement('div');
      label.className = 'mission-item__label';
      label.textContent = item.label || item.key || '';
      li.appendChild(label);

      // メタ（サブテキスト）
      if (item.meta) {
        const meta = document.createElement('div');
        meta.className = 'mission-item__meta';
        meta.textContent = item.meta;
        li.appendChild(meta);
      }

      ul.appendChild(li);
    });

    panel.appendChild(ul);
  }

  _buildMissionItems(){
    const L = this.level || {};
    const lines = [];

    // 1) エネルギー（最上段に固定）
    const life = Number(this.progress?.stats?.life ?? this.lifeMax ?? DEFAULT_LIFE);
    const maxL = Number(this.lifeMax ?? DEFAULT_LIFE);
    const hearts = '❤️'.repeat(Math.max(0, life)) + '🤍'.repeat(Math.max(0, maxL - life));
    lines.push({
      key: null,              // アイコンなし（用意できたら "エネルギー" をキーに）
      label: 'エネルギー',
      meta: `${hearts}  (${life}/${maxL})`,
    });

    // 2) モンスター（存在する面のみ）
    const totalMon = (Array.isArray(L.enemies)
      ? L.enemies.reduce((a,b)=>a+(b.count|0),0)
      : 0) | 0;
    const downMon  = Object.values(this.progress.stats.defeated||{}).reduce((a,b)=>a+(b|0),0);
    if (totalMon > 0) {
      lines.push({ key:'モンスター', label:'モンスター', meta:`討伐 ${downMon}/${totalMon}` });
    }

    // 3) ゲートカード（key）
    const needKey = !!(Array.isArray(L.pickups) && L.pickups.some(p=>p.type==='key'));
    if (needKey) {
      const have = (this.progress.inventory.key|0) > 0 || !!this.progress.inventory.key;
      lines.push({ key:'ゲートカード', label:'ゲートカード', meta: have ? '有' : '無' });
    }

    // 4) ブラスターガン（weapon）
    const needWeapon = !!(Array.isArray(L.pickups) && L.pickups.some(p=>p.type==='weapon'));
    if (needWeapon) {
      const haveW = (this.progress.inventory.weapon|0) > 0 || !!this.progress.inventory.weapon;
      lines.push({ key:'ブラスターガン', label:'ブラスターガン', meta: haveW ? '有' : '無' });
    }

    // 5) 設計図（blueprint）
    const bpDef = (Array.isArray(L.pickups) ? L.pickups.find(p=>p.type==='blueprint') : null);
    if (bpDef && (bpDef.count|0) > 0) {
      const have = this.progress.inventory.blueprint|0;
      lines.push({ key:'設計図', label:'設計図', meta:`取得 ${have}/${bpDef.count|0}` });
    }

       //  Portal（portalkey）
    const needPortalKey = !!(Array.isArray(L.pickups) && L.pickups.some(p=>p.type==='portalkey'));
    if (needPortalKey) {
      const have = (this.progress.inventory.portalkey|0) > 0 || !!this.progress.inventory.portalkey;
      lines.push({ key:'ポータルキー', label:'ポータルキー', meta: have ? '有' : '無' });
    }

    // 6) ゴール
    lines.push({ key:'ゴール', label:'ゴール', meta: this.progress.reachedGoal ? '到達' : '未到達' });

    return lines;
  }

    /**
   * ボタンの aria-pressed 状態から、対象パネルの可視状態を同期する
   * - 既存の hidden / is-hidden / style.display のいずれにも対応
   */
  _syncMissionPanelFromAria(){
    const btn = document.getElementById('btn-toggle-mission');
    if (!btn) return;
    const targetId = btn.getAttribute('aria-controls') || 'hud-mission';
    const panel = document.getElementById(targetId);
    if (!panel) return;
    const on = btn.getAttribute('aria-pressed') === 'true';
    if (on){
      panel.hidden = false;
      panel.removeAttribute('hidden');
      panel.classList.remove('is-hidden');
      panel.classList.remove('collapsed');
      panel.style.display = '';
    } else {
      panel.hidden = true;
      panel.setAttribute('hidden', '');
      panel.classList.add('is-hidden');
      panel.style.display = 'none';
    }
  }
}
