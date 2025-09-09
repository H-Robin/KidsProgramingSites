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

// 命令パレットUI（回転/JUMPは使わない → 方向＋LIGHT）
const paletteRoot = document.getElementById("palette");
const programList = document.getElementById("program");
const cmds = ["UP","RIGHT","DOWN","LEFT","LIGHT"];
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

// === タッチ/クリックで追加 ===
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

// === タッチ/クリックで削除（クリア） ===
function onProgramTap(ev){
  const cmd = ev.target.closest('.cmd');
  if (!cmd) return;
  cmd.remove();
}

// タップ/クリックで Main から削除
programList.addEventListener('click', onProgramTap);
programList.addEventListener('touchend', onProgramTap, { passive:true });

// Interpreter（安全呼び出し）
const interp = new Interpreter({
  programList,
  onTick:  (op) => scene()?.onTick?.(op),
  onReset: ()   => scene()?.resetLevel?.(),
});

// ボタン
document.getElementById("run").onclick   = () => interp.run();
document.getElementById("step").onclick  = () => interp.step();
document.getElementById("stop").onclick  = () => interp.stop();
document.getElementById("reset").onclick = () => interp.reset();