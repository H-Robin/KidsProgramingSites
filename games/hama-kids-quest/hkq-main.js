import { createPalette } from "./src/common/ui/palette.js";
import { Interpreter } from "./src/common/engine/interpreter.js";
import { HkqScene } from './src/scene/hkq-scene.js';

// ===== Phaser 設定 =====
const config = {
  type: Phaser.AUTO,
  parent: "game-container",
  width: 920,
  height: 720,
  backgroundColor: "#0b1020",
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  pixelArt: true,
  scene: [HkqScene],
};
const game  = new Phaser.Game(config);
const scene = () => game.scene.keys["HkqScene"];

// ===== DOM 参照 =====
const paletteRoot = document.getElementById("palette");
const programList = document.getElementById("program");
const runBtn   = document.getElementById("run");
const stepBtn  = document.getElementById("step");
const stopBtn  = document.getElementById("stop");
const exitBtn  = document.getElementById("exit");
// ▼ 追加：Main全体の繰り返し回数
const repeatSelect = document.getElementById("repeat-count");

// ===== パレット（表示=矢印 / 内部op=英語） =====
const CMDS = [
  { label: "↑", op: "up" },
  { label: "↓", op: "down" },
  { label: "→", op: "right" },
  { label: "←", op: "left" },
  { label: "くり返し", op: "repeat" }
];
createPalette(paletteRoot, programList, CMDS);

// --- 画像アイコンに差し替え（角度はアイソメ向き合わせ） ---
(function replacePaletteTextWithIcons(){
  const map = {
    up:    'assets/direction/arrow-ne.png', // ↗︎
    down: 'assets/direction/arrow-nw.png', // ↘︎
    right:  'assets/direction/arrow-se.png', // ↙︎
    left:  'assets/direction/arrow-sw.png', // ↖︎
  };
  const aliases = {
    up:    ['up','↑','まえ','上'],
    right: ['right','→','みぎ','右'],
    down:  ['down','↓','うしろ','下'],
    left:  ['left','←','ひだり','左'],
  };
  const guessKey = (txt) => {
    const s = txt.trim();
    for (const k of Object.keys(aliases)) if (aliases[k].includes(s)) return k;
    return null;
  };
  paletteRoot.querySelectorAll('.cmd').forEach(btn=>{
    if (btn.classList.contains('icon')) return;
    const label = (btn.dataset.label || btn.textContent || "").trim();
    const key = guessKey(label);
    if (!key) return;
    const src = map[key];
    btn.classList.add('icon');
    btn.setAttribute('aria-label', label);
    btn.innerHTML = `<img src="${src}" alt="${label}"><span class="sr-only">${label}</span>`;
  });
})();

// ---- DnD無効化／属性補完 ----
function disableDragAndDrop(root){
  if (!root) return;
  root.querySelectorAll('.cmd,[data-op]').forEach(el=>{
    el.draggable = false;
    el.ondragstart = e=>{ e.preventDefault(); return false; };
  });
  ["dragstart","dragover","drop","dragend"].forEach(type=>{
    root.addEventListener(type, e=>{ e.preventDefault(); e.stopPropagation(); }, { passive:false });
  });
}
disableDragAndDrop(paletteRoot);
disableDragAndDrop(programList);

const jp2en = { "↑":"up","↓":"down","→":"right","←":"left","くり返し":"repeat" };
paletteRoot?.querySelectorAll('.cmd, [data-op]').forEach(el=>{
  const label = (el.dataset.label || el.textContent || "").trim();
  if (!el.dataset.op && jp2en[label]) el.dataset.op = jp2en[label];
  if (!el.dataset.label) el.dataset.label = label;
});

// ===== Main へ追加 =====
function addProgramCmd(label, op){ return addProgramCmdInto(programList, label, op); }
function addProgramCmdInto(container, label, op){
  if (!op) return;
  const li = document.createElement('li');
  li.className = 'cmd';
  li.dataset.op = op; li.dataset.label = label;
  li.textContent = label;
  li.setAttribute('title', label);
  container.appendChild(li);
  return li;
}

// ===== くり返しブロック（入れ子禁止） =====
let recordingRepeat = null;
function createRepeatBlock(defaultCount=2){
  const block = document.createElement('li');
  block.className = 'block repeat';
  block.dataset.op = 'repeat';

  const head  = document.createElement('div'); head.className = 'repeat-head';
  const label = document.createElement('span'); label.textContent = 'くり返し';

  // ★ iPhoneでキーボードを出さない：数値入力→セレクト（2〜10固定）
  const count = document.createElement('select');
  count.className = 'repeat-count';
  for (let n = 2; n <= 10; n++) {
    const opt = document.createElement('option');
    opt.value = String(n);
    opt.textContent = String(n);
    count.appendChild(opt);
  }
  // 既定値の範囲クリップ（2〜10）
  const init = Math.min(10, Math.max(2, defaultCount|0 || 2));
  count.value = String(init);

  const endBtn = document.createElement('button');
  endBtn.type = 'button'; endBtn.className = 'repeat-close'; endBtn.textContent = 'End';

  head.appendChild(label); head.appendChild(count); head.appendChild(endBtn);

  const body = document.createElement('ul'); body.className = 'repeat-body';
  block.appendChild(head); block.appendChild(body); programList.appendChild(block);

  recordingRepeat = { blockEl:block, bodyEl:body, countInput:count };
  programList.classList.add('recording-repeat');

  endBtn.addEventListener('click', (e)=>{ e.stopPropagation(); });
  endBtn.addEventListener('pointerup', (e)=>{ e.stopPropagation(); });
  endBtn.addEventListener('click', ()=>{
    if (!body.querySelector('.cmd')) block.remove();
    recordingRepeat = null;
    programList.classList.remove('recording-repeat');
  });
  return block;
}

function isLocked(){ return document.body.classList.contains('ui-locked'); }
let _lastEvt = { t:0, x:0, y:0 };
function dispatchOnce(handler){
  return function(ev){
    const now = performance.now();
    const isDup = (now - _lastEvt.t) < 150 &&
      Math.abs((ev.clientX||0) - _lastEvt.x) < 4 &&
      Math.abs((ev.clientY||0) - _lastEvt.y) < 4;
    if (isDup) return;
    _lastEvt = { t: now, x: ev.clientX||0, y: ev.clientY||0 };
    ev.preventDefault?.(); ev.stopPropagation?.();
    handler(ev);
  };
}

function onPalettePress(ev){
  if (isLocked()) return;
  const btn = ev.target.closest('[data-op], .cmd');
  if (!btn || !paletteRoot.contains(btn)) return;
  const op    = btn.dataset.op || jp2en[(btn.textContent||"").trim()];
  const label = btn.dataset.label || (btn.textContent||"").trim();
  if (!op) return;

  if (op === "repeat"){
    if (recordingRepeat) return;
    createRepeatBlock(2);
  } else {
    if (recordingRepeat) addProgramCmdInto(recordingRepeat.bodyEl, label, op);
    else addProgramCmd(label, op);
  }
  btn.classList.add('pressed'); setTimeout(()=>btn.classList.remove('pressed'),120);
}
paletteRoot.addEventListener('pointerup', dispatchOnce(onPalettePress), { passive:false });
paletteRoot.addEventListener('click',     dispatchOnce(onPalettePress), { passive:false });
paletteRoot.addEventListener('pointerup', dispatchOnce(onPalettePress), { passive:false });

function onProgramTap(ev){
  if (ev.target.closest('.repeat-close') || ev.target.closest('.repeat-head')) return;
  const li = ev.target.closest('.cmd, .block.repeat');
  if (!li || !programList.contains(li)) return;
  if (recordingRepeat && recordingRepeat.blockEl === li){
    recordingRepeat = null;
    programList.classList.remove('recording-repeat');
  }
  li.remove();
}
programList.addEventListener('pointerup', dispatchOnce(onProgramTap), { passive:false });
programList.addEventListener('click',     dispatchOnce(onProgramTap), { passive:false });
programList.addEventListener('pointerup', dispatchOnce(onProgramTap), { passive:false });

// ===== Interpreter 準備 =====
const en2sym = { up:"↑", down:"↓", right:"→", left:"←", repeat:"くり返し" };
const sym2sym = { "↑":"↑","↓":"↓","→":"→","←":"←","くり返し":"くり返し" };
function makeInterpreter(listEl){
  return new Interpreter({
    programList: listEl,
    onTick:  (op) => {
      const sym = en2sym[op] || sym2sym[op] || op;
      scene()?.onTick?.(sym);
    },
    onReset: () => scene()?.resetLevel?.(),
    tickDelay: 300,
  });
}
let interp = makeInterpreter(programList);
let currentRunner = interp;

// ===== 実行・停止・終了 =====
let _resetting = false, _cool = null;
function cooldown(btn, ms=300){
  if (_cool) clearTimeout(_cool);
  _resetting = true; btn && (btn.disabled = true);
  _cool = setTimeout(()=>{ _resetting=false; btn && (btn.disabled=false); }, ms);
}

 // 実行用スナップショット：元DOMの「現在値」をクローンへ反映してから innerHTML を取得
 function serializeProgramHTML(container){
   const clone = container.cloneNode(true); // 深いコピー
 
   // --- select の現在値を【元DOM】から読み取り、クローンへ selected を付与 ---
   const origSelects  = container.querySelectorAll('select');
   const cloneSelects = clone.querySelectorAll('select');
   cloneSelects.forEach((sel, i) => {
     const cur = origSelects[i] ? origSelects[i].value : sel.value; // ← 元DOM優先
     Array.from(sel.options).forEach(opt => {
       if (opt.value === cur) opt.setAttribute('selected', 'selected');
       else opt.removeAttribute('selected');
     });
   });
 
   // --- input の現在値/状態を【元DOM】からクローンへ反映 ---
   const origInputs  = container.querySelectorAll('input');
   const cloneInputs = clone.querySelectorAll('input');
   cloneInputs.forEach((inp, i) => {
     const src = origInputs[i] || inp;
     if (inp.type === 'checkbox' || inp.type === 'radio') {
       if (src.checked) inp.setAttribute('checked', 'checked');
       else inp.removeAttribute('checked');
     } else {
       inp.setAttribute('value', src.value ?? '');
     }
   });
 
   return clone.innerHTML;
 }
runBtn && (runBtn.onclick = () => {
  if (_resetting) return;

   // ★ 開きっぱなしのくり返しブロックがあれば強制クローズ
   if (recordingRepeat) {
     const { blockEl, bodyEl } = recordingRepeat;
     if (!bodyEl.querySelector('.cmd')) {
       // 中身が空ならブロックごと削除
       blockEl.remove();
     }
     recordingRepeat = null;
     programList.classList.remove('recording-repeat');
   }

  // 1) Mainのスナップショットを取得
  const snapshotHTML = serializeProgramHTML(programList);
  // 空なら何もしない
  if (!snapshotHTML.trim()) return;

  // 2) Main全体の繰り返しは廃止 → 無条件で1回だけコピー
  const buffer = document.getElementById('program-run-buffer') || (()=> {
    const el = document.createElement('ol');
    el.id = 'program-run-buffer';
    el.style.display = 'none';
    document.body.appendChild(el);
    return el;
  })();
  buffer.innerHTML = snapshotHTML;  // 1回分のみ

  // 4) バッファを読む専用 Interpreter を作って走らせる
  const local = makeInterpreter(buffer);
  currentRunner = local;
  local.run();

  // 5) UIのMainは即クリア（仕様）
  programList.innerHTML = "";
});

stepBtn && (stepBtn.onclick = ()=>{ if (_resetting) return; currentRunner.step?.(); });
stopBtn && (stopBtn.onclick = ()=>{ try{ currentRunner.stop?.(); }catch(_){}});

exitBtn && (exitBtn.onclick = ()=>{
  try{ currentRunner.stop?.(); }catch(_){}
  programList.innerHTML = "";
  try{ scene()?.gotoMission?.(0); }catch(_){}
});

// ===== タイトルバー更新／クリア時の後処理 =====
document.addEventListener("hkq:mission-start", (e)=>{
  const titleEl   = document.getElementById("game-title");
  const missionEl = document.getElementById("mission-label");
  const elapsedEl = document.getElementById("elapsed");
  missionEl && (missionEl.textContent = `ミッション ${e.detail.mission+1}`);
  titleEl   && (titleEl.textContent   = "Hama Kids Quest");

  if (elapsedEl){
    const t0 = Date.now();
    clearInterval(elapsedEl._tid);
    elapsedEl._tid = setInterval(()=>{
      const s  = Math.floor((Date.now()-t0)/1000);
      const mm = String(Math.floor(s/60)).padStart(2,"0");
      const ss = String(s%60).padStart(2,"0");
      elapsedEl.textContent = `${mm}:${ss}`;
    }, 250);
  }
});

// ミッションクリア時：Mainを自動クリア＆実行インタプリタ停止
document.addEventListener("hkq:mission-cleared", ()=>{
  try { programList.innerHTML = ""; } catch(_){}
  try { currentRunner.stop?.(); } catch(_){}
  [runBtn, stepBtn].forEach(b=>{ if(b){ b.disabled = true; setTimeout(()=>b.disabled=false, 800);} });
});