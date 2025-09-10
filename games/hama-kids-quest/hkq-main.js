import { CommandSet } from "../../common/engine/commands.js";
import { createPalette } from "../../common/ui/palette.js";
import { Interpreter } from "../../common/engine/interpreter.js";
import { HkqScene } from "./hkq-scene.js";

// Phaser 設定（端末に自動フィット）
const config = {
  type: Phaser.AUTO,
  parent: "game-container",
  width: 1280,
  height: 720,
  backgroundColor: "#0b1020",
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  pixelArt: true,
  scene: [HkqScene],
};

const game = new Phaser.Game(config);
const scene = () => game.scene.keys["HkqScene"];

// 命令パレットUI（方向のみ）
const paletteRoot = document.getElementById("palette");
const programList = document.getElementById("program");
const cmds = ["UP","RIGHT","DOWN","LEFT"];
createPalette(paletteRoot, programList, cmds);

// 作られた方向ボタンをアイコン化
const labelMap = { UP:"上へ", RIGHT:"右へ", DOWN:"下へ", LEFT:"左へ" };
[...paletteRoot.querySelectorAll('.cmd')].forEach(el=>{
  const op = el.dataset.op;
  if(op in labelMap){
    el.classList.add("icon");
    el.setAttribute("title", `${labelMap[op]}（1マス）`);
    el.setAttribute("aria-label", labelMap[op]);
    el.textContent = ""; // 見た目はアイコンに任せる
  }
});

// === タッチ/クリックで Main に追加 ===
function addProgramCmd(op, makeIcon){
  const el = document.createElement('li');
  el.className = 'cmd' + (makeIcon ? ' icon' : '');
  el.dataset.op = op;
  el.textContent = makeIcon ? '' : op;
  // アクセシビリティ表記
  const labelMap = { UP:"上へ", RIGHT:"右へ", DOWN:"下へ", LEFT:"左へ" };
  if (makeIcon && labelMap[op]) {
    el.setAttribute('title', `${labelMap[op]}（1マス）`);
    el.setAttribute('aria-label', labelMap[op]);
  }
  programList.appendChild(el);
}

function onPaletteTap(ev){
  const btn = ev.target.closest('.cmd');
  if (!btn) return;
  const op = btn.dataset.op;
  if (!op) return;
  addProgramCmd(op, btn.classList.contains('icon'));
}

// タップ/クリックで Main に追加
paletteRoot.addEventListener('click', onPaletteTap);
paletteRoot.addEventListener('touchend', onPaletteTap, { passive:true });

// === タップ/クリックで削除（Mainから） ===
function onProgramTap(ev){
  const cmd = ev.target.closest('.cmd');
  if (!cmd) return;
  cmd.remove();
}
programList.addEventListener('click', onProgramTap);
programList.addEventListener('touchend', onProgramTap, { passive:true });

// Interpreter（安全呼び出し）
const interp = new Interpreter({
  programList,
  onTick:  (op) => scene()?.onTick?.(op),
  onReset: ()   => scene()?.resetLevel?.(),
});

// === ボタンと連打ガード ===
const runBtn   = document.getElementById("run");
const stepBtn  = document.getElementById("step");
const stopBtn  = document.getElementById("stop");
const resetBtn = document.getElementById("reset");

let _resetting = false;
let _cooldownTimer = null;

function beginCooldown(btn, ms=300){
  if (_cooldownTimer) clearTimeout(_cooldownTimer);
  _resetting = true;
  if (btn) btn.disabled = true;
  _cooldownTimer = setTimeout(()=>{
    _resetting = false;
    if (btn) btn.disabled = false;
  }, ms);
}

// 実行系：リセット中は受け付けない
runBtn.onclick  = () => { if (_resetting) return; interp.run();  };
stepBtn.onclick = () => { if (_resetting) return; interp.step(); };
stopBtn.onclick = () => { /* stop はいつでもOKだが念のため */ interp.stop(); };

// Reset：stop → resetLevel → クールダウン（再入防止）
resetBtn.onclick = () => {
  if (_resetting) return;
  beginCooldown(resetBtn, 300);       // ★ 連打ガード

  try { interp.stop?.(); } catch(e) {}
  try { interp.reset?.(); } catch(e) {}  // Interpreter 内部で ops を再構成

  const sc = scene();
  try { sc?.resetLevel?.(); } catch(e) {}
};