// pricing.js — единая цена предмета из диапазона + автоподмена вывода
(function(){
  // режим: 'avg' | 'min' | 'max' | 'random'
  function itemEffectivePrice(it, mode = 'avg') {
    const min = Number(it.price_min ?? 0);
    const max = Number(it.price_max ?? 0);
    if ((!min || isNaN(min)) && (!max || isNaN(max))) return 0;
    if (!max || isNaN(max)) return Math.round(min);
    if (!min || isNaN(min)) return Math.round(max);
    switch (mode) {
      case 'min': return Math.round(min);
      case 'max': return Math.round(max);
      case 'random': {
        const u = Math.random(); const k = 1.6; // тянем ближе к min
        const t = Math.pow(u, k);
        return Math.round(min + (max - min) * t);
      }
      case 'avg':
      default: return Math.round((min + max) / 2);
    }
  }
  function gp(n){ return new Intl.NumberFormat('ru-RU').format(Math.max(0, Math.round(n||0))); }

  // поиск предмета по имени среди ITEMS
  function findItemByRenderedName(name){
    const items = (typeof getItems==='function'? getItems(): (window.ITEMS||[]));
    if (!name) return null;
    const clean = name.trim().toLowerCase();
    let it = items.find(x => String(x.name||'').trim().toLowerCase() === clean);
    if (it) return it;
    const base = clean.replace(/\s*\(.*?\)\s*$/,'').trim();
    return items.find(x => String(x.name||'').trim().toLowerCase() === base) || null;
  }

  // чинит "~undefined gp" в #itemsList
  function fixRenderedPrices(){
    const list = document.getElementById('itemsList');
    if (!list) return;
    const lis = Array.from(list.querySelectorAll('li'));
    for (const li of lis){
      if (!/undefined\s*gp/i.test(li.textContent)) continue;
      const left = li.textContent.split('—')[0];
      const name = left ? left.trim() : '';
      const it = findItemByRenderedName(name);
      if (!it) continue;
      const p = itemEffectivePrice(it, 'avg');
      li.innerHTML = li.innerHTML.replace(/~undefined\s*gp/ig, `~${gp(p)} gp`);
    }
  }

  // экспорт
  window.itemEffectivePrice = itemEffectivePrice;
  window.gp = gp;
  window.fixRenderedPrices = fixRenderedPrices;

  // запуск после генерации
  window.addEventListener('items:ready', () => {
    const btn = document.getElementById('generateBtn');
    if (btn) {
      btn.addEventListener('click', () => {
        setTimeout(fixRenderedPrices, 0);
        setTimeout(fixRenderedPrices, 60);
      });
    }
  });
  document.addEventListener('DOMContentLoaded', () => setTimeout(fixRenderedPrices, 120));
})();
