// levels JSON を取得（キーは従来の "levels" を踏襲）
export function loadLevels(scene) {
  return scene.cache.json.get('levels') || [];
}

// 既存仕様を踏襲したゴール候補抽選
export function pickGoalFromSpec(gridW, gridH, startCell, spec) {
  const minDist = Math.max(0, spec?.minDistance ?? 0);
  const inside = (x, y) => x >= 0 && x < gridW && y >= 0 && y < gridH;
  const farEnough = (x, y) => Math.abs(x - startCell.x) + Math.abs(y - startCell.y) >= minDist;

  let candidates = [];
  switch (spec?.pattern) {
    case 'line': {
      const y = Math.floor(gridH / 2);
      for (let x = 0; x < gridW; x++) if (!(x === startCell.x && y === startCell.y)) candidates.push({ x, y });
      break;
    }
    case 'zigzag': {
      for (let x = 0; x < gridW; x++) {
        const y = x % 2 === 0 ? 0 : Math.min(gridH - 1, 1);
        if (inside(x, y) && !(x === startCell.x && y === startCell.y)) candidates.push({ x, y });
      }
      break;
    }
    case 'perimeter': {
      for (let x = 0; x < gridW; x++) [{ x, y: 0 }, { x, y: gridH - 1 }].forEach((p) => inside(p.x, p.y) && candidates.push(p));
      for (let y = 1; y < gridH - 1; y++) [{ x: 0, y }, { x: gridW - 1, y }].forEach((p) => inside(p.x, p.y) && candidates.push(p));
      candidates = candidates.filter((p) => !(p.x === startCell.x && p.y === startCell.y));
      break;
    }
    case 'diagonal': {
      const m = Math.min(gridW, gridH);
      for (let i = 0; i < m; i++) if (!(i === startCell.x && i === startCell.y)) candidates.push({ x: i, y: i });
      break;
    }
    case 'random':
    default: {
      for (let x = 0; x < gridW; x++) for (let y = 0; y < gridH; y++) if (!(x === startCell.x && y === startCell.y)) candidates.push({ x, y });
    }
  }
  const filtered = candidates.filter((p) => farEnough(p.x, p.y));
  const pool = filtered.length ? filtered : candidates;
  return pool[Math.floor(Math.random() * pool.length)];
}