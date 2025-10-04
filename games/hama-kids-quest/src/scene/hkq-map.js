// 画像タイル種別 → 表示タイトル（カテゴリ名）
// ※ プレイ前確認モーダルに表示するタイトル。
//   - moonland    : 基礎編：くり返しコマンドの使い方
//   - planed-area : 応用編：実験棟建設
//   - moon-alien  : 応用編：宇宙人戦
const TILE_TO_LEVEL_ID_PREFIX = {
  "moonland":    "基礎編：くり返しコマンドの使い方", 
  "planed-area": "応用編：実験棟建設",
  "moon-alien":  "応用編：宇宙人戦",          
  "route-dev":  "応用編：月面ルート開発",  
  "kids-dev1":  "応用編：キッズ開発チーム制作マップ１",          
  "kids-dev2":  "応用編：キッズ開発チーム制作マップ2",          
  "kids-dev3":  "応用編：キッズ開発チーム制作マップ3",          
  "kids-dev4":  "応用編：キッズ開発チーム制作マップ4",          
  "moon-base":   "基礎編：方向コマンドの使い方"
};

import { LEVEL_JSON_BY_TILE } from '../main/config.js';

// モーダル参照要素
const $ov   = document.getElementById('confirm-overlay');
const $ttl  = document.getElementById('confirm-title');
const $desc = document.getElementById('confirm-desc');
const $play = document.getElementById('btn-play');
const $back = document.getElementById('btn-cancel');

// 内部状態：選ばれたタイル（遷移先）を保持
let _pendingTarget = null;

/**
 * 確認モーダルを開く。
 * @param {string} title モーダルタイトル（未指定時は『ミッション』）。
 * @param {string} desc 説明文（未指定時は既定文）。
 * @param {HTMLElement} [targetEl] 遷移対象となるセル要素。
 * @returns {void}
 */
function openConfirm(title, desc, targetEl) {
  _pendingTarget = targetEl || null;
  $ttl.textContent  = title || 'ミッション';
  $desc.textContent = desc || 'このミッションをプレイしますか？';
  $ov.hidden = false;

  // フォーカス誘導（アクセシビリティ）
  setTimeout(()=> $play?.focus(), 0);
}
/**
 * 確認モーダルを閉じる。
 * @returns {void}
 */
function closeConfirm() {
  _pendingTarget = null;
  $ov.hidden = true;
}

// 「プレイする」→ 実際に遷移
$play?.addEventListener('click', () => {
  if (!_pendingTarget) return closeConfirm();

  // ★ data-tile → ファイル決定
  const key  = _pendingTarget.dataset.tile;
  const file = LEVEL_JSON_BY_TILE[key];

  if (file) {
    const url = new URL("../hkq.html", location.href);
    url.hash = `levels=${encodeURIComponent(file)}`;
    location.href = url.toString();
  } else {
    console.warn("対応ファイルが見つかりません:", key);
  }
  closeConfirm();
});

// 「マップへもどる」
$back?.addEventListener('click', () => closeConfirm());

// Escで閉じる / Enterで実行
document.addEventListener('keydown', (e) => {
  if ($ov.hidden) return;
  if (e.key === 'Escape') { e.preventDefault(); closeConfirm(); }
  if (e.key === 'Enter')  { e.preventDefault(); $play.click(); }
});
/* 
const LEVELS_JSON = "../assets/data/hkq-levels.json"; // 同ディレクトリ想定
async function loadLevels() {
  const res = await fetch(LEVELS_JSON, { cache: "no-store" });
  if (!res.ok) throw new Error("levels load failed");
  return await res.json();
}
*/
/**
 * レベルIDの先頭一致（なければ含有一致）で最初のインデックスを返す。
 * 一致しない場合は 0 を返す。
 * @param {Array<{id?: string}>} levels レベル配列。
 * @param {string} prefix 先頭一致に使用するプレフィックス。
 * @returns {number} 見つかったインデックス。見つからなければ 0。
 */
function findLevelIndexByPrefix(levels, prefix) {
  if (!prefix) {
    console.log("【MAP DEBUG】prefixが空 → idx=0");
    return 0;
  }

  // 1) 先頭一致で検索
  let idx = levels.findIndex(l => String(l.id || "").startsWith(prefix));
  if (idx >= 0) {
    console.log(`【MAP DEBUG】先頭一致: prefix=${prefix}, idx=${idx}, levelId=${levels[idx]?.id}`);
    return idx;
  }

  // 2) 含有一致（保険）
  idx = levels.findIndex(l => String(l.id || "").includes(prefix));
  if (idx >= 0) {
    console.log(`【MAP DEBUG】含有一致: prefix=${prefix}, idx=${idx}, levelId=${levels[idx]?.id}`);
    return idx;
  }

  console.log(`【MAP DEBUG】一致なし: prefix=${prefix} → idx=0`);
  return 0;
}

/**
 * `.cell` の `background-image` を先読みして、初回描画のチラつきを抑える。
 * @returns {void}
 */
function imgPreload() {
  document.querySelectorAll(".cell").forEach(el => {
    const url = getComputedStyle(el).backgroundImage.replace(/^url\(["']?/, "").replace(/["']?\)$/, "");
    if (!url) return;
    const img = new Image(); img.src = url;
  });
}

/**
 * 画面初期化：画像プリロードとクリックハンドラ登録。
 * @returns {Promise<void>}
 */
(async function init(){
  imgPreload();
  document.addEventListener('click', (ev) => {
    const tile = ev.target.closest('.cell, [data-tile]');
    if (!tile) return;

    ev.preventDefault();
    ev.stopPropagation();

    const key   = (tile.dataset.tile || '').trim();
    const title = TILE_TO_LEVEL_ID_PREFIX[key] || 'ミッション';

    openConfirm(title, 'このミッションをプレイしますか？', tile);
  }, { passive: false });
/*
  document.querySelectorAll(".cell").forEach(btn => {
    btn.addEventListener("click", () => {
      const file = TILE_TO_LEVEL_FILE[btn.dataset.tile];
      if (!file) return;

      const url = new URL("../hkq.html", location.href);
      url.hash = `levels=${encodeURIComponent(file)}`;
      location.href = url.toString();
    });
  });
  */
})();
