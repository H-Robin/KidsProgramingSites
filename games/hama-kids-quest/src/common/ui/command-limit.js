// src/ui/command-limit.js
// コマンド上限UI制御（トップレベル上限 & repeat内上限）
// 使い方：importして initCommandLimitUI({...}) を1回呼ぶだけ。

export function initCommandLimitUI({
  programListSel = '#program-list',
  paletteBtnSel = '.palette .btn',
  capBarSel = '#cmd-limit-bar',
  leftSel = '#cmd-left',
  hintSel = '#cmd-hint',
}) {
  const programList = document.querySelector(programListSel);
  const leftEl = document.querySelector(leftSel);
  const barEl = document.querySelector(capBarSel);
  const hintEl = document.querySelector(hintSel);
  if (!programList || !leftEl || !barEl || !hintEl) {
    console.warn('[command-limit] missing elements');
    return;
  }

  let CMD_CAP = 10;
  let REPEAT_INNER_CAP = 3;

  // ===== helpers =====
  const countTopLevelBlocks = () =>
    programList.querySelectorAll(':scope > .cmd, :scope > .repeat').length;

  const refreshCapUI = () => {
    const used = countTopLevelBlocks();
    const left = Math.max(0, CMD_CAP - used);
    leftEl.textContent = String(left);
    barEl.classList.toggle('full', left === 0);
    if (left > 0 && hintEl.dataset.locked !== '1') {
      hintEl.textContent = '【ヒント：】';
    }
    document.querySelectorAll(paletteBtnSel).forEach(btn=>{
      btn.classList.toggle('disabled', left === 0);
    });
  };

  const showUseRepeatHint = (msg = '【ヒント：くりかえしコマンドを使ってください】') => {
    hintEl.textContent = msg;
    hintEl.dataset.locked = '1';
    barEl.classList.add('full');
    barEl.animate([{transform:'scale(1)'},{transform:'scale(1.03)'},{transform:'scale(1)'}], {duration:220});
    setTimeout(()=>{ hintEl.dataset.locked = '0'; }, 1500);
  };

  // ===== public-ish hooks（既存UIから使えるよう window に載せる） =====
  function addTopLevelBlock(node) {
    const used = countTopLevelBlocks();
    if (used >= CMD_CAP) { showUseRepeatHint(); return false; }
    programList.appendChild(node);
    refreshCapUI();
    return true;
  }
  function canPushIntoRepeat(repeatBodyEl) {
    const innerCmds = repeatBodyEl.querySelectorAll(':scope > .cmd');
    return innerCmds.length < REPEAT_INNER_CAP;
  }
  function addInsideRepeat(repeatBodyEl, cmdNode) {
    if (!canPushIntoRepeat(repeatBodyEl)) {
      showUseRepeatHint('【ヒント：くりかえし内は最大3コマンドまでです】');
      return false;
    }
    repeatBodyEl.appendChild(cmdNode);
    return true;
  }

  // 既存の追加/削除/D&Dコードから呼べるように公開
  window.HKQ_CMD_LIMIT = { addTopLevelBlock, canPushIntoRepeat, addInsideRepeat, refreshCapUI };

  // ===== wire events =====
  // シーン（hkq-scene.js）から上限を受け取る
  document.addEventListener('hkq:limits', (e)=>{
    const d = e.detail || {};
    CMD_CAP = Number.isFinite(d.cmdCap) ? d.cmdCap : 10;
    REPEAT_INNER_CAP = Number.isFinite(d.repeatInnerCap) ? d.repeatInnerCap : 3;
    refreshCapUI();
  });

  // トップレベル：削除ボタンで残り数更新
  programList.addEventListener('click', (e)=>{
    const del = e.target.closest('.cmd .del, .repeat .del');
    if (del) { del.closest('.cmd, .repeat')?.remove(); refreshCapUI(); }
  });

  // トップレベル：ドラッグ＆ドロップ追加をガード（必要なら）
  programList.addEventListener('dragover', e=>e.preventDefault());
  programList.addEventListener('drop', (e)=>{
    e.preventDefault();
    const used = countTopLevelBlocks();
    if (used >= CMD_CAP) { showUseRepeatHint(); return; }
    // 既存の生成関数がある前提。無ければここは各実装に合わせて差し替え
    if (window.buildNodeFromDataTransfer) {
      const node = window.buildNodeFromDataTransfer(e.dataTransfer);
      if (node) addTopLevelBlock(node);
    }
  });

  // 初期描画
  refreshCapUI();
}