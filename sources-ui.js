<script>
// sources-ui.js — чекбоксы источников + доступ из app.js

(function () {
  const LS_KEY = 'lootgen_sources';
  const ALL_SOURCES = [
    { code: 'DMG14', title: "Dungeon Master's Guide" },
    { code: 'AI',    title: 'Acquisition Incorporated' },
    { code: 'BPGG',  title: 'Bigby Presents: Glory of the Giants' },
    { code: 'BMT',   title: 'The Book of Many Things' },
    { code: 'RLW',   title: 'Eberron: Rising from the Last War' },
    { code: 'EGW',   title: "Explorer's Guide to Wildemount" },
    { code: 'GGR',   title: "Guildmasters' Guide to Ravnica" },
    { code: 'TCE',   title: "Tasha's Cauldron of Everything" },
    { code: 'XGE',   title: "Xanathar's Guide to Everything" },
  ];

  function loadSelected() {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (!raw) return ['DMG14']; // по умолчанию только DMG
      const arr = JSON.parse(raw);
      return Array.isArray(arr) && arr.length ? arr : ['DMG14'];
    } catch { return ['DMG14']; }
  }
  function saveSelected(arr) {
    localStorage.setItem(LS_KEY, JSON.stringify(arr));
    window.dispatchEvent(new CustomEvent('sources:changed', { detail: { selected: arr } }));
  }

  function buildUI() {
    const hostPanel = document.getElementById('settingsPanel');
    if (!hostPanel) return;

    const field = document.createElement('div');
    field.className = 'field';
    field.innerHTML = `
      <label>Источники предметов</label>
      <div id="sourcesFieldset" class="sources-grid"></div>
      <div class="row wrap gap" style="margin-top:.5rem">
        <button id="srcSelectAll" class="btn">Выбрать все</button>
        <button id="srcClear" class="btn">Очистить</button>
      </div>
      <p class="hint">Галочками отметь книги/сборники, из которых разрешено падение лута. По умолчанию — только DMG14.</p>
    `;
    hostPanel.appendChild(field);

    const fs = field.querySelector('#sourcesFieldset');
    const selected = new Set(loadSelected());

    for (const s of ALL_SOURCES) {
      const id = `src_${s.code}`;
      const line = document.createElement('label');
      line.className = 'src-line';
      line.style.display = 'flex';
      line.style.alignItems = 'center';
      line.style.gap = '.6rem';
      line.style.padding = '.2rem 0';

      line.innerHTML = `
        <input type="checkbox" id="${id}" value="${s.code}">
        <code style="min-width:5.2rem;display:inline-block">${s.code}</code>
        <span>— ${s.title}</span>
      `;
      const cb = line.querySelector('input');
      cb.checked = selected.has(s.code);
      cb.addEventListener('change', () => {
        const arr = Array.from(fs.querySelectorAll('input[type=checkbox]:checked')).map(x => x.value);
        saveSelected(arr);
      });
      fs.appendChild(line);
    }

    field.querySelector('#srcSelectAll').addEventListener('click', (e) => {
      e.preventDefault();
      fs.querySelectorAll('input[type=checkbox]').forEach(cb => cb.checked = true);
      const arr = Array.from(fs.querySelectorAll('input[type=checkbox]:checked')).map(x => x.value);
      saveSelected(arr);
    });
    field.querySelector('#srcClear').addEventListener('click', (e) => {
      e.preventDefault();
      fs.querySelectorAll('input[type=checkbox]').forEach(cb => cb.checked = false);
      saveSelected([]); // пусто = разрешим всё? нет — пусть пусто означает «ничего»
    });
  }

  // экспорт для app.js
  window.getSelectedSources = function () {
    return loadSelected(); // массив кодов
  };

  // стили сетки — чтобы выглядело аккуратно без правки CSS
  const style = document.createElement('style');
  style.textContent = `
    .sources-grid { display:grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap:.25rem .75rem; }
    .sources-grid code { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
  `;
  document.head.appendChild(style);

  document.addEventListener('DOMContentLoaded', buildUI);
})();
</script>
