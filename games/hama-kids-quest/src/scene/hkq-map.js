// 画像タイル種別 → ミッションIDまたはIDプレフィックス
// ※ hkq-levels.json の "id" を起点に検索します。
//   - moonland    : T1… の最初のチュートリアル
//   - planed-area : B1… 設計図ミッション
//   - moon-alien  : M1… モンスター初回
const TILE_TO_LEVEL_ID_PREFIX = {
  "moonland":    "T2",   // 月面探査：T2
  "planed-area": "B1",   // 建設予定地：B1
  "moon-alien":  "M1",   // 宇宙人戦：M1
  "moon-base":   "T1"    // 月面基地：T1
};

// タイルにカテゴリファイルを割り当て
const TILE_TO_LEVEL_FILE = {
  "moonland":    "assets/data/levels-tutorial2.json",
  "moon-alien":  "assets/data//levels-monster.json",
  "planed-area": "assets/data//levels-blueprint.json",
  "moon-base":   "assets/data//levels-tutorial1.json" // 例: T1スタート
};

/* 
const LEVELS_JSON = "../assets/data/hkq-levels.json"; // 同ディレクトリ想定

async function loadLevels() {
  const res = await fetch(LEVELS_JSON, { cache: "no-store" });
  if (!res.ok) throw new Error("levels load failed");
  return await res.json();
}
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

function imgPreload() {
  document.querySelectorAll(".cell").forEach(el => {
    const url = getComputedStyle(el).backgroundImage.replace(/^url\(["']?/, "").replace(/["']?\)$/, "");
    if (!url) return;
    const img = new Image(); img.src = url;
  });
}

(async function init(){
  imgPreload();

  document.querySelectorAll(".cell").forEach(btn => {
    btn.addEventListener("click", () => {
      const file = TILE_TO_LEVEL_FILE[btn.dataset.tile];
      if (!file) return;

      const url = new URL("../hkq.html", location.href);
      url.hash = `levels=${encodeURIComponent(file)}`;
      location.href = url.toString();
    });
  });
})();
