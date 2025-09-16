// アイソメ座標まわりの純関数群
export const isoX = (x, y, w, h) => (x - y) * (w / 2);
export const isoY = (x, y, w, h) => (x + y) * (h / 2);

// 6x8 等の格子をアイソメ投影した時のおおよその描画サイズ
export const fieldSize = (gridW, gridH, isoW, isoH) => ({
  width: (gridW + gridH) * (isoW / 2),
  height: (gridW + gridH) * (isoH / 2),
});

// Z順を安定させたいときのソートキー
export const zKey = (x, y, h = 0) => x + y + h * 0.1;