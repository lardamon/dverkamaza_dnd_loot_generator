// items.js — загрузка базы предметов
// Требует window.APP_VERSION из version.js

(function () {
  let ITEMS = [];
  let LOADED = false;

  async function loadItems() {
    try {
      const url = `data/items.json?v=${encodeURIComponent(APP_VERSION)}`;
      const res = await fetch(url, { cache: 'no-cache' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      ITEMS = await res.json();
      LOADED = true;
      console.log('[items] Загружено предметов:', ITEMS.length);
      // уведомим приложение
      window.dispatchEvent(new CustomEvent('items:ready', { detail: { count: ITEMS.length }}));
    } catch (e) {
      console.error('[items] Ошибка загрузки:', e);
    }
  }

  // небольшой помощник для фильтрации по источникам
  function filterBySources(items, sourceCodes) {
    if (!Array.isArray(sourceCodes) || !sourceCodes.length) return items;
    const set = new Set(sourceCodes.map(String));
    return items.filter(it => set.has(String(it.source_code || '').trim()));
  }

  // экспорт в глобал
  window.ITEMS = ITEMS;               // массив будет заменён после загрузки
  window.getItems = () => ITEMS;      // безопасный геттер
  window.itemsLoaded = () => LOADED;  // флаг готовности
  window.filterBySources = filterBySources;
  window.loadItems = loadItems;

  // автозапуск
  loadItems();
})();
