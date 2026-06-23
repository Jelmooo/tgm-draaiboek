'use strict';

// ---------- Constanten ----------
const PRIORITIES = [
  { key: 'hoog', label: 'Hoog' },
  { key: 'middel', label: 'Middel' },
  { key: 'laag', label: 'Laag' }
];
const STATUSSES = [
  { key: 'open', label: 'Nog niet begonnen', short: 'Te doen' },
  { key: 'bezig', label: 'Bezig', short: 'Bezig' },
  { key: 'klaar', label: 'Klaar', short: 'Klaar' }
];
const EMOJIS = ['🎨', '💄', '📱', '🏛️', '🔨', '🎭', '💡', '🎵', '🧵', '📣', '🍿', '🎟️'];
const COLORS = ['#6a5ae0', '#ef4d5a', '#f3920b', '#16b07a', '#3b82f6', '#e168c6', '#0ea5a5', '#f25c54'];

let state = { sectors: [], tasks: [] };
let expandedTask = null; // accordion: er staat altijd hooguit één taak open
let editingStepId = null;
let addingStepFor = null; // welke taak het "nieuwe stap"-veld open heeft staan

// Filters/zoeken (per sector)
let filterStatus = 'alles';
let filterPerson = '';
let searchQuery = '';
let filterSectorId = null;

// Animatie-hulpvlaggen (zo speelt een animatie alleen bij de échte actie)
let justOpenedTask = null;
let justAddedStepId = null;
let lastRoute = null;
let animateView = false;
let navDir = 'right';

const appEl = document.getElementById('app');
const appbarEl = document.getElementById('appbar');

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
    if (c == null || c === false) continue;
    node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  }
  return node;
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

function taskProgress(task) {
  const subs = task.subtasks || [];
  if (subs.length > 0) {
    const done = subs.filter((s) => s.done).length;
    return { done, total: subs.length, pct: Math.round((done / subs.length) * 100), hasSubs: true };
  }
  const pct = task.status === 'klaar' ? 100 : task.status === 'bezig' ? 50 : 0;
  return { done: task.status === 'klaar' ? 1 : 0, total: 1, pct, hasSubs: false };
}

function peopleInSector(sectorId) {
  const set = new Set();
  tasksForSector(sectorId).forEach((t) => { const a = (t.assignee || '').trim(); if (a) set.add(a); });
  return [...set].sort((a, b) => a.localeCompare(b, 'nl'));
}

// Pas zoek- en filterinstellingen toe op de taken van een sector.
function filteredTasks(sectorId) {
  let tasks = tasksForSector(sectorId);
  if (filterStatus !== 'alles') tasks = tasks.filter((t) => t.status === filterStatus);
  if (filterPerson) tasks = tasks.filter((t) => (t.assignee || '').trim() === filterPerson);
  const q = searchQuery.trim().toLowerCase();
  if (q) {
    tasks = tasks.filter((t) =>
      (t.title || '').toLowerCase().includes(q) ||
      (t.assignee || '').toLowerCase().includes(q) ||
      (t.notes || '').toLowerCase().includes(q) ||
      (t.subtasks || []).some((s) => (s.title || '').toLowerCase().includes(q))
    );
  }
  return tasks;
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
  return d.toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' });
}

// Deadline kan een exacte datum, een week (maandagdatum) of een maand (YYYY-MM) zijn.
function formatDeadline(task) {
  if (!task.deadline) return null;
  const type = task.deadlineType || 'datum';
  if (type === 'maand') {
    const [y, m] = task.deadline.split('-').map(Number);
    return new Date(y, m - 1, 1).toLocaleDateString('nl-NL', { month: 'long', year: 'numeric' });
  }
  if (type === 'week') {
    return 'Week van ' + formatDate(task.deadline);
  }
  return formatDate(task.deadline);
}

function deadlineEnd(task) {
  const type = task.deadlineType || 'datum';
  if (type === 'maand') { const [y, m] = task.deadline.split('-').map(Number); return new Date(y, m, 0); }
  if (type === 'week') { const d = new Date(task.deadline + 'T00:00:00'); d.setDate(d.getDate() + 6); return d; }
  return new Date(task.deadline + 'T00:00:00');
}

function isOverdue(task) {
  if (!task.deadline || task.status === 'klaar') return false;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const end = deadlineEnd(task); end.setHours(0, 0, 0, 0);
  return end < today;
}

function progressBar(pct) {
  const cls = pct >= 100 ? '' : pct > 0 ? ' partial' : ' zero';
  const width = pct <= 0 ? 0 : Math.max(pct, 4); // bij 0% niets tonen (geen grijs bolletje)
  return el('div', { class: 'progress' }, [
    el('div', { class: 'progress-fill' + cls, style: `width:${width}%` })
  ]);
}

function setAppbar(children) {
  appbarEl.innerHTML = '';
  [].concat(children).forEach((c) => c && appbarEl.appendChild(c));
}

function fab(label, onclick) {
  return el('button', { class: 'fab', onclick }, [el('span', { class: 'plus', text: '＋' }), label]);
}

// ---------- Bottom sheet ----------
const overlay = document.getElementById('sheet-overlay');
const sheetTitle = document.getElementById('sheet-title');
const sheetBody = document.getElementById('sheet-body');
const sheetFoot = document.getElementById('sheet-foot');

function openSheet(title, body, foot) {
  sheetTitle.textContent = title;
  sheetBody.innerHTML = ''; sheetBody.appendChild(body);
  sheetFoot.innerHTML = '';
  [].concat(foot || []).forEach((f) => f && sheetFoot.appendChild(f));
  sheetFoot.style.display = (foot && [].concat(foot).some(Boolean)) ? 'flex' : 'none';
  overlay.classList.remove('hidden', 'closing');
}
function closeSheet() {
  overlay.classList.add('closing');
  setTimeout(() => { overlay.classList.add('hidden'); sheetBody.innerHTML = ''; sheetFoot.innerHTML = ''; }, 200);
}
overlay.addEventListener('click', (e) => { if (e.target === overlay) closeSheet(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !overlay.classList.contains('hidden')) closeSheet(); });

// ---------- Router ----------
function router() {
  const m = (location.hash || '#/').match(/^#\/sector\/(.+)$/);
  const newRoute = m ? 'sector:' + decodeURIComponent(m[1]) : 'home';
  animateView = newRoute !== lastRoute; // alleen animeren bij échte navigatie, niet bij verversen
  navDir = m ? 'right' : 'left';
  lastRoute = newRoute;
  if (m) renderSector(decodeURIComponent(m[1]));
  else renderHome();
}

function viewClass() {
  return 'view' + (animateView ? (navDir === 'right' ? ' view-in-right' : ' view-in-left') : '');
}
window.addEventListener('hashchange', router);

// ---------- Home ----------
function renderHome() {
  setAppbar(el('div', { class: 'appbar-title' }, [el('span', { text: '🎭' }), el('span', { text: 'Draaiboek' })]));

  const view = el('div', { class: viewClass() });
  view.appendChild(el('div', { class: 'greeting' }, [
    el('h1', { text: 'Onze draaiboeken' }),
    el('p', { text: 'Tik op een draaiboek om de taken te zien.' })
  ]));

  if (state.sectors.length === 0) {
    view.appendChild(emptyState('🎭', 'Nog geen draaiboeken', 'Voeg er hieronder één toe, bijvoorbeeld voor de Decorcommissie.'));
  } else {
    const list = el('div', { class: 'sector-list' });
    for (const s of state.sectors) {
      const p = sectorProgress(s.id);
      list.appendChild(el('div', {
        class: 'sector-card',
        onclick: () => { location.hash = `#/sector/${s.id}`; }
      }, [
        el('div', { class: 'sector-icon', style: `background:${s.color}1f`, text: s.icon }),
        el('div', { class: 'sector-body' }, [
          el('div', { class: 'sector-name', text: s.name }),
          el('div', { class: 'sector-sub', text: p.total === 0 ? 'Nog geen taken' : `${p.klaar} van ${p.total} taken klaar` }),
          progressBar(p.pct)
        ]),
        el('div', { class: 'sector-chev', text: '›' })
      ]));
    }
    view.appendChild(list);
  }

  appEl.innerHTML = '';
  appEl.appendChild(view);
  appEl.appendChild(fab('Draaiboek toevoegen', () => openSectorForm()));
}

// ---------- Sector ----------
function renderSector(sectorId) {
  const sector = state.sectors.find((s) => s.id === sectorId);
  if (!sector) { location.hash = '#/'; return; }

  setAppbar([
    el('button', { class: 'appbar-back', onclick: () => { location.hash = '#/'; }, 'aria-label': 'Terug' }, ['‹']),
    el('div', { class: 'appbar-title' }, [
      el('span', { class: 'appbar-emoji', style: `background:${sector.color}1f`, text: sector.icon }),
      el('span', { text: sector.name })
    ]),
    el('button', { class: 'appbar-back', onclick: () => openSectorForm(sector), 'aria-label': 'Commissie bewerken' }, ['✎'])
  ]);

  // Filters resetten als je een andere sector binnenkomt.
  if (filterSectorId !== sectorId) { filterStatus = 'alles'; filterPerson = ''; searchQuery = ''; filterSectorId = sectorId; }

  const allTasks = tasksForSector(sectorId);
  const p = sectorProgress(sectorId);

  const view = el('div', { class: viewClass() });
  view.appendChild(el('div', { class: 'summary' }, [
    el('div', { class: 'summary-top' }, [
      el('div', { class: 'summary-pct', text: `${p.pct}%` }),
      el('div', { class: 'summary-count', text: p.total === 0 ? 'Nog geen taken' : `${p.klaar}/${p.total} taken klaar` })
    ]),
    progressBar(p.pct)
  ]));

  if (allTasks.length === 0) {
    view.appendChild(emptyState('📋', 'Nog geen taken', 'Voeg de eerste taak toe met de knop rechtsonder.'));
    appEl.innerHTML = '';
    appEl.appendChild(view);
    appEl.appendChild(fab('Taak', () => openTaskForm(sectorId)));
    return;
  }

  // Lijst-container die alleen verversen we bij zoeken/filteren (zo blijft de focus in de zoekbalk).
  const listContainer = el('div', {});
  const renderList = () => {
    listContainer.innerHTML = '';
    const tasks = filteredTasks(sectorId);
    if (tasks.length === 0) {
      listContainer.appendChild(emptyState('🔍', 'Niets gevonden', 'Pas je zoekopdracht of filter aan.'));
    } else {
      const list = el('div', { class: 'task-list' });
      for (const t of tasks) list.appendChild(renderTaskCard(t));
      listContainer.appendChild(list);
    }
  };

  view.appendChild(buildControls(sectorId, renderList));
  view.appendChild(listContainer);
  renderList();

  appEl.innerHTML = '';
  appEl.appendChild(view);
  appEl.appendChild(fab('Taak', () => openTaskForm(sectorId)));
}

function buildControls(sectorId, renderList) {
  const controls = el('div', { class: 'controls' });

  // Zoekbalk
  const search = el('input', { type: 'text', class: 'search-input', placeholder: 'Zoek in taken en stappen…', value: searchQuery });
  search.addEventListener('input', () => { searchQuery = search.value; renderList(); });
  const searchWrap = el('div', { class: 'search-wrap' }, [el('span', { class: 'search-ico', text: '🔍' }), search]);
  if (searchQuery) searchWrap.appendChild(el('button', { class: 'search-clear', 'aria-label': 'Wissen', onclick: () => { searchQuery = ''; search.value = ''; renderList(); search.focus(); } }, ['✕']));
  controls.appendChild(searchWrap);

  // Statusfilter
  const seg = el('div', { class: 'filter-seg' });
  [{ key: 'alles', label: 'Alles' }, { key: 'open', label: 'Te doen' }, { key: 'bezig', label: 'Bezig' }, { key: 'klaar', label: 'Klaar' }].forEach((o) => {
    const b = el('button', { class: 'fseg-btn' + (filterStatus === o.key ? ' active' : ''), text: o.label });
    b.addEventListener('click', () => { filterStatus = o.key; seg.querySelectorAll('.fseg-btn').forEach((x) => x.classList.remove('active')); b.classList.add('active'); renderList(); });
    seg.appendChild(b);
  });
  controls.appendChild(seg);

  // Persoonsfilter (alleen tonen als er namen zijn)
  const people = peopleInSector(sectorId);
  if (filterPerson && !people.includes(filterPerson)) filterPerson = '';
  if (people.length) {
    const sel = el('select', { class: 'input person-select' });
    sel.appendChild(el('option', { value: '', text: '👤 Iedereen' }));
    people.forEach((pn) => sel.appendChild(el('option', { value: pn, text: pn, ...(pn === filterPerson ? { selected: 'selected' } : {}) })));
    sel.addEventListener('change', () => { filterPerson = sel.value; renderList(); });
    controls.appendChild(sel);
  }

  return controls;
}

function renderTaskCard(task) {
  const prog = taskProgress(task);
  const done = prog.pct === 100;
  const isOpen = expandedTask === task.id;
  const prioLabel = (PRIORITIES.find((p) => p.key === task.priority) || {}).label || task.priority;
  const statusObj = STATUSSES.find((s) => s.key === task.status) || STATUSSES[0];

  // Head (always visible, tappable to expand)
  const tags = el('div', { class: 'task-tags' }, [
    el('span', { class: `badge b-${task.status}`, text: statusObj.short }),
    el('span', { class: `badge b-${task.priority}` }, [el('span', { class: 'dot', style: `background:var(--${task.priority})` }), prioLabel])
  ]);

  const meta = el('div', { class: 'task-meta' });
  meta.appendChild(el('span', { class: 'chip-meta' }, [el('span', { text: '👤' }), task.assignee || 'Niemand']));
  if (task.deadline) {
    meta.appendChild(el('span', { class: 'chip-meta' + (isOverdue(task) ? ' overdue' : '') }, [
      el('span', { text: '📅' }), formatDeadline(task) + (isOverdue(task) ? ' · te laat' : '')
    ]));
  }

  const head = el('div', { class: 'task-head', onclick: () => toggleTask(task.id) }, [
    el('div', { class: 'task-titlerow' }, [
      el('div', { class: 'task-title' + (done ? ' done' : ''), text: task.title }),
      el('span', { class: 'task-toggle', text: '▾' })
    ]),
    tags,
    meta
  ]);
  if (prog.hasSubs) {
    head.appendChild(el('div', { class: 'task-progress' }, [
      progressBar(prog.pct),
      el('span', { class: 'pp-label', text: `${prog.done}/${prog.total}` })
    ]));
  }

  const card = el('div', {
    class: 'task-card' + (isOpen ? ' open' : ''),
    style: `--task-accent:var(--${task.priority})`
  }, [head]);

  if (isOpen) card.appendChild(renderTaskBody(task));
  return card;
}

function toggleTask(id) {
  const opening = expandedTask !== id;
  expandedTask = opening ? id : null; // accordion: andere taken klappen dicht
  justOpenedTask = opening ? id : null;
  editingStepId = null;
  addingStepFor = null;
  router();
}

function renderTaskBody(task) {
  const body = el('div', { class: 'task-body' + (justOpenedTask === task.id ? ' anim-in' : '') });
  if (justOpenedTask === task.id) justOpenedTask = null;

  // Status segmented control
  body.appendChild(el('div', { class: 'section-label', text: 'Status' }));
  const seg = el('div', { class: 'segmented' });
  STATUSSES.forEach((s) => {
    seg.appendChild(el('button', {
      class: 'seg-btn s-' + s.key + (task.status === s.key ? ' active' : ''),
      onclick: async () => { editingStepId = null; addingStepFor = null; await api('PATCH', `/api/tasks/${task.id}`, { status: s.key }); await refresh(); }
    }, [s.short]));
  });
  body.appendChild(seg);

  body.appendChild(renderSteps(task));

  body.appendChild(el('div', { class: 'task-actions' }, [
    el('button', { class: 'btn btn-ghost', onclick: () => openTaskForm(task.sectorId, task) }, ['✎ Bewerken']),
    el('button', { class: 'btn btn-danger', onclick: () => confirmDeleteTask(task) }, ['🗑 Verwijderen'])
  ]));

  return body;
}

function renderSteps(task) {
  const subs = task.subtasks || [];
  const wrap = el('div', { class: 'subtasks' });

  // Klaar: alle stappen zijn afgerond en worden verborgen.
  if (task.status === 'klaar') {
    if (subs.length) wrap.appendChild(el('div', { class: 'steps-done' }, [el('span', { text: '✓' }), `Alle ${subs.length} stappen afgerond`]));
    return wrap;
  }

  // Afvinken mag alleen als de taak "Bezig" is.
  const canCheck = task.status === 'bezig';
  const adding = addingStepFor === task.id;

  // Koptekst met een "+"-knop rechts; het invoerveld verschijnt pas na een tik.
  wrap.appendChild(el('div', { class: 'steps-head' }, [
    el('div', { class: 'section-label', text: subs.length ? `Stappen (${subs.filter(s => s.done).length}/${subs.length})` : 'Stappen' }),
    el('button', {
      class: 'steps-add-btn' + (adding ? ' active' : ''), 'aria-label': 'Stap toevoegen',
      onclick: () => { addingStepFor = adding ? null : task.id; editingStepId = null; router(); }
    }, ['+'])
  ]));
  if (task.status === 'open' && subs.length) {
    wrap.appendChild(el('div', { class: 'steps-hint', text: 'Zet de taak op "Bezig" om stappen af te vinken.' }));
  }

  for (const sub of subs) {
    const check = el('button', {
      class: 'check' + (sub.done ? ' done' : '') + (canCheck ? '' : ' disabled'),
      'aria-label': 'Stap afvinken', text: sub.done ? '✓' : ''
    });
    if (canCheck) check.addEventListener('click', async () => {
      const willBe = !sub.done;
      check.classList.add('pop');                 // popje
      check.classList.toggle('done', willBe);     // directe visuele feedback
      check.textContent = willBe ? '✓' : '';
      await new Promise((r) => setTimeout(r, 170));
      await api('PATCH', `/api/tasks/${task.id}/subtasks/${sub.id}`, { done: willBe });
      await refresh();
    });

    let titleNode;
    if (editingStepId === sub.id) {
      const inp = el('input', { type: 'text', class: 'sub-edit', value: sub.title });
      const commit = async () => {
        const v = inp.value.trim();
        editingStepId = null;
        if (v && v !== sub.title) await api('PATCH', `/api/tasks/${task.id}/subtasks/${sub.id}`, { title: v });
        await refresh();
      };
      inp.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') commit();
        else if (e.key === 'Escape') { editingStepId = null; router(); }
      });
      inp.addEventListener('blur', commit);
      setTimeout(() => { inp.focus(); inp.select(); }, 30);
      titleNode = inp;
    } else {
      titleNode = el('span', {
        class: 'sub-title' + (sub.done ? ' done' : ''), text: sub.title,
        onclick: () => { editingStepId = sub.id; router(); }
      });
    }

    const row = el('div', { class: 'subtask' + (justAddedStepId === sub.id ? ' step-in' : '') }, [
      check, titleNode,
      el('button', {
        class: 'subtask-del', 'aria-label': 'Stap verwijderen',
        onclick: async (e) => {
          editingStepId = null;
          const r = e.currentTarget.closest('.subtask');
          if (r) { r.classList.add('step-out'); await new Promise((res) => setTimeout(res, 210)); }
          await api('DELETE', `/api/tasks/${task.id}/subtasks/${sub.id}`);
          await refresh();
        }
      }, ['✕'])
    ]);
    if (justAddedStepId === sub.id) justAddedStepId = null;
    wrap.appendChild(row);
  }

  // Nieuwe stap toevoegen (mag bij "Te doen" én "Bezig"), alleen zichtbaar na de "+".
  if (adding) {
    const stepInput = el('input', { type: 'text', placeholder: 'Nieuwe stap, bijv. "Verven"' });
    const addStep = async () => {
      const v = stepInput.value.trim();
      if (!v) { addingStepFor = null; router(); return; }
      const updated = await api('POST', `/api/tasks/${task.id}/subtasks`, { title: v });
      if (updated && updated.subtasks && updated.subtasks.length) justAddedStepId = updated.subtasks[updated.subtasks.length - 1].id;
      addingStepFor = task.id; // open houden zodat je meerdere stappen achter elkaar kunt toevoegen
      await refresh();
    };
    stepInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') addStep();
      else if (e.key === 'Escape') { addingStepFor = null; router(); }
    });
    setTimeout(() => stepInput.focus(), 30);
    wrap.appendChild(el('div', { class: 'subtask-add' }, [stepInput, el('button', { class: 'btn btn-sm', onclick: addStep }, ['Toevoegen'])]));
  }

  return wrap;
}

// ---------- Formulieren ----------
function field(labelText, inputNode) {
  return el('div', { class: 'field' }, [el('label', { text: labelText }), inputNode]);
}

function chipChoice(items, current, onPick, colorClass) {
  const row = el('div', { class: 'choice-row' });
  let val = current;
  items.forEach((it) => {
    const cls = colorClass ? ` c-${it.key}` : '';
    const chip = el('button', { type: 'button', class: 'choice' + (it.key === val ? ' sel' + cls : ''), text: it.label });
    chip.addEventListener('click', () => {
      val = it.key; onPick(val);
      row.querySelectorAll('.choice').forEach((c) => c.className = 'choice');
      chip.className = 'choice sel' + cls;
    });
    row.appendChild(chip);
  });
  return row;
}

function openTaskForm(sectorId, task) {
  const isEdit = !!task;
  const t = task || { title: '', assignee: '', deadline: '', priority: 'middel', status: 'open', notes: '' };
  let priority = t.priority, status = t.status;

  const titleInput = el('input', { type: 'text', value: t.title, placeholder: 'Bijv. Achterwand' });
  const assigneeInput = el('input', { type: 'text', value: t.assignee, placeholder: 'Wie pakt dit op?' });
  const notesInput = el('textarea', { placeholder: 'Optionele toelichting' });
  notesInput.value = t.notes || '';

  // Deadline: kies een type (geen / exacte datum / week / maand) en de bijbehorende waarde.
  let dlType = t.deadline ? (t.deadlineType || 'datum') : 'geen';
  let dlValue = t.deadline || '';
  const isoLocal = (d) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  const mondayOf = (d) => { const x = new Date(d); const off = (x.getDay() + 6) % 7; x.setDate(x.getDate() - off); x.setHours(0, 0, 0, 0); return x; };
  const dlInputWrap = el('div', {});

  function buildDateInput() {
    const inp = el('input', { type: 'date', value: dlType === 'datum' ? dlValue : '' });
    inp.addEventListener('change', () => { dlValue = inp.value; });
    return inp;
  }
  function buildWeekSelect() {
    const sel = el('select', { class: 'input' });
    sel.appendChild(el('option', { value: '', text: 'Kies een week…' }));
    const start = mondayOf(new Date());
    let found = false;
    for (let i = 0; i < 16; i++) {
      const mon = new Date(start); mon.setDate(start.getDate() + i * 7);
      const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
      const val = isoLocal(mon);
      if (val === dlValue) found = true;
      sel.appendChild(el('option', {
        value: val, ...(val === dlValue ? { selected: 'selected' } : {}),
        text: 'Week van ' + mon.toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' }) + ' t/m ' + sun.toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' })
      }));
    }
    if (dlValue && !found) sel.insertBefore(el('option', { value: dlValue, selected: 'selected', text: 'Week van ' + formatDate(dlValue) }), sel.children[1]);
    sel.addEventListener('change', () => { dlValue = sel.value; });
    return sel;
  }
  function buildMonthSelect() {
    const sel = el('select', { class: 'input' });
    sel.appendChild(el('option', { value: '', text: 'Kies een maand…' }));
    const now = new Date();
    let found = false;
    for (let i = 0; i < 12; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
      const val = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
      if (val === dlValue) found = true;
      sel.appendChild(el('option', { value: val, ...(val === dlValue ? { selected: 'selected' } : {}), text: d.toLocaleDateString('nl-NL', { month: 'long', year: 'numeric' }) }));
    }
    if (dlValue && !found) { const [y, m] = dlValue.split('-').map(Number); sel.insertBefore(el('option', { value: dlValue, selected: 'selected', text: new Date(y, m - 1, 1).toLocaleDateString('nl-NL', { month: 'long', year: 'numeric' }) }), sel.children[1]); }
    sel.addEventListener('change', () => { dlValue = sel.value; });
    return sel;
  }
  function renderDlInput() {
    dlInputWrap.innerHTML = '';
    if (dlType === 'datum') dlInputWrap.appendChild(buildDateInput());
    else if (dlType === 'week') dlInputWrap.appendChild(buildWeekSelect());
    else if (dlType === 'maand') dlInputWrap.appendChild(buildMonthSelect());
  }
  const dlTypeRow = el('div', { class: 'choice-row', style: 'margin-bottom:9px' });
  [{ key: 'geen', label: 'Geen' }, { key: 'datum', label: 'Datum' }, { key: 'week', label: 'Week' }, { key: 'maand', label: 'Maand' }].forEach((it) => {
    const chip = el('button', { type: 'button', class: 'choice' + (it.key === dlType ? ' sel' : ''), text: it.label });
    chip.addEventListener('click', () => {
      dlType = it.key; dlValue = '';
      dlTypeRow.querySelectorAll('.choice').forEach((c) => c.className = 'choice');
      chip.className = 'choice sel';
      renderDlInput();
    });
    dlTypeRow.appendChild(chip);
  });
  renderDlInput();

  const body = el('div', {}, [
    field('Wat moet er gebeuren?', titleInput),
    field('Wie doet het?', assigneeInput),
    field('Deadline', el('div', {}, [dlTypeRow, dlInputWrap])),
    field('Hoe belangrijk?', chipChoice(PRIORITIES, priority, (v) => priority = v, true)),
    field('Status', chipChoice(STATUSSES.map(s => ({ key: s.key, label: s.short })), status, (v) => status = v)),
    field('Notitie', notesInput)
  ]);

  const save = async () => {
    if (!titleInput.value.trim()) { titleInput.focus(); return; }
    const deadline = dlType === 'geen' ? '' : dlValue;
    const deadlineType = dlType === 'geen' ? '' : dlType;
    const payload = { title: titleInput.value, assignee: assigneeInput.value, deadline, deadlineType, priority, status, notes: notesInput.value };
    if (isEdit) await api('PATCH', `/api/tasks/${task.id}`, payload);
    else { const nt = await api('POST', '/api/tasks', { sectorId, ...payload }); if (nt && nt.id) expandedTask = nt.id; }
    closeSheet(); await refresh();
  };

  openSheet(isEdit ? 'Taak bewerken' : 'Nieuwe taak', body, [
    el('button', { class: 'btn btn-ghost', onclick: closeSheet }, ['Annuleren']),
    el('button', { class: 'btn btn-primary', onclick: save }, [isEdit ? 'Opslaan' : 'Toevoegen'])
  ]);
  setTimeout(() => titleInput.focus(), 100);
}

function confirmDeleteTask(task) {
  const body = el('div', {}, [
    el('p', { class: 'confirm-text' }, [el('b', { text: task.title }), ' wordt verwijderd. Dit kan niet ongedaan worden gemaakt.'])
  ]);
  openSheet('Taak verwijderen?', body, [
    el('button', { class: 'btn btn-ghost', onclick: closeSheet }, ['Nee, behouden']),
    el('button', { class: 'btn btn-danger', onclick: async () => { await api('DELETE', `/api/tasks/${task.id}`); if (expandedTask === task.id) expandedTask = null; closeSheet(); await refresh(); } }, ['Ja, verwijderen'])
  ]);
}

function openSectorForm(sector) {
  const isEdit = !!sector;
  const s = sector || { name: '', icon: '📋', color: COLORS[0] };
  let icon = s.icon, color = s.color;

  const nameInput = el('input', { type: 'text', value: s.name, placeholder: 'Bijv. Grime' });

  const emojiGrid = el('div', { class: 'emoji-grid' });
  EMOJIS.forEach((e) => {
    const c = el('button', { type: 'button', class: 'choice' + (e === icon ? ' sel' : ''), text: e });
    c.addEventListener('click', () => { icon = e; emojiGrid.querySelectorAll('.choice').forEach(x => x.className = 'choice'); c.className = 'choice sel'; });
    emojiGrid.appendChild(c);
  });

  const colorRow = el('div', { class: 'color-row' });
  COLORS.forEach((col) => {
    const d = el('button', { type: 'button', class: 'color-dot' + (col === color ? ' sel' : ''), style: `background:${col}` });
    d.addEventListener('click', () => { color = col; colorRow.querySelectorAll('.color-dot').forEach(x => x.classList.remove('sel')); d.classList.add('sel'); });
    colorRow.appendChild(d);
  });

  const body = el('div', {}, [field('Naam', nameInput), field('Kies een icoon', emojiGrid), field('Kies een kleur', colorRow)]);

  const save = async () => {
    if (!nameInput.value.trim()) { nameInput.focus(); return; }
    const payload = { name: nameInput.value, icon, color };
    if (isEdit) await api('PATCH', `/api/sectors/${sector.id}`, payload);
    else await api('POST', '/api/sectors', payload);
    closeSheet(); await refresh();
  };

  const foot = [
    isEdit ? el('button', { class: 'btn btn-danger', onclick: () => confirmDeleteSector(sector) }, ['🗑']) : null,
    el('button', { class: 'btn btn-ghost', onclick: closeSheet }, ['Annuleren']),
    el('button', { class: 'btn btn-primary', onclick: save }, [isEdit ? 'Opslaan' : 'Toevoegen'])
  ];

  openSheet(isEdit ? 'Draaiboek bewerken' : 'Nieuw draaiboek', body, foot);
  setTimeout(() => nameInput.focus(), 100);
}

function confirmDeleteSector(sector) {
  const count = tasksForSector(sector.id).length;
  const body = el('div', {}, [
    el('p', { class: 'confirm-text' }, [
      el('b', { text: sector.name }), ` wordt verwijderd${count ? `, samen met alle ${count} taken erin` : ''}. Dit kan niet ongedaan worden gemaakt.`
    ])
  ]);
  openSheet('Draaiboek verwijderen?', body, [
    el('button', { class: 'btn btn-ghost', onclick: closeSheet }, ['Nee, behouden']),
    el('button', { class: 'btn btn-danger', onclick: async () => { await api('DELETE', `/api/sectors/${sector.id}`); closeSheet(); location.hash = '#/'; await refresh(); } }, ['Ja, verwijderen'])
  ]);
}

// ---------- Util ----------
function emptyState(emoji, title, sub) {
  return el('div', { class: 'empty' }, [
    el('div', { class: 'empty-emoji', text: emoji }),
    el('h3', { text: title }),
    el('p', { text: sub })
  ]);
}

async function refresh() { await loadState(); router(); }

// ---------- Start ----------
(async function init() {
  try { await loadState(); }
  catch (err) {
    appEl.innerHTML = '';
    appEl.appendChild(emptyState('⚠️', 'Kon de gegevens niet laden', err.message));
    return;
  }
  router();
})();
