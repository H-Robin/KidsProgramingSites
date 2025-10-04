// hkq-mission.js — Mission UI / conditions evaluator / HUD sync
import { HKQ_EVENTS } from '../common/events.js';

/**
 * DOM 準備完了を待ってから関数を実行（多重呼び出しでも安全）
 * @param {() => void} fn 実行する関数
 */
function onDOMReady(fn){
  if (document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', fn, { once:true });
  } else {
    fn();
  }
}

// ▼ Mission欄のアイコン画像パスは config に集約
import { MISSION_ICON_MAP } from '../main/config.js';
/**
 * ミッション欄に表示するアイコンを 1 件登録
 * @param {string} key 表示名（例: "モンスター"）
 * @param {string} path 画像パス
 */
export function registerMissionIcon(key, path){ MISSION_ICON_MAP[key] = path; }
/**
 * ミッション欄に表示するアイコンを複数まとめて登録
 * @param {{[k:string]: string}} dict キー:パスの辞書
 */
export function registerMissionIcons(dict){ Object.assign(MISSION_ICON_MAP, dict); }

// デフォルトライフ値
export const DEFAULT_LIFE = 3;

/**
 * レベル定義(JSON)からライフ最大値を取得
 * @param {any} level レベル定義オブジェクト
 * @returns {number} ライフ最大値（不正時は DEFAULT_LIFE）
 */
export function getLifeCountFrom(level){
  const list = []
    .concat(Array.isArray(level?.conditions) ? level.conditions : [])
    .concat(Array.isArray(level?.clear?.conditions) ? level.clear.conditions : []);
  const c = list.find(x => x?.type === 'life0' || x?.id === 'life_zero');
  const n = Number(c?.count);
  return (Number.isFinite(n) && n > 0) ? n : DEFAULT_LIFE;
}

/**
 * ミッション表示・条件評価・HUD 同期を司るクラス
 */
export class Mission {
  /**
   * @param {any} level レベル定義オブジェクト
   */
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
    // Initialize HUD only after DOM is ready and elements exist
    this._hudInitDone = false;
    onDOMReady(() => this._initHudWhenReady());
  }

  /**
   * DOM が用意され、HUD 要素が存在するときだけ初期化（再入しても安全）
   * @private
   * @returns {void}
   */
  _initHudWhenReady(){
    if (this._hudInitDone) return;
    const btn   = document.getElementById('btn-toggle-mission');
    const panel = document.getElementById('mission-panel');
    // 必須要素が無ければ、次フレームで再試行（最大数回）
    if (!btn || !panel) {
      if ((this._hudInitRetry|0) > 8) {
        console.warn('[hkq] HUD init skipped: required nodes not found (#btn-toggle-mission / #mission-panel)');
        return;
      }
      this._hudInitRetry = (this._hudInitRetry|0) + 1;
      requestAnimationFrame(() => this._initHudWhenReady());
      return;
    }
    // 初期化
    this._initMissionToggleButton();
    this.renderMissionPanel();
    this._syncMissionPanelFromAria();
    this._hudInitDone = true;
  }

  /**
   * ミッションパネルの可視状態を強制同期
   * - hidden 属性 / .is-hidden / .collapsed / style.display を一括管理
   * @private
   * @param {boolean} on 表示するか
   * @returns {void}
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

  /**
   * DOM の CustomEvent を受けて内部状態と HUD を同期
   * @private
   * @returns {void}
   */
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

    document.addEventListener(HKQ_EVENTS.MISSION_START, this._handlers.start);
    document.addEventListener(HKQ_EVENTS.MOVE,          this._handlers.move);
    document.addEventListener(HKQ_EVENTS.ITEM_PICK,     this._handlers.pick);
    document.addEventListener(HKQ_EVENTS.ENEMY_DOWN,    this._handlers.down);
    document.addEventListener(HKQ_EVENTS.REACH_GOAL,    this._handlers.reach);
    document.addEventListener(HKQ_EVENTS.LIFE_CHANGED,  this._handlers.life);
  }

  /**
   * HUD ミッションの表示/非表示トグルボタンのラベル（sr-only）と状態同期
   * - aria-pressed=true なら「ミッションタスク非表示」
   * - aria-pressed=false なら「ミッションタスク表示」
   * - 可能なら対象パネルの開閉もここで制御（既存実装があっても二重にならないよう class+hidden を統一）
   * @private
   * @returns {void}
   */
  _initMissionToggleButton(){
    const btn = document.getElementById('btn-toggle-mission');
    if (!btn) return;

    // 再入対策（重複バインド解除）
    if (this._onMissionToggle) btn.removeEventListener('click', this._onMissionToggle);
    if (this._onMissionKey)    document.removeEventListener('keydown', this._onMissionKey);

    const LS_KEY   = 'hkq.hud.mission.visible';
    const targetId = btn.getAttribute('aria-controls') || 'hud-mission';
    const panel    = document.getElementById(targetId) || null;
    const sr       = btn.querySelector('.sr-only');

    const setPressed = (on)=>{
      btn.setAttribute('aria-pressed', String(on));
      const label = on ? 'ミッションタスク非表示' : 'ミッションタスク表示';
      if (sr) sr.textContent = label;
      btn.title = `ミッションタスクの${on ? '非表示' : '表示'} (M)`;
      try { localStorage.setItem(LS_KEY, on ? '1' : '0'); } catch(_){}
    };

    const applyPanel = (on)=> this._setMissionPanelVisible(!!on);

    // 初期状態（既定: 表示）。localStorage が 0 なら非表示で開始
    let initialVisible = true;
    try {
      const v = localStorage.getItem(LS_KEY);
      if (v === '0') initialVisible = false;
    } catch(_){}

    setPressed(initialVisible);
    applyPanel(initialVisible);

    // クリックでトグル
    this._onMissionToggle = (ev)=>{
      ev.preventDefault(); ev.stopPropagation();
      const next = !(btn.getAttribute('aria-pressed') === 'true');
      setPressed(next);
      applyPanel(next);
    };
    btn.addEventListener('click', this._onMissionToggle);

    // キーボード: M でトグル（入力中は無効）
    this._onMissionKey = (e)=>{
      if (!e || String(e.key).toLowerCase() !== 'm') return;
      const tag = (e.target && e.target.tagName) || '';
      if (/INPUT|TEXTAREA|SELECT/.test(tag)) return;
      const next = !(btn.getAttribute('aria-pressed') === 'true');
      setPressed(next);
      applyPanel(next);
    };
    document.addEventListener('keydown', this._onMissionKey);
  }

  /**
   * イベント購読を解除
   * @returns {void}
   */
  dispose(){
    if (!this._handlers) return;
    document.removeEventListener(HKQ_EVENTS.MISSION_START, this._handlers.start);
    document.removeEventListener(HKQ_EVENTS.MOVE,          this._handlers.move);
    document.removeEventListener(HKQ_EVENTS.ITEM_PICK,     this._handlers.pick);
    document.removeEventListener(HKQ_EVENTS.ENEMY_DOWN,    this._handlers.down);
    document.removeEventListener(HKQ_EVENTS.REACH_GOAL,    this._handlers.reach);
    document.removeEventListener(HKQ_EVENTS.LIFE_CHANGED,  this._handlers.life);
    this._handlers = null;
  }

  /**
   * 内部状態を初期化して HUD を再描画
   * @param {any} level レベル定義（省略時は前回値）
   * @returns {void}
   */
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

  /**
   * 1 条件の評価ロジック
   * - ゲーム本体（scene）から inventory / reachedGoal を受け取り評価
   * @private
   * @param {{type:string, id?:string, item?:string, count?:number, requires?:string[], text?:string}} c 条件
   * @param {{inventory?:Object, reachedGoal?:boolean}} ctx 評価用コンテキスト
   * @returns {boolean} 条件を満たすか
   */
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

  /**
   * クリア条件を評価
   * @param {{inventory?:Object, progress?:{reachedGoal?:boolean}}} [ctx] 外部から与える状態（任意）
   * @returns {{done:boolean, results:{id?:string, type:string, ok:boolean, text:string}[]}}
   */
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

  /**
   * クリア条件表示（チェックリスト）を更新
   * @param {boolean} [fireClear=false] すべて達成時にイベント `hkq:mission-cleared` を発火
   * @returns {void}
   */
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
      document.dispatchEvent(new CustomEvent(HKQ_EVENTS.MISSION_CLEARED));
    }
  }

  /**
   * ミッションパネル（アイコン + テキストリスト）を再描画
   * @param {{iconSize?:number}} [options]
   * @returns {void}
   */
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

  /**
   * ミッションパネルに表示する行データを組み立てる
   * @private
   * @returns {{key:string|null, label:string, meta?:string, iconPath?:string, size?:number}[]} 行配列
   */
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
   * @private
   * @returns {void}
   */
  _syncMissionPanelFromAria(){
    const btn = document.getElementById('btn-toggle-mission');
    if (!btn) return;
    const targetId = btn.getAttribute('aria-controls') || 'hud-mission';
    const panel = document.getElementById(targetId);
    if (!panel) return;
    const on = btn.getAttribute('aria-pressed') === 'true';
    try { localStorage.setItem('hkq.hud.mission.visible', on ? '1' : '0'); } catch(_){}
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
