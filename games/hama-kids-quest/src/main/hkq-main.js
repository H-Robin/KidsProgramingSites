// hkq-main.js — formal version
import { HKQ_EVENTS } from '../common/events.js';
import { createPalette } from "../common/ui/palette.js";
import { Interpreter } from "../common/engine/interpreter.js";
import { HkqScene } from "../scene/hkq-scene.js";
import { Mission } from "../scene/hkq-mission.js";
import { initCommandLimitUI } from "../common/ui/command-limit.js";

(() => {
  if (window.__HKQ_DBG_LOG) return;
  let seq = 0;
  const pad = (n)=> String(n).padStart(3,'0');
  const t   = ()=> new Date().toISOString().slice(11,23); // HH:MM:SS.mmm
  window.__HKQ_DBG_LOG = (...args) => console.log(`[HKQ ${pad(++seq)} ${t()}]`, ...args);
})();
/**
 * Runner 世代番号（古い Runner の遅延 tick を無視するための世代ガード）
 * - newRunner() を呼ぶ度に ++ される。
 * - onTick 側は自分の世代と一致しない場合は無視する。
 */
window.HKQ_RUNNER_GEN = 0;


/**
 * 新しい Interpreter（Runner）の生成
 * 概要:
 *  - 生成時に世代番号を確定（HKQ_RUNNER_GEN をインクリメント）
 *  - onTick: 自分の世代でない tick や、カットシーン/ロック中は破棄
 *  - onReset: 共通の clearRunnerQueue → scene.resetLevel を呼ぶ
 * @param {HTMLElement} listEl - 実行プログラムの UL 要素
 * @returns {Interpreter} 新規 Runner インスタンス
 */
function newRunner(listEl) {
  const myGen = ++window.HKQ_RUNNER_GEN; // 新しい世代番号
  return new Interpreter({
    programList: listEl,
    onTick: (op) => {
      // 古い Runner の tick を黙殺
      if (myGen !== window.HKQ_RUNNER_GEN) return;

      const sc = scene();
      // カットシーン中／入力ロック中は実行しない
      if (sc?._cutscenePlaying || sc?._inputLocked) return;

      const symMap = { up: "↑", down: "↓", right: "→", left: "←", repeat: "くり返し" };
      const sym = symMap[op] || op;
      sc?.onTick?.(sym);
    },
    onReset: () => {
      window.clearRunnerQueue?.();       // 停止・UI初期化・新 Runner 再生成
      scene()?.resetLevel?.();           // シーン側のリセット
    },
    tickDelay: 300,
  });
}

/* =========================
   Command Limit UI 初期化
   - 戻り値をグローバルに保持
   ========================= */
window.HKQ_CMD_LIMIT = initCommandLimitUI({
  programListSel: "#program",
  paletteBtnSel: "#palette .cmd, #palette [data-op]",
  capBarSel: "#cmd-limit-bar",
  leftSel: "#cmd-left",
  hintSel: "#cmd-hint",
});

// ★ JSONのcmdCapを反映する（hkq-scene.js が投げるイベントを受信）
document.addEventListener(HKQ_EVENTS.LIMITS, (e) => {
  const cap = Number(e?.detail?.cmdCap);
  if (!Number.isFinite(cap)) return;
  // 内部cap更新
  if (window.HKQ_CMD_LIMIT?.setCap) {
    window.HKQ_CMD_LIMIT.setCap(cap);
  } else {
    // フォールバック：プロパティに直接入れてもOKな実装に合わせる
    window.HKQ_CMD_LIMIT && (window.HKQ_CMD_LIMIT.cap = cap);
  }
  // 表示を即更新
  window.HKQ_CMD_LIMIT?.refreshCapUI?.();
  // デバッグ
  console.debug('[hkq:limits] cmdCap from JSON =', cap,
                ' => UI left =', document.getElementById('cmd-left')?.textContent);
});

/* ============ Phaser 設定 ============ */
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
const game = new Phaser.Game(config);
const scene = () => game.scene.keys["HkqScene"];

/* ============ DOM 参照 ============ */
const paletteRoot = document.getElementById("palette");
const programList = document.getElementById("program");
const runBtn = document.getElementById("run");
const stepBtn = document.getElementById("step");
const stopBtn = document.getElementById("stop");
const exitBtn = document.getElementById("exit");
const repeatSelect = document.getElementById("repeat-count");

// === 追加: URLハッシュから起動ミッションを選択 ===
// === ハッシュから levels ファイルを取得 ===
/**
 * ハッシュからレベルファイルパスを取得
 * @returns {string} レベルJSONのパス
 */
function getLevelsFileFromHash() {
  const m = (location.hash || "").match(/levels=([^&]+)/);
  return m ? decodeURIComponent(m[1]) : "assets/data/levels-tutorial.json";
}
/**
 * ハッシュから開始ミッション番号を取得
 * @returns {number} 開始ミッション（0基点）
 */
function getStartMissionFromHash() {
  try {
    const m = (location.hash || "").match(/mission=(\d+)/);
    return m ? Math.max(0, parseInt(m[1], 10)) : 0;
  } catch(_) { return 0; }
}

window.addEventListener("load", async () => {
  const levelsFile = getLevelsFileFromHash();
  const res = await fetch(levelsFile, { cache: "no-store" });
  const levels = await res.json();

  window.hkqLevels = levels;
  window.totalMissions = levels.length;
  window.currentMissionIndex = 0;

  const startIdx = (typeof getStartMissionFromHash === 'function')
    ? getStartMissionFromHash() : 0;

  // ★ シーン準備完了（scene-ready）を待ってから JSON を渡す
  await new Promise((resolve) => {
    // 既に Scene が起動し ready 済みなら短絡（1フレーム後でもOK）
    const handler = () => resolve();
    document.addEventListener(HKQ_EVENTS.SCENE_READY, handler, { once: true });
    // タイムアウト保険（2秒）
    setTimeout(resolve, 2000);
  });
  document.dispatchEvent(new CustomEvent(HKQ_EVENTS.SET_LEVELS, { detail: { levels, startIdx } }));

  // カテゴリ完了 → マップへ戻る処理は現状どおり
  document.addEventListener(HKQ_EVENTS.MISSION_CLEARED, () => {
    if (window.currentMissionIndex >= window.totalMissions - 1) {
      location.href = "html/hkq-map.html";
    }
  });
  setupClearCommandsButton();
});

/*
function getStartMissionFromHash() {
  try {
    const m = (location.hash || "").match(/mission=(\d+)/);
    return m ? Math.max(0, parseInt(m[1], 10)) : 0;
  } catch(_) { return 0; }
}
  */
/*
window.addEventListener("load", () => {
  const sc = scene && scene();
  const startIdx = getStartMissionFromHash();
  // scene がまだ準備中の可能性に備え、少し待ってから
  setTimeout(() => {
    try { scene()?.gotoMission?.(startIdx); } catch(_){}
  }, 200);
});
*/
/* ============ Runner（公開参照） ============ */
let mission = null;

// ▼ 追加：Mission を起動（DOMに #mission-panel / #mission-clear-text がある前提）
try {
  mission = new Mission(null);
} catch (_) {}

let interp = newRunner(programList);
window.currentRunner = interp;

/**
 * window.clearRunnerQueue()
 * 処理概要:
 * Runner停止＋UIリセット＋新Runner生成
 */
window.clearRunnerQueue = function () {
  const r = window.currentRunner;
  try { r?.stop?.(); } catch (_) {}
  try { clearTimeout(r?._timer); } catch (_) {}

  if (r) {
    r.isRunning = false;
    r.currentCommand = null;
    r.commandQueue = [];
  }
  try {
    programList.innerHTML = "";
    window.HKQ_CMD_LIMIT?.refreshCapUI?.();
  } catch (_) {}

  // くり返し録画状態を解除
  try {
    recordingRepeat = null;
    programList.classList.remove("recording-repeat");
  } catch (_) {}

  // 新Runnerに差し替え
  window.currentRunner = newRunner(programList);
};

/* ===============================
  パレット作成 & アイコン化
  - 表示: 矢印
  - 内部: 英語 op
   =============================== */
const CMDS = [
  { label: "↑", op: "up" },
  { label: "↓", op: "down" },
  { label: "→", op: "right" },
  { label: "←", op: "left" },
  { label: "くり返し", op: "repeat" },
];
createPalette(paletteRoot, programList, CMDS);

/**
 * パレットのテキストをアイコンへ置換（即時実行）
 * 概要:
 *  - パレットのテキストボタンを画像アイコンに差し替え
 *  - 角度はアイソメ表示に合わせた方位の画像にマップ
 */
(function replacePaletteTextWithIcons() {
  const map = {
    up: "assets/direction/arrow-ne.png",    // ↗︎
    down: "assets/direction/arrow-nw.png",  // ↘︎
    right: "assets/direction/arrow-se.png", // ↙︎
    left: "assets/direction/arrow-sw.png",  // ↖︎
  };
  const aliases = {
    up: ["up", "↑", "まえ", "上"],
    right: ["right", "→", "みぎ", "右"],
    down: ["down", "↓", "うしろ", "下"],
    left: ["left", "←", "ひだり", "左"],
  };
  const guessKey = (txt) => {
    const s = txt.trim();
    for (const k of Object.keys(aliases)) if (aliases[k].includes(s)) return k;
    return null;
  };
  paletteRoot.querySelectorAll(".cmd").forEach((btn) => {
    if (btn.classList.contains("icon")) return;
    const label = (btn.dataset.label || btn.textContent || "").trim();
    const key = guessKey(label);
    if (!key) return;
    btn.classList.add("icon");
    btn.setAttribute("aria-label", label);
    btn.innerHTML = `<img src="${map[key]}" alt="${label}"><span class="sr-only">${label}</span>`;
  });
})();

/**
 * DnD（ドラッグ&ドロップ）の抑止
 * 概要:
 *  - ドラッグ & ドロップを全面抑止（モバイルの誤操作対策）
 *  - 既存の .cmd / [data-op] 要素の draggable を無効化
 * @param {HTMLElement} root - 対象ルート要素
 * @returns {void}
 */
function disableDragAndDrop(root) {
  if (!root) return;
  root.querySelectorAll(".cmd,[data-op]").forEach((el) => {
    el.draggable = false;
    el.ondragstart = (e) => { e.preventDefault(); return false; };
  });
  ["dragstart", "dragover", "drop", "dragend"].forEach((type) => {
    root.addEventListener(type, (e) => { e.preventDefault(); e.stopPropagation(); }, { passive: false });
  });
}
disableDragAndDrop(paletteRoot);
disableDragAndDrop(programList);

/* ラベル→op の補完（日本語矢印→英語 op） */
const jp2en = { "↑": "up", "↓": "down", "→": "right", "←": "left", "くり返し": "repeat" };
paletteRoot?.querySelectorAll(".cmd, [data-op]").forEach((el) => {
  const label = (el.dataset.label || el.textContent || "").trim();
  if (!el.dataset.op && jp2en[label]) el.dataset.op = jp2en[label];
  if (!el.dataset.label) el.dataset.label = label;
});

/**
 * Program用コマンド要素の生成
 * 概要:
 *  - Program リストへ挿入する単一コマンド要素を生成
 * @param {string} label - 表示ラベル
 * @param {string} op - 内部オペレーションキー
 * @returns {HTMLLIElement|null} 生成した LI 要素
 */
function buildCmdNode(label, op) {
  if (!op) return null;
  const li = document.createElement("li");
  li.className = "cmd";
  li.dataset.op = op; li.dataset.label = label;
  li.textContent = label;
  li.setAttribute("title", label);
  return li;
}

/* ===== くり返しブロック（入れ子禁止） ===== */
let recordingRepeat = null;

/**
 * くり返しブロックの作成
 * 概要:
 *  - トップレベルに「くり返し」ブロックを追加
 *  - iOS キーボード対策として select(2〜10) を採用
 *  - command-limit による上限チェックに失敗したら中止
 * @param {number} [defaultCount=2] - 初期回数
 * @returns {HTMLLIElement|null} 作成したブロック要素
 */
function createRepeatBlock(defaultCount = 2) {
  const block = document.createElement("li");
  block.className = "block repeat";
  block.dataset.op = "repeat";

  const head = document.createElement("div"); head.className = "repeat-head";
  const label = document.createElement("span"); label.textContent = "くり返し";

  const count = document.createElement("select");
  count.className = "repeat-count";
  for (let n = 2; n <= 10; n++) {
    const opt = document.createElement("option");
    opt.value = String(n);
    opt.textContent = String(n);
    count.appendChild(opt);
  }
  const init = Math.min(10, Math.max(2, defaultCount | 0 || 2));
  count.value = String(init);

  const endBtn = document.createElement("button");
  endBtn.type = "button"; endBtn.className = "repeat-close"; endBtn.textContent = "End";

  head.appendChild(label); head.appendChild(count); head.appendChild(endBtn);

  const body = document.createElement("ul"); body.className = "repeat-body";
  block.appendChild(head); block.appendChild(body);

  // ★ ここでトップレベルに置くのを command-limit 経由にし、
  //    失敗（未定義/false）ならフåォールバックで直接挿入
  const ok = window.HKQ_CMD_LIMIT?.addTopLevelBlock?.(block);
  if (ok === false || ok === undefined) {
    programList.appendChild(block);           // フォールバック挿入
    window.HKQ_CMD_LIMIT?.refreshCapUI?.();   // 残数UIを更新
  }
  recordingRepeat = { blockEl: block, bodyEl: body, countInput: count };
  programList.classList.add("recording-repeat");

  endBtn.addEventListener("click", (e) => { e.stopPropagation(); });
  endBtn.addEventListener("click", () => {
    if (!body.querySelector(".cmd")) block.remove();
    recordingRepeat = null;
    programList.classList.remove("recording-repeat");
  });
  return block;
}

/**
 * 多重クリック防止ラッパの生成
 * 概要:
 *  - 150ms / 4px 以内の重複イベントを無効化
 * @param {(ev:Event)=>void} handler - 元のハンドラ
 * @returns {(ev:Event)=>void} ラップされたハンドラ
 */
function dispatchOnce(handler) {
  let _lastEvt = { t: 0, x: 0, y: 0 };
  return function (ev) {
    const now = performance.now();
    const isDup = (now - _lastEvt.t) < 150 &&
      Math.abs((ev.clientX || 0) - _lastEvt.x) < 4 &&
      Math.abs((ev.clientY || 0) - _lastEvt.y) < 4;
    if (isDup) return;
    _lastEvt = { t: now, x: ev.clientX || 0, y: ev.clientY || 0 };
    ev.preventDefault?.(); ev.stopPropagation?.();
    handler(ev);
  };
}


/**
 * Programリストのタップ処理
 * 概要:
 *  - Program 内の単一コマンド（.cmd）を削除
 *  - くり返しブロックは End ボタンで閉じる（ここでは削除しない）
 * @param {Event} ev - クリック/タップイベント
 * @returns {void}
 */
function onProgramTap(ev) {
  if (document.body.classList.contains("ui-locked")) return;

  const li = ev.target.closest(".cmd, .block.repeat");
  if (!li || !programList.contains(li)) return;

  if (li.classList.contains("cmd")) {
    li.remove();
    window.HKQ_CMD_LIMIT?.refreshCapUI?.();
  }
}

/* ============ クリックに統一（多重発火防止） ============ */
paletteRoot.addEventListener("click", dispatchOnce(onPalettePress), { passive: false });
programList.addEventListener("click", dispatchOnce(onProgramTap), { passive: false });

// -------------------------------
// ミッション開始時の初期ライフ設定（JSON基準）
// -------------------------------
document.addEventListener(HKQ_EVENTS.MISSION_START, (e)=>{
  const level = e?.detail?.level;

  // JSONの life0 条件から count を読み取る
  const list = []
    .concat(Array.isArray(level?.conditions) ? level.conditions : [])
    .concat(Array.isArray(level?.clear?.conditions) ? level.clear.conditions : []);
  const c = list.find(x => x?.type === 'life0' || x?.id === 'life_zero');
  const n = Number(c?.count);
  const max = (Number.isFinite(n) && n > 0) ? n : 3;  // デフォルト3

  // グローバル変数とHUDを初期化
  window.HKQ_LIFE_MAX = max;
  window.HKQ_LIFE     = max;
  syncLifeToMission(max);
});

/**
 * 実行系ボタン: run / step / stop / exit
 * 概要:
 *  - run: select の回数を読み、Runner.run を実行
 *  - step: 1 ステップだけ進める
 *  - stop: clearRunnerQueue（停止→UI初期化→新 Runner）
 *  - exit: 停止→UI空→残数更新→マップへ遷移
 */
runBtn?.addEventListener("click", () => {
  // ▼追加：押下ごとにライフ-1
  const panelLife = Number(window.HKQ_LIFE ?? 3);
  const newLife   = Math.max(0, panelLife - 1);
  window.HKQ_LIFE = newLife;
  syncLifeToMission(newLife); 

  if (newLife === 0){
    // ライフ切れ → onTick側が参照できるようイベント通知
    document.dispatchEvent(new CustomEvent(HKQ_EVENTS.LIFE_ZERO));
    return; // 実行しない
  }
  if (document.body.classList.contains("ui-locked")) return;
  const times = (repeatSelect?.value ? parseInt(repeatSelect.value, 10) : 1) || 1;
  window.currentRunner?.run?.(programList, { times });
});
stepBtn?.addEventListener("click", () => {
  if (document.body.classList.contains("ui-locked")) return;
  window.currentRunner?.step?.(programList);
});
stopBtn?.addEventListener("click", () => {
  window.clearRunnerQueue?.();
});
/* 
exitBtn?.addEventListener("click", () => {
  try { window.currentRunner?.stop?.(); } catch (_) {}
  programList.innerHTML = "";
  window.HKQ_CMD_LIMIT?.refreshCapUI?.();
  try { scene()?.gotoMission?.(0); } catch (_) {}
});
*/
exitBtn?.addEventListener("click", () => {
  try { window.currentRunner?.stop?.(); } catch (_) {}
  programList.innerHTML = "";
  window.HKQ_CMD_LIMIT?.refreshCapUI?.();
  location.href = "html/hkq-map.html";  // ★ マップページへ遷移
});
const clearBtn = document.getElementById("btn-clear-commands");
  clearBtn?.addEventListener("click", () => {
    try { window.clearRunnerQueue?.(); } catch(_) {}
    document.dispatchEvent(new CustomEvent(HKQ_EVENTS.COMMANDS_CLEARED));
});
/**
 * パレット押下処理
 * 役割:
 *  - パレットのボタンを Program に追加するメインハンドラ
 *  - 「くり返し」はブロックを作成（入れ子禁止）
 *  - 方向コマンドは録画中ならブロック内へ、そうでなければトップレベルへ
 *  - command-limit API（HKQ_CMD_LIMIT）が未定義でも“押しても何も起きない”を避けるため
 *    フォールバックで確実に挿入する
 * 挙動:
 *  - くり返し録画中は addInsideRepeat?.() の戻り値を見て、
 *    undefined（APIなし）のときだけ直挿し、false（上限超過）は挿入しない
 *  - トップレベルも addTopLevelCmd?.() が false/undefined のとき直挿しする
 * @param {Event} ev - クリック/タップイベント
 * @returns {void}
 */
function onPalettePress(ev) {
  if (document.body.classList.contains("ui-locked")) return;

  const btn = ev.target.closest("[data-op], .cmd");
  if (!btn || !paletteRoot.contains(btn)) return;

  const op    = btn.dataset.op || jp2en[(btn.textContent || "").trim()];
  const label = btn.dataset.label || (btn.textContent || "").trim();
  if (!op) return;

  if (op === "repeat") {
    if (recordingRepeat && !programList.querySelector(".block.repeat .repeat-body")) {
      recordingRepeat = null;
      programList.classList.remove("recording-repeat");
    }
    if (recordingRepeat) return;
    createRepeatBlock(2);
    return;
  }

  const node = buildCmdNode(label, op);
  if (!node) return;

  if (recordingRepeat) {
    const ok = window.HKQ_CMD_LIMIT?.addInsideRepeat?.(recordingRepeat.bodyEl, node);
    if (ok === false) return; // 上限超過
    if (ok === undefined) {
      (recordingRepeat.bodyEl ?? document.querySelector(".block.repeat .repeat-body"))
        ?.appendChild(node);
    }
    window.HKQ_CMD_LIMIT?.refreshCapUI?.();
    return;
  }

  const okTop = window.HKQ_CMD_LIMIT?.addTopLevelCmd?.(node);
  if (okTop === false || okTop === undefined) {
    if (okTop === undefined) {
      programList.appendChild(node);
    }
    window.HKQ_CMD_LIMIT?.refreshCapUI?.();
  }
}
/**
 * シーンからのロック/アンロック通知
 * 概要:
 *  - カットシーン開始/終了などで UI を無効/有効化
 */
document.addEventListener(HKQ_EVENTS.LOCK, () => document.body.classList.add("ui-locked"));
document.addEventListener(HKQ_EVENTS.UNLOCK, () => document.body.classList.remove("ui-locked"));

/* =========================
  Runner 自然停止検知
  - ゴール成功直後は除外
  - それ以外で停止したらコマンドをクリア
   ========================= */
let HKQ_LAST_GOAL_TS = 0;
document.addEventListener(HKQ_EVENTS.REACH_GOAL, () => {
  HKQ_LAST_GOAL_TS = Date.now();
  console.log("【DEBUG】hkq:reach-goal event → ゴール成功マーク");
});

/**
 * Runner 停止監視とフォールバッククリア
 * 概要:
 *  - Runner の自然停止またはクリアイベントを待ち合わせ、UI同期を行う
 *  - タイムアウト時はフォールバックで解放
 * @param {Phaser.Scene} scene - シーン参照
 * @param {{timeoutMs?:number}} [options] - タイムアウト設定（ms）
 * @returns {Promise<any>} 待機結果
 */
async function watchRunnerIdleAndClear(scene, { timeoutMs = 4000 } = {}) {
  __HKQ_DBG_LOG('watchRunnerIdleAndClear: ENTER');

  const idlePromise = waitRunnerIdle(scene); // ← 元の「停止待ち」Promise
  const clearPromise = waitMissionCleared(); // ← 元の「クリアイベント待ち」Promise（あれば）

  // タイムアウト追加（必ず戻すため）
  const timeout = new Promise((resolve) => {
    setTimeout(() => {
      __HKQ_DBG_LOG('watchRunnerIdleAndClear: TIMEOUT fallback fired');
      resolve({ timeout: true });
    }, timeoutMs);
  });

  let result;
  try {
    result = await Promise.race([
      // 「停止待ち＋クリア評価」があるならそれ
      Promise.allSettled([idlePromise, clearPromise]),
      timeout
    ]);
    __HKQ_DBG_LOG('watchRunnerIdleAndClear: RESOLVE', result);
  } catch (err) {
    console.error('watchRunnerIdleAndClear: ERROR', err);
    // ここで落ちっぱなしにならないよう、必ず戻す
    result = { error: true };
  }

  // ここでUIやHUDの最終同期を必ず実行（落ちても止まらないよう try/catch）
  try {
    document.dispatchEvent(new CustomEvent(HKQ_EVENTS.MISSION_SYNC_UI));
  } catch(e){ console.warn('watchRunnerIdleAndClear: sync-ui failed', e); }

  __HKQ_DBG_LOG('watchRunnerIdleAndClear: EXIT');
  return result;
}


/**
 * JSONから初期ライフ(count)を取得
 * @param {any} level - レベル定義
 * @returns {number} 初期ライフ数（デフォルト3）
 */
function getLifeCountFrom(level){
  const list = []
    .concat(Array.isArray(level?.conditions) ? level.conditions : [])
    .concat(Array.isArray(level?.clear?.conditions) ? level.clear.conditions : []);
  const c = list.find(x => x?.type === 'life0' || x?.id === 'life_zero');
  const n = Number(c?.count);
  return (Number.isFinite(n) && n > 0) ? n : 3;
}

/**
 * HUDのライフ表示を更新
 * @param {number} value - 現在ライフ
 * @returns {void}
 */
function syncLifeToMission(value){
  document.dispatchEvent(new CustomEvent(HKQ_EVENTS.LIFE_CHANGED, { detail:{ value } }));
}

/**
 * 「コマンドクリア」ボタンの生成と動作設定
 * @returns {void}
 */
function setupClearCommandsButton(){
  // 二重生成ガード
  if (document.getElementById('btn-clear-commands')) return;

  // 既存の実行/リスタートボタンの親要素を優先候補に
  const runBtn     = document.getElementById('btn-run') || document.getElementById('btn-exec');
  const restartBtn = document.getElementById('btn-restart') || document.getElementById('btn-reset');
  const anchor     = (runBtn && runBtn.parentElement)
                  || (restartBtn && restartBtn.parentElement)
                  || document.body; // 最悪 body に追加

  // ボタン作成
  const btn = document.createElement('button');
  btn.id = 'btn-clear-commands';
  btn.type = 'button';
  btn.className = (runBtn?.className) ? runBtn.className : 'hkq-btn';
  btn.setAttribute('aria-label', 'コマンドクリア');
  btn.title = 'コマンドクリア (コマンドキューを空にします)';
  btn.textContent = 'コマンドクリア';

  // できれば run の直後→ダメなら restart の直後→最後に追加
  if (runBtn && runBtn.nextSibling) {
    anchor.insertBefore(btn, runBtn.nextSibling);
  } else if (restartBtn && restartBtn.nextSibling) {
    anchor.insertBefore(btn, restartBtn.nextSibling);
  } else {
    anchor.appendChild(btn);
  }

  // 動作：コマンドキューを空にして通知
  btn.addEventListener('click', (ev) => {
    ev.preventDefault(); ev.stopPropagation();
    try { window.clearRunnerQueue?.(); } catch(_) {}
    document.dispatchEvent(new CustomEvent(HKQ_EVENTS.COMMANDS_CLEARED));
    // 軽いフィードバック
    btn.disabled = true;
    setTimeout(() => { btn.disabled = false; }, 180);
  });
}
