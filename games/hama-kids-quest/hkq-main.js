import { createPalette } from "../../common/ui/palette.js";
import { Interpreter } from "../../common/engine/interpreter.js";
import { HkqScene } from "./hkq-scene.js";

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
const resetBtn = document.getElementById("reset");
const exitBtn  = document.getElementById("exit");

// ===== パレット（表示=矢印 / 内部op=英語） =====
const CMDS = [
  { label: "↑", op: "up" },
  { label: "↓", op: "down" },
  { label: "→", op: "right" },
  { label: "←", op: "left" },
  { label: "くり返し", op: "repeat" }
];
createPalette(paletteRoot, programList, CMDS);

// ---- Drag&Drop 無効化（pointer/click を奪わせない） ----
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

// ---- パレットの各ボタンに label/op を必ず持たせる（保険）----
const jp2en = { "↑":"up","↓":"down","→":"right","←":"left","くり返し":"repeat" };
paletteRoot?.querySelectorAll('.cmd, [data-op]').forEach(el=>{
  const label = (el.dataset.label || el.textContent || "").trim();
  if (!el.dataset.op && jp2en[label]) el.dataset.op = jp2en[label];
  if (!el.dataset.label) el.dataset.label = label;
});

// ===== Main に1コマンド追加（表示=矢印 / data-op=英語） =====
function addProgramCmd(label, op){
  if (!op) return;
  const li = document.createElement('li');
  li.className = 'cmd';
  li.dataset.op = op;       // Interpreter向け: 英語
  li.dataset.label = label; // 表示用: 矢印
  li.textContent = label;
  li.setAttribute('title', label);
  programList.appendChild(li);
  return li;
}

// ===== UIロック中は入力拒否（タイトルフェード中） =====
function isLocked(){ return document.body.classList.contains('ui-locked'); }

// ===== 二重発火ガード =====
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

// ===== パレット押下 → Main 即追加（くり返し=直前複製） =====
function onPalettePress(ev){
  if (isLocked()) return;
  const btn = ev.target.closest('[data-op], .cmd');
  if (!btn || !paletteRoot.contains(btn)) return;

  const op    = btn.dataset.op || jp2en[(btn.textContent||"").trim()];
  const label = btn.dataset.label || (btn.textContent||"").trim();
  if (!op) return;

  if (op === "repeat"){
    const last = programList.querySelector('.cmd:last-of-type');
    if (!last) return;
    const baseOp    = last.dataset.op;
    const baseLabel = last.dataset.label || last.textContent || "";
    if (!baseOp || baseOp === "repeat") return;
    const n = window.prompt("くり返し回数を入力（2〜9）", "2");
    const count = Math.max(2, Math.min(9, parseInt(n,10) || 2));
    for (let i=0;i<count-1;i++) addProgramCmd(baseLabel, baseOp);
  } else {
    addProgramCmd(label, op);
  }

  btn.classList.add('pressed'); setTimeout(()=>btn.classList.remove('pressed'),120);
}
paletteRoot.addEventListener('pointerup', dispatchOnce(onPalettePress), { passive:false });
paletteRoot.addEventListener('click',     dispatchOnce(onPalettePress), { passive:false });

// ===== Main：タップ/クリックで削除 =====
function onProgramTap(ev){
  const cmd = ev.target.closest('.cmd');
  if (!cmd || !programList.contains(cmd)) return;
  cmd.remove();
}
programList.addEventListener('pointerup', dispatchOnce(onProgramTap), { passive:false });
programList.addEventListener('click',     dispatchOnce(onProgramTap), { passive:false });

// ===== Interpreter（英語→矢印に変換して HkqScene へ） =====
const en2sym = { up:"↑", down:"↓", right:"→", left:"←", repeat:"くり返し" };
const sym2sym = { "↑":"↑","↓":"↓","→":"→","←":"←","くり返し":"くり返し" };
const interp = new Interpreter({
  programList,
  onTick:  (op) => {
    // HkqScene.onTick は英語・矢印・日本語のいずれも受けられる実装にしてある想定
    const sym = en2sym[op] || sym2sym[op] || op;
    scene()?.onTick?.(sym);
  },
  onReset: () => scene()?.resetLevel?.(),
  tickDelay: 300, // ← ★ 実行間隔：ゆっくりめ（歩行Tweenを260msにするなら+40msくらい）
});

// ===== 実行・停止・リスタート・終了（連打ガード） =====
let _resetting = false, _cool = null;
function cooldown(btn, ms=300){
  if (_cool) clearTimeout(_cool);
  _resetting = true; btn && (btn.disabled = true);
  _cool = setTimeout(()=>{ _resetting=false; btn && (btn.disabled=false); }, ms);
}

runBtn  && (runBtn.onclick  = ()=>{ if (_resetting) return; interp.run();  });
stepBtn && (stepBtn.onclick = ()=>{ if (_resetting) return; interp.step(); });
stopBtn && (stopBtn.onclick = ()=>{ interp.stop(); });

resetBtn && (resetBtn.onclick = ()=>{
  if (_resetting) return;
  cooldown(resetBtn, 300);
  // ★ Mainパレットのコマンドを全クリア
  try{ programList.innerHTML = ""; }catch(e){}
  try{ interp.stop?.(); }catch(e){}
  try{ interp.reset?.(); }catch(e){}
  try{ scene()?.resetLevel?.(); }catch(e){}
});

exitBtn && (exitBtn.onclick = ()=>{
  try{ interp.stop?.(); }catch(e){}
  programList.innerHTML = "";
  try{ scene()?.gotoMission?.(0); }catch(e){}
});

// ===== タイトルバー（scene からの通知で更新） =====
document.addEventListener("hkq:mission-start", (e)=>{
  const titleEl   = document.getElementById("game-title");
  const missionEl = document.getElementById("mission-label");
  const elapsedEl = document.getElementById("elapsed");
  missionEl && (missionEl.textContent = `ミッション ${e.detail.mission+1}`);
  titleEl   && (titleEl.textContent   = "Hama Kids Quest");

  // 経過タイマー
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