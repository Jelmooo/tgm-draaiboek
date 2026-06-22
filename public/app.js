'use strict';

// ---------- Constanten ----------
const PRIORITIES = [
  { key: 'hoog', label: 'Hoog' },
  { key: 'middel', label: 'Middel' },
  { key: 'laag', label: 'Laag' }
];
const STATUSSES = [
  { key: 'open', label: 'Nog niet begonnen' },
  { key: 'bezig', label: 'Bezig' },
  { key: 'klaar', label: 'Klaar' }
];
const EMOJIS = ['🎨', '💄', '📱', '🏛️', '🔨', '🎭', '💡', '🎵', '🧵', '📣', '🍿', '📋'];
const COLORS = ['#7c5cff', '#ff5d6c', '#ffb547', '#4fd1c5', '#4aa3ff', '#46c46a', '#e879f9', '#f97316'];

// ---------- State ----------
let state = { sectors: [], tasks: [] };

const appEl = document.getElementById('app');
const breadcrumbEl = document.getElementById('breadcrumb');

// ---------- Helpers ----------
function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') node.className = v;
    else if (k === 'html') node.innerHTML = v;
    else if (k === 'text') node.textContent = v;
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
    else if (v !== null && v !== undefined && v !== false) node.setAttribute(k, v);
  }
  for (const c of [].concat(children)) {
    if (c == null) continue;
    node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  }
  return node;
}

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
  );
}

async function api(method, url, body) {
  const opts = { method, headers: {} };
  if (body !== undefined) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }
  const res = await fetch(url, opts);
  if (!res.ok) {
    const msg = await res.json().catch(() => ({}));
    throw new Error(msg.error || 'Er ging iets mis');
  }
  return res.status === 204 ? null : res.json();
}

async function loadState() {
  state = await api('GET', '/api/state');
}

function tasksForSector(sectorId) {
  return state.tasks
    .filter((t) => t.sectorId === sectorId)
    .sort((a, b) => (a.position || 0) - (b.position || 0));
}

// Voortgang: subtaken tellen; geen subtaken -> status bepaalt voortgang.
function taskProgress(task) {
  const subs = task.subtasks || [];
  if (subs.length > 0) {
    const done = subs.filter((s) => s.done).length;
    return { done, total: subs.length, pct: Math.round((done / subs.length) * 100) };
  }
  const pct = task.status === 'klaar' ? 100 : task.status === 'bezig' ? 50 : 0;
  return { done: task.status === 'klaar' ? 1 : 0, total: 1, pct };
}

function sectorProgress(sectorId) {
  const tasks = tasksForSector(sectorId);
  if (tasks.length === 0) return { pct: 0, klaar: 0, total: 0 };
  const sum = tasks.reduce((acc, t) => acc + taskProgress(t).pct, 0);
  const klaar = tasks.filter((t) => taskProgress(t).pct === 100).length;
  return { pct: Math.round(sum / tasks.length), klaar, total: tasks.length };
}

function formatDate(iso) {
  if (!iso) return null;
  const d = new Date(iso + 'T00:00:00');
  if (isNaN(d)) return iso;
  return d.toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' });
}

function isOverdue(task) {
  if (!task.deadline || task.status === 'klaar') return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return new Date(task.deadline + 'T00:00:00') < today;
}

function progressBar(pct, label) {
  const fill = el('div', {
    class: 'progress-fill' + (pct > 0 && pct < 100 ? ' partial' : ''),
    style: `width:${pct}%`
  });
  const bar = el('div', { class: 'progress' }, [fill]);
  if (label == null) return bar;
  return el('div', { class: 'progress-row' }, [bar, el('span', { class: 'progress-label', text: label })]);
}

// ---------- Modal ----------
const overlay = document.getElementById('modal-overlay');
const modalTitle = document.getElementById('modal-title');
const modalBody = document.getElementById('modal-body');

function openModal(title, bodyNode) {
  modalTitle.textContent = title;
  modalBody.innerHTML = '';
  modalBody.appendChild(bodyNode);
  overlay.classList.remove('hidden');
}
function closeModal() {
  overlay.classList.add('hidden');
  modalBody.innerHTML = '';
}
overlay.addEventListener('click', (e) => {
  if (e.target === overlay || e.target.hasAttribute('data-close-modal')) closeModal();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !overlay.classList.contains('hidden')) closeModal();
});

// ---------- Router ----------
function router() {
  const hash = location.hash || '#/';
  const match = hash.match(/^#\/sector\/(.+)$/);
  if (match) renderSector(decodeURIComponent(match[1]));
  else renderHome();
}

window.addEventListener('hashchange', router);

// ---------- Home ----------
function renderHome() {
  breadcrumbEl.innerHTML = '';
  const sectors = state.sectors;

  const head = el('div', { class: 'page-head' }, [
    el('div', {}, [
      el('h1', { class: 'page-title' }, ['Sectoren']),
      el('p', { class: 'page-sub', text: 'Kies een commissie om het draaiboek te bekijken.' })
    ]),
    el('button', { class: 'btn btn-primary', onclick: () => openSectorForm() }, ['＋ Sector toevoegen'])
  ]);

  appEl.innerHTML = '';
  appEl.appendChild(head);

  if (sectors.length === 0) {
    appEl.appendChild(emptyState('🎭', 'Nog geen sectoren', 'Voeg je eerste sector toe, bijvoorbeeld de Decorcommissie.'));
    return;
  }

  const grid = el('div', { class: 'sector-grid' });
  for (const sector of sectors) {
    const prog = sectorProgress(sector.id);
    const card = el('div', {
      class: 'sector-card',
      style: `--sector-color:${sector.color}`,
      onclick: (e) => {
        if (e.target.closest('.edit-sector')) return;
        location.hash = `#/sector/${sector.id}`;
      }
    }, [
      el('button', {
        class: 'icon-btn edit-sector',
        title: 'Sector bewerken',
        onclick: () => openSectorForm(sector)
      }, ['✎']),
      el('div', { class: 'sector-card-head' }, [
        el('div', { class: 'sector-emoji', style: `background:${sector.color}22`, text: sector.icon }),
        el('div', { class: 'sector-name', text: sector.name })
      ]),
      el('div', {
        class: 'sector-stats',
        text: prog.total === 0 ? 'Nog geen taken' : `${prog.klaar} van ${prog.total} taken klaar`
      }),
      progressBar(prog.pct, `${prog.pct}%`)
    ]);
    grid.appendChild(card);
  }
  appEl.appendChild(grid);
}

// ---------- Sector (takenlijst) ----------
function renderSector(sectorId) {
  const sector = state.sectors.find((s) => s.id === sectorId);
  if (!sector) {
    location.hash = '#/';
    return;
  }

  breadcrumbEl.innerHTML = '';
  breadcrumbEl.appendChild(el('span', { class: 'sep', text: '/' }));
  breadcrumbEl.appendChild(el('span', { text: `${sector.icon} ${sector.name}` }));

  const tasks = tasksForSector(sectorId);
  const prog = sectorProgress(sectorId);

  const head = el('div', { class: 'page-head' }, [
    el('div', {}, [
      el('h1', { class: 'page-title' }, [
        el('span', { text: sector.icon }),
        el('span', { text: sector.name })
      ]),
      el('p', {
        class: 'page-sub',
        text: prog.total === 0 ? 'Nog geen taken' : `${prog.klaar}/${prog.total} klaar · ${prog.pct}% voltooid`
      })
    ]),
    el('button', { class: 'btn btn-primary', onclick: () => openTaskForm(sectorId) }, ['＋ Taak toevoegen'])
  ]);

  appEl.innerHTML = '';
  appEl.appendChild(head);

  if (tasks.length === 0) {
    appEl.appendChild(emptyState('📋', 'Nog geen taken', 'Voeg de eerste taak toe voor deze sector.'));
    return;
  }

  const list = el('div', { class: 'task-list' });
  for (const task of tasks) list.appendChild(renderTaskCard(task));
  appEl.appendChild(list);
}

function renderTaskCard(task) {
  const prog = taskProgress(task);
  const prioLabel = (PRIORITIES.find((p) => p.key === task.priority) || {}).label || task.priority;
  const done = prog.pct === 100;

  // Statusselector
  const statusSelect = el('select', {
    class: `status-select status-${task.status}`,
    onchange: async (e) => {
      await api('PATCH', `/api/tasks/${task.id}`, { status: e.target.value });
      await refresh();
    }
  });
  for (const s of STATUSSES) {
    statusSelect.appendChild(el('option', { value: s.key, selected: s.key === task.status ? 'selected' : null, text: s.label }));
  }

  // Meta
  const meta = el('div', { class: 'task-meta' });
  meta.appendChild(el('span', { class: 'meta-item' }, [el('span', { text: '👤' }), el('span', { text: task.assignee || 'Niemand toegewezen' })]));
  if (task.deadline) {
    meta.appendChild(el('span', { class: 'meta-item' + (isOverdue(task) ? ' overdue' : '') }, [
      el('span', { text: '📅' }),
      el('span', { text: formatDate(task.deadline) + (isOverdue(task) ? ' · te laat' : '') })
    ]));
  }

  const titleRow = el('div', { class: 'task-title-row' }, [
    el('h3', { class: 'task-title' + (done ? ' done' : ''), text: task.title }),
    el('span', { class: `badge badge-prio-${task.priority}` }, [el('span', { class: 'dot', style: `background:var(--prio-${task.priority})` }), prioLabel]),
    statusSelect
  ]);

  const main = el('div', { class: 'task-main' }, [titleRow, meta]);
  if (task.notes) main.appendChild(el('div', { class: 'task-notes', text: task.notes }));

  const actions = el('div', { class: 'task-actions' }, [
    el('button', { class: 'icon-btn', title: 'Bewerken', onclick: () => openTaskForm(task.sectorId, task) }, ['✎']),
    el('button', { class: 'icon-btn', title: 'Verwijderen', onclick: () => confirmDeleteTask(task) }, ['🗑'])
  ]);

  const card = el('div', {
    class: 'task-card',
    style: `--task-accent:var(--prio-${task.priority})`
  }, [el('div', { class: 'task-top' }, [main, actions])]);

  // Subtaken + voortgangsbalk
  card.appendChild(renderSubtasks(task, prog));
  return card;
}

function renderSubtasks(task, prog) {
  const wrap = el('div', { class: 'subtasks' });
  const total = (task.subtasks || []).length;

  wrap.appendChild(el('div', { class: 'subtasks-head' }, [
    el('h4', { text: total > 0 ? `Stappen (${prog.done}/${prog.total})` : 'Stappen' }),
    total > 0 ? progressBar(prog.pct, `${prog.pct}%`) : null
  ]));

  for (const sub of task.subtasks || []) {
    const cb = el('input', { type: 'checkbox', ...(sub.done ? { checked: 'checked' } : {}) });
    cb.addEventListener('change', async () => {
      await api('PATCH', `/api/tasks/${task.id}/subtasks/${sub.id}`, { done: cb.checked });
      await refresh();
    });
    wrap.appendChild(el('div', { class: 'subtask' }, [
      el('label', {}, [cb, el('span', { class: 'sub-title' + (sub.done ? ' done' : ''), text: sub.title })]),
      el('button', {
        class: 'icon-btn', title: 'Stap verwijderen',
        onclick: async () => { await api('DELETE', `/api/tasks/${task.id}/subtasks/${sub.id}`); await refresh(); }
      }, ['✕'])
    ]));
  }

  // Nieuwe stap toevoegen
  const input = el('input', { type: 'text', placeholder: 'Nieuwe stap, bijv. "Verven"' });
  const add = async () => {
    const title = input.value.trim();
    if (!title) return;
    await api('POST', `/api/tasks/${task.id}/subtasks`, { title });
    await refresh();
  };
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') add(); });
  wrap.appendChild(el('div', { class: 'subtask-add' }, [
    input,
    el('button', { class: 'btn btn-sm', onclick: add }, ['Toevoegen'])
  ]));

  return wrap;
}

// ---------- Formulieren ----------
function field(labelText, inputNode) {
  return el('div', { class: 'field' }, [el('label', { text: labelText }), inputNode]);
}

function openTaskForm(sectorId, task) {
  const isEdit = !!task;
  const t = task || { title: '', assignee: '', deadline: '', priority: 'middel', status: 'open', notes: '' };

  const titleInput = el('input', { type: 'text', value: t.title, placeholder: 'Bijv. Achterwand' });
  const assigneeInput = el('input', { type: 'text', value: t.assignee, placeholder: 'Wie pakt dit op?' });
  const deadlineInput = el('input', { type: 'date', value: t.deadline || '' });
  const notesInput = el('textarea', { placeholder: 'Optionele toelichting' });
  notesInput.value = t.notes || '';

  // Prioriteit chips
  let priority = t.priority;
  const prioChips = el('div', { class: 'chip-row' });
  PRIORITIES.forEach((p) => {
    const chip = el('button', { class: 'chip' + (p.key === priority ? ' selected' : ''), type: 'button', text: p.label });
    chip.addEventListener('click', () => {
      priority = p.key;
      prioChips.querySelectorAll('.chip').forEach((c) => c.classList.remove('selected'));
      chip.classList.add('selected');
    });
    prioChips.appendChild(chip);
  });

  // Status chips
  let status = t.status;
  const statusChips = el('div', { class: 'chip-row' });
  STATUSSES.forEach((s) => {
    const chip = el('button', { class: 'chip' + (s.key === status ? ' selected' : ''), type: 'button', text: s.label });
    chip.addEventListener('click', () => {
      status = s.key;
      statusChips.querySelectorAll('.chip').forEach((c) => c.classList.remove('selected'));
      chip.classList.add('selected');
    });
    statusChips.appendChild(chip);
  });

  const save = async () => {
    if (!titleInput.value.trim()) { titleInput.focus(); return; }
    const payload = {
      title: titleInput.value, assignee: assigneeInput.value,
      deadline: deadlineInput.value, priority, status, notes: notesInput.value
    };
    if (isEdit) await api('PATCH', `/api/tasks/${task.id}`, payload);
    else await api('POST', '/api/tasks', { sectorId, ...payload });
    closeModal();
    await refresh();
  };

  const body = el('div', {}, [
    field('Taak', titleInput),
    el('div', { class: 'field-row' }, [field('Verantwoordelijke', assigneeInput), field('Deadline', deadlineInput)]),
    field('Prioriteit', prioChips),
    field('Status', statusChips),
    field('Notities', notesInput),
    el('div', { class: 'modal-actions' }, [
      el('button', { class: 'btn', 'data-close-modal': '' }, ['Annuleren']),
      el('button', { class: 'btn btn-primary', onclick: save }, [isEdit ? 'Opslaan' : 'Toevoegen'])
    ])
  ]);

  openModal(isEdit ? 'Taak bewerken' : 'Nieuwe taak', body);
  setTimeout(() => titleInput.focus(), 50);
}

function confirmDeleteTask(task) {
  const body = el('div', {}, [
    el('p', { text: `Weet je zeker dat je "${task.title}" wilt verwijderen? Dit kan niet ongedaan gemaakt worden.` }),
    el('div', { class: 'modal-actions' }, [
      el('button', { class: 'btn', 'data-close-modal': '' }, ['Annuleren']),
      el('button', {
        class: 'btn btn-danger',
        onclick: async () => { await api('DELETE', `/api/tasks/${task.id}`); closeModal(); await refresh(); }
      }, ['Verwijderen'])
    ])
  ]);
  openModal('Taak verwijderen', body);
}

function openSectorForm(sector) {
  const isEdit = !!sector;
  const s = sector || { name: '', icon: '📋', color: COLORS[0] };

  const nameInput = el('input', { type: 'text', value: s.name, placeholder: 'Bijv. Grime' });

  let icon = s.icon;
  const emojiRow = el('div', { class: 'chip-row emoji-row' });
  EMOJIS.forEach((e) => {
    const chip = el('button', { class: 'chip' + (e === icon ? ' selected' : ''), type: 'button', text: e });
    chip.addEventListener('click', () => {
      icon = e;
      emojiRow.querySelectorAll('.chip').forEach((c) => c.classList.remove('selected'));
      chip.classList.add('selected');
    });
    emojiRow.appendChild(chip);
  });

  let color = s.color;
  const colorRow = el('div', { class: 'color-row' });
  COLORS.forEach((c) => {
    const dot = el('button', { class: 'color-dot' + (c === color ? ' selected' : ''), type: 'button', style: `background:${c}` });
    dot.addEventListener('click', () => {
      color = c;
      colorRow.querySelectorAll('.color-dot').forEach((d) => d.classList.remove('selected'));
      dot.classList.add('selected');
    });
    colorRow.appendChild(dot);
  });

  const save = async () => {
    if (!nameInput.value.trim()) { nameInput.focus(); return; }
    const payload = { name: nameInput.value, icon, color };
    if (isEdit) await api('PATCH', `/api/sectors/${sector.id}`, payload);
    else await api('POST', '/api/sectors', payload);
    closeModal();
    await refresh();
  };

  const actions = el('div', { class: 'modal-actions' }, [
    isEdit ? el('button', { class: 'btn btn-danger', onclick: () => confirmDeleteSector(sector) }, ['Verwijderen']) : null,
    el('div', { class: 'spacer' }),
    el('button', { class: 'btn', 'data-close-modal': '' }, ['Annuleren']),
    el('button', { class: 'btn btn-primary', onclick: save }, [isEdit ? 'Opslaan' : 'Toevoegen'])
  ]);

  const body = el('div', {}, [
    field('Naam', nameInput),
    field('Icoon', emojiRow),
    field('Kleur', colorRow),
    actions
  ]);

  openModal(isEdit ? 'Sector bewerken' : 'Nieuwe sector', body);
  setTimeout(() => nameInput.focus(), 50);
}

function confirmDeleteSector(sector) {
  const count = tasksForSector(sector.id).length;
  const body = el('div', {}, [
    el('p', { text: `"${sector.name}" verwijderen?${count ? ` Alle ${count} taken hierin worden ook verwijderd.` : ''} Dit kan niet ongedaan gemaakt worden.` }),
    el('div', { class: 'modal-actions' }, [
      el('button', { class: 'btn', 'data-close-modal': '' }, ['Annuleren']),
      el('button', {
        class: 'btn btn-danger',
        onclick: async () => { await api('DELETE', `/api/sectors/${sector.id}`); closeModal(); location.hash = '#/'; await refresh(); }
      }, ['Verwijderen'])
    ])
  ]);
  openModal('Sector verwijderen', body);
}

// ---------- Util ----------
function emptyState(emoji, title, sub) {
  return el('div', { class: 'empty' }, [
    el('span', { class: 'empty-emoji', text: emoji }),
    el('div', { style: 'font-size:18px;font-weight:700;color:var(--text);margin-bottom:6px', text: title }),
    el('div', { text: sub })
  ]);
}

async function refresh() {
  await loadState();
  router();
}

// ---------- Start ----------
(async function init() {
  try {
    await loadState();
  } catch (err) {
    appEl.innerHTML = `<div class="empty"><span class="empty-emoji">⚠️</span><div>Kon de gegevens niet laden.<br>${esc(err.message)}</div></div>`;
    return;
  }
  router();
})();
