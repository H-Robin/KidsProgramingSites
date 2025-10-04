// UI helpers extracted from hkq-scene.js

export function renderItemBox(scene) {
  const box = document.getElementById('item-box');
  if (!box) return;
  const slots = box.querySelectorAll('.slot');
  slots.forEach(s => { s.classList.remove('on'); s.innerHTML = ''; });
  // 1: weapon
  if (scene.inventory.weapon && slots[0]) {
    slots[0].classList.add('on');
    slots[0].innerHTML = `<img src="assets/weapon/blaster-a.png" alt="weapon" style="width:90%;height:auto;">`;
  }
  // 2: gate key（基地ゲート）
  if (scene.inventory.key && slots[1]) {
    slots[1].classList.add('on');
    slots[1].innerHTML = `<img src="assets/items/gatecard.png" alt="key" style="width:90%;height:auto;">`;
  }
  // 3: portal key（ワープ）
  if (scene.inventory.portalkey && slots[2]) {
    slots[2].classList.add('on');
    slots[2].innerHTML = `<img src="assets/items/portalkey.png" alt="portalkey" style="width:90%;height:auto;">`;
  }
}

