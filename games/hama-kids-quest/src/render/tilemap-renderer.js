import { isoX, isoY } from './iso-math.js';

/**
 * アイソメ床（moon.png）を敷き詰め、碁盤線も引く
 * - gap: タイルの角潰れ防止の隙間(px)
 * - lineColor/lineAlpha: 碁盤線の色
 * - baseIsoX: 左端切れ防止の全体オフセット（推奨: (gridH-1)*(isoW/2)）
 */
export function buildTileLayer(
  scene,
  gridW,
  gridH,
  isoW,
  isoH,
  textureKey = 'floor_moon',
  { gap = 2, lineColor = 0x44506b, lineAlpha = 1, baseIsoX = 0 } = {}
) {
  const layer = scene.add.container(0, 0);
  const lines = scene.add.graphics().lineStyle(1, lineColor, lineAlpha);

  // タイルの「基準サイズ」（配置・碁盤線はこのサイズで計算）※床サイズは変更しない
  const dispW = isoW - gap;
  const dispH = isoH - Math.max(1, gap >> 1);
  // ★ 画像だけ拡大したいときの倍率（1.0=等倍, 1.3〜1.6 くらいが推奨）
  const IMAGE_SCALE = 1.0;
  const imgW = dispW * IMAGE_SCALE;
  const imgH = dispH * IMAGE_SCALE;
  // ★“浮き”対策：拡大量の一部を下に沈める（0.0〜1.0 推奨 0.2〜0.4）
  const SINK_RATIO = 0.3;
  const SINK_PX = Math.round((imgH - dispH) * SINK_RATIO);

  for (let y = 0; y < gridH; y++) {
    for (let x = 0; x < gridW; x++) {
      const sx = isoX(x, y, isoW, isoH) + baseIsoX;
      const sy = isoY(x, y, isoW, isoH);
      // moon.png は画像だけ拡大（足元=下頂点は据え置きなので重なりが自然）
      layer.add(
        scene.add
          .image(Math.round(sx), Math.round(sy + SINK_PX), textureKey)
          .setOrigin(0.5, 1)
          .setDisplaySize(imgW, imgH)
          .setDepth(0)
      );
      // ダイヤの枠線（碁盤の目）
      const hw = dispW / 2;
      const hh = dispH / 2;
      lines.beginPath();
      lines.moveTo(Math.round(sx), Math.round(sy - dispH)); // 上
      lines.lineTo(Math.round(sx + hw), Math.round(sy - hh)); // 右
      lines.lineTo(Math.round(sx), Math.round(sy)); // 下(足元)
      lines.lineTo(Math.round(sx - hw), Math.round(sy - hh)); // 左
      lines.closePath().strokePath();
    }
  }
  layer.add(lines);
  return layer;
}