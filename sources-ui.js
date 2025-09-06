// sources-ui.js — чекбоксы источников + API для app.js

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
      const raw = JSON.parse(localStorage.getItem(LS_KEY) || 'null');
      if (Array.isArray(raw) && raw.length) return raw;
    } catch {}
    // по умолчанию — только DMG14
    return ['DMG14'];
  }
  function saveSelected(list) {
    localStorage.setItem(LS_KEY, JSON.stringify(list));
  }

  function buildUI() {
    const panel = document.getElementById('settingsPanel');
    if (!panel) return;

    const block = document.createElement('div');
    block.className = 'field';
    block.innerHTML = `
      <label>Источники предметов</label>
      <div class="sources-grid" id="sourcesGrid"></div>
      <p class="hint">По умолчанию включён только DMG14. Галочки сохраняются локально.</p>
      <div class="row wrap gap">
        <button type="button" id="srcAllBtn" class="btn">Выбрать все</button>
        <button type="button" id="srcNoneBtn" class="btn">Снять все</button>
        <button type="button" id="srcOnlyDmgBtn" class="btn">Только DMG14</button>
      </div>
    `;
    // Вставляем ПЕРЕД кнопками настроек (чтобы было видно)
    const settingsButtons = panel.querySelector('#saveSettingsBtn')?.closest('.row') || null;
    if (settingsButtons) panel.insertBefore(block, settingsButtons);
    else panel.appendChild(block);

    const grid = block.querySelector('#sourcesGrid');
    const selected = new Set(loadSelected());

    for (const s of ALL_SOURCES) {
      const id = `src_${s.code}`;
      const wrap = document.createElement('label');
      wrap.className = 'checkbox';
      wrap.style.userSelect = 'none';
      wrap.innerHTML = `
        <input type="checkbox" id="${id}" value="${s.code}">
        <strong>${s.code}</strong> <span class="hint">${s.title}</span>
      `;
      const cb = wrap.querySelector('input');
      cb.checked = selected.has(s.code);
      cb.addEventListener('change', () => {
        const now = new Set(loadSelected());
        if (cb.checked) now.add(s.code); else now.delete(s.code);
        const arr = Array.from(now);
        // не допускаем пустого выбора: если сняли всё — вернём DMG14
        saveSelected(arr.length ? arr : ['DMG14']);
      });
      grid.appendChild(wrap);
    }

    block.querySelector('#srcAllBtn').addEventListener('click', () => {
      saveSelected(ALL_SOURCES.map(s => s.code));
      grid.querySelectorAll('input[type=checkbox]').forEach(cb => cb.checked = true);
    });
    block.querySelector('#srcNoneBtn').addEventListener('click', () => {
      saveSelected(['DMG14']);
      grid.querySelectorAll('input[type=checkbox]').forEach(cb => cb.checked = cb.value === 'DMG14');
    });
    block.querySelector('#srcOnlyDmgBtn').addEventListener('click', () => {
      saveSelected(['DMG14']);
      grid.querySelectorAll('input[type=checkbox]').forEach(cb => cb.checked = cb.value === 'DMG14');
    });
  }

  // API для app.js
  window.getSelectedSources = function getSelectedSources() {
    return loadSelected();
  };

  // немного стилей сетки (чтобы без правки твоего CSS)
  const style = document.createElement('style');
  style.textContent = `
    .sources-grid { display:grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap:.25rem .75rem; }
    .sources-grid .checkbox { display:flex; align-items:center; gap:.5rem; }
    .sources-grid strong { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
  `;
  document.head.appendChild(style);

  document.addEventListener('DOMContentLoaded', buildUI);
})();
