// src/common/ui/command-limit.js
// hkq-main.js からの期待API：initCommandLimitUI({ programListSel, paletteBtnSel, capBarSel, leftSel, hintSel })
// 返却オブジェクト：{ setCap, refreshCapUI, recalc, addTopLevelCmd, addInsideRepeat, addTopLevelBlock }

export function initCommandLimitUI(opts = {}) {
  const programList = document.querySelector(opts.programListSel || "#program");
  const capBar      = document.querySelector(opts.capBarSel || "#cmd-limit-bar");
  const leftEl      = document.querySelector(opts.leftSel || "#cmd-left");
  const hintEl      = document.querySelector(opts.hintSel || "#cmd-hint");

  // === 内部状態 ===
  let cap = toInt(leftEl?.textContent, 10) || 10;

  function toInt(v, d = 0) {
    const n = Number(v);
    return Number.isFinite(n) ? n | 0 : d;
  }

  // 直下の .cmd だけ数えるヘルパ（:scope 非依存）
  function countDirectCmdChildren(root) {
    if (!root) return 0;
    let c = 0;
    root.childNodes.forEach((n) => {
      if (n.nodeType === 1 && n.classList.contains("cmd")) c++;
    });
    return c;
  }

  // 使用数の定義：
  // - トップレベル: #program 直下の .cmd
  // - くり返し内  : .block.repeat .repeat-body 直下の .cmd
  // - ブロック自体（.block.repeat）はコスト 0
  function countUsed() {
    if (!programList) return 0;
    const top = countDirectCmdChildren(programList);
    let inRepeat = 0;
    programList.querySelectorAll(".block.repeat .repeat-body").forEach((body) => {
      inRepeat += countDirectCmdChildren(body);
    });
    const used = top + inRepeat;
    return used;
  }

  // UI更新（残りコマンド数 = cap - used）
  function refreshCapUI() {
    const used = countUsed();
    const left = Math.max(0, cap - used);
    if (leftEl) leftEl.textContent = String(left);
    // デバッグログ
    console.debug("[command-limit] refreshCapUI: cap=", cap, "used=", used, "left=", left);
    return left;
  }

  // 外からcapを設定
  function setCap(nextCap) {
    const nv = toInt(nextCap, cap);
    cap = nv;
    if (leftEl) leftEl.textContent = String(Math.max(0, cap - countUsed()));
    console.debug("[command-limit] setCap:", cap);
  }

  // 既存配置を考慮して再計算（外部から呼ばれる想定）
  function recalc() {
    console.debug("[command-limit] recalc() 呼び出し");
    return refreshCapUI();
  }

  // 上限チェック：1つ追加できるか？
  function canAddOne() {
    const used = countUsed();
    const ok = used + 1 <= cap;
    console.debug("[command-limit] canAddOne? used+1=", used + 1, "cap=", cap, "=>", ok);
    return ok;
  }

  // 追加：トップレベル .cmd
  // 戻り値：false=上限超過、true=ライブラリ側でappendした、undefined=ライブラリのappendを使わない
  function addTopLevelCmd(node) {
    if (!programList || !node) return false;
    if (!canAddOne()) {
      hint("コマンド上限です");
      return false;
    }
    // ここでは「appendは呼び出し側でも可能」な契約のため、undefinedを返してフォールバックに任せてもOK。
    // ただし UI の一貫性のため、このライブラリ側で append してしまう方が安全。
    programList.appendChild(node);
    const left = refreshCapUI();
    console.debug("[command-limit] addTopLevelCmd: 追加 -> left=", left);
    return true;
  }

  // 追加：くり返しブロック内 .cmd
  function addInsideRepeat(bodyEl, node) {
    if (!bodyEl || !node) return false;
    if (!canAddOne()) {
      hint("コマンド上限です（くり返し内）");
      return false;
    }
    bodyEl.appendChild(node);
    const left = refreshCapUI();
    console.debug("[command-limit] addInsideRepeat: 追加 -> left=", left);
    return true;
  }

  // 追加：トップレベルの「くり返し」ブロック（コスト0）
  function addTopLevelBlock(blockEl) {
    if (!programList || !blockEl) return false;
    programList.appendChild(blockEl);
    const left = refreshCapUI();
    console.debug("[command-limit] addTopLevelBlock: 追加(コスト0) -> left=", left);
    return true;
  }

  // ヒント表示（任意）
  function hint(text) {
    if (!hintEl) return;
    hintEl.textContent = `【ヒント：${text}】`;
  }

  // 初期描画
  refreshCapUI();

  // 返却API（hkq-main.js が期待する名前に揃える）
  return {
    setCap,
    refreshCapUI,
    recalc,
    addTopLevelCmd,
    addInsideRepeat,
    addTopLevelBlock,
    // デバッグ向け：現在値を覗けるように（任意）
    get cap() { return cap; },
    set cap(v) { setCap(v); },
  };
}