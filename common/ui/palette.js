import { CommandSet } from "../engine/commands.js";

export function createPalette(paletteRoot, programList, cmds){
  // パレット
  cmds.forEach(c=>{
    const b = document.createElement("div");
    b.className = "cmd"; b.draggable = true; b.textContent = label(c);
    b.dataset.cmd = c;
    b.addEventListener("dragstart", e=> e.dataTransfer.setData("text/plain", c));
    paletteRoot.appendChild(b);
  });

  // ドロップ先（プログラム列）
  programList.addEventListener("dragover", e=> e.preventDefault());
  programList.addEventListener("drop", e=>{
    e.preventDefault();
    const cmd = e.dataTransfer.getData("text/plain");
    addItem(programList, cmd);
  });

  // クリックで削除
  programList.addEventListener("click", e=>{
    if(e.target.tagName==="LI") e.target.remove();
  });
}

function addItem(list, cmd){
  const li = document.createElement("li");
  li.textContent = label(cmd);
  li.dataset.cmd = cmd;
  list.appendChild(li);
}

function label(cmd){
  switch(cmd){
    case CommandSet.MOVE: return "→ 前進";
    case CommandSet.TURN_L: return "↶ 左回転";
    case CommandSet.TURN_R: return "↷ 右回転";
    case CommandSet.LIGHT: return "💡 点灯";
    case CommandSet.JUMP: return "⤴ ジャンプ";
    default: return cmd;
  }
}