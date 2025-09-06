// sources-ui.js — выбор источников (чекбоксы) + минимальные CSS-фиксы
// ВЕРСИЯ: fix-checkboxes-and-header-compact-1

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
    return ['DMG14']; // дефолт — только DMG14
  }
  function saveSelected(list) {
    localStorage.setItem(LS_KEY, JSON.stringify(list));
  }

  // === UI
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
    const settingsButtons = panel.querySelector('#saveSettingsBtn')?.closest('.row') || null;
    if (settingsButtons) panel.insertBefore(block, settingsButtons);
    else panel.appendChild(block);

    const grid = block.querySelector('#sourcesGrid');
    const selected = new Set(loadSelected());

    for (const s of ALL_SOURCES) {
      const id = `src_${s.code}`;
      const row = document.createElement('div');
      row.className = 'src-row';
      row.innerHTML = `
        <input class="src-cb" type="checkbox" id="${id}" value="${s.code}">
        <label class="src-label" for="${id}">
          <strong>${s.code}</strong><span class="hint">${s.title}</span>
        </label>
      `;
      const cb = row.querySelector('input');
      cb.checked = selected.has(s.code);
      cb.addEventListener('change', () => {
        const now = new Set(loadSelected());
        if (cb.checked) now.add(s.code); else now.delete(s.code);
        const arr = Array.from(now);
        saveSelected(arr.length ? arr : ['DMG14']); // не даём пустой набор
      });
      grid.appendChild(row);
    }

    block.querySelector('#srcAllBtn').addEventListener('click', () => {
      saveSelected(ALL_SOURCES.map(s => s.code));
      grid.querySelectorAll('.src-cb').forEach(cb => cb.checked = true);
    });
    block.querySelector('#srcNoneBtn').addEventListener('click', () => {
      saveSelected(['DMG14']);
      grid.querySelectorAll('.src-cb').forEach(cb => cb.checked = (cb.value === 'DMG14'));
    });
    block.querySelector('#srcOnlyDmgBtn').addEventListener('click', () => {
      saveSelected(['DMG14']);
      grid.querySelectorAll('.src-cb').forEach(cb => cb.checked = (cb.value === 'DMG14'));
    });
  }

  // === API для app.js
  window.getSelectedSources = function getSelectedSources() {
    return loadSelected();
  };

  // === CSS-фиксы (внедряем стилями, чтобы не трогать твой styles.css и index.html)
  const style = document.createElement('style');
  style.textContent = `
    /* 1) нормальные ГАЛОЧКИ (глобальные стили инпутов не должны их превращать в «полоски») */
    .sources-grid { display:grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap:.5rem .75rem; }
    .sources-grid .src-row { display:flex; align-items:center; gap:.5rem; }
    .sources-grid .src-cb{
      -webkit-appearance: checkbox !important;
      -moz-appearance: checkbox !important;
      appearance: checkbox !important;
      width: 18px !important;
      height: 18px !important;
      margin: 0 6px 0 0 !important;
      padding: 0 !important;
      border: none !important;
      background: transparent !important;
      display:inline-block !important;
    }
    .sources-grid .src-label{ display:flex; align-items:baseline; gap:.5rem; cursor:pointer; }
    .sources-grid strong{
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      background: rgba(255,255,255,.06);
      padding: .1rem .35rem; border-radius: .5rem;
    }

    /* 2) компактный хедер: заголовок слева, вкладки рядом, кнопка «Меню» прижата вправо */
    .app-header{ display:flex; align-items:center; gap:.75rem; }
    .app-header .tabs{ display:inline-flex; flex-wrap:wrap; gap:.25rem; }
    #menuBtn{ margin-left:auto; }
  `;
  document.head.appendChild(style);

  document.addEventListener('DOMContentLoaded', buildUI);
})();
