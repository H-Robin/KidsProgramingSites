// palette.js — 置き換え版（クリック追加に統一 / DnDは持たない）
export function createPalette(paletteRoot, programList, cmds){
  // cmds: [{ label:"まえ", op:"forward" }, ...] を想定（表示=日本語 / 内部=英語）
  if (!paletteRoot) return;

  // 既存クリア（必要なら）
  // paletteRoot.innerHTML = "";

  cmds.forEach(c=>{
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "cmd";
    btn.textContent   = c.label;   // 画面表示は日本語
    btn.dataset.label = c.label;   // 表示ラベル
    btn.dataset.op    = c.op;      // Interpreter に渡す英語トークン
    btn.draggable = false;         // DnDは使わない（hkq-main.js側でクリック追加）
    paletteRoot.appendChild(btn);
  });

  // ★ ここでは programList には一切触れない（追加/削除は hkq-main.js 側で処理）
}