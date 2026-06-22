'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'draaiboek.json');

const PRIORITIES = ['laag', 'middel', 'hoog'];
const STATUSSES = ['open', 'bezig', 'klaar'];

let state = { sectors: [], tasks: [] };

function id() {
  return crypto.randomUUID();
}

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function seed() {
  const sectorId = id();
  state = {
    sectors: [
      { id: sectorId, name: 'Decorcommissie', color: '#7c5cff', icon: '🎨', position: 0 }
    ],
    tasks: [
      {
        id: id(),
        sectorId,
        title: 'Achterwand',
        assignee: 'Nog niemand',
        deadline: '',
        priority: 'hoog',
        status: 'bezig',
        notes: 'Grote achterwand voor het tweede bedrijf.',
        position: 0,
        subtasks: [
          { id: id(), title: 'Maken', done: true },
          { id: id(), title: 'Verven', done: false },
          { id: id(), title: 'Behangen', done: false }
        ]
      }
    ]
  };
}

function load() {
  ensureDir();
  if (fs.existsSync(DATA_FILE)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
      state = {
        sectors: Array.isArray(parsed.sectors) ? parsed.sectors : [],
        tasks: Array.isArray(parsed.tasks) ? parsed.tasks : []
      };
    } catch (err) {
      console.error('Kon databestand niet lezen, ik start met een lege lijst:', err.message);
      state = { sectors: [], tasks: [] };
    }
  } else {
    seed();
    save();
  }
}

function save() {
  ensureDir();
  const tmp = DATA_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2));
  fs.renameSync(tmp, DATA_FILE); // atomair: geen halve schrijfacties
}

function getState() {
  return state;
}

// ---- Sectoren ----

function listSectors() {
  return [...state.sectors].sort((a, b) => a.position - b.position);
}

function addSector({ name, color, icon }) {
  const sector = {
    id: id(),
    name: String(name || '').trim() || 'Naamloze sector',
    color: color || '#7c5cff',
    icon: icon || '📋',
    position: state.sectors.length
  };
  state.sectors.push(sector);
  save();
  return sector;
}

function updateSector(sectorId, patch) {
  const sector = state.sectors.find((s) => s.id === sectorId);
  if (!sector) return null;
  if (patch.name !== undefined) sector.name = String(patch.name).trim() || sector.name;
  if (patch.color !== undefined) sector.color = patch.color;
  if (patch.icon !== undefined) sector.icon = patch.icon;
  save();
  return sector;
}

function deleteSector(sectorId) {
  const before = state.sectors.length;
  state.sectors = state.sectors.filter((s) => s.id !== sectorId);
  state.tasks = state.tasks.filter((t) => t.sectorId !== sectorId);
  if (state.sectors.length !== before) {
    save();
    return true;
  }
  return false;
}

// ---- Taken ----

function listTasks(sectorId) {
  return state.tasks
    .filter((t) => t.sectorId === sectorId)
    .sort((a, b) => a.position - b.position);
}

function cleanPriority(p) {
  return PRIORITIES.includes(p) ? p : 'middel';
}

function cleanStatus(s) {
  return STATUSSES.includes(s) ? s : 'open';
}

function addTask(data) {
  const sector = state.sectors.find((s) => s.id === data.sectorId);
  if (!sector) return null;
  const task = {
    id: id(),
    sectorId: data.sectorId,
    title: String(data.title || '').trim() || 'Naamloze taak',
    assignee: String(data.assignee || '').trim(),
    deadline: data.deadline || '',
    priority: cleanPriority(data.priority),
    status: cleanStatus(data.status),
    notes: String(data.notes || ''),
    position: listTasks(data.sectorId).length,
    subtasks: []
  };
  state.tasks.push(task);
  save();
  return task;
}

function updateTask(taskId, patch) {
  const task = state.tasks.find((t) => t.id === taskId);
  if (!task) return null;
  if (patch.title !== undefined) task.title = String(patch.title).trim() || task.title;
  if (patch.assignee !== undefined) task.assignee = String(patch.assignee).trim();
  if (patch.deadline !== undefined) task.deadline = patch.deadline || '';
  if (patch.priority !== undefined) task.priority = cleanPriority(patch.priority);
  if (patch.status !== undefined) task.status = cleanStatus(patch.status);
  if (patch.notes !== undefined) task.notes = String(patch.notes);
  save();
  return task;
}

function deleteTask(taskId) {
  const before = state.tasks.length;
  state.tasks = state.tasks.filter((t) => t.id !== taskId);
  if (state.tasks.length !== before) {
    save();
    return true;
  }
  return false;
}

// ---- Subtaken ----

function addSubtask(taskId, title) {
  const task = state.tasks.find((t) => t.id === taskId);
  if (!task) return null;
  const sub = { id: id(), title: String(title || '').trim() || 'Naamloze stap', done: false };
  task.subtasks.push(sub);
  save();
  return task;
}

function updateSubtask(taskId, subId, patch) {
  const task = state.tasks.find((t) => t.id === taskId);
  if (!task) return null;
  const sub = task.subtasks.find((s) => s.id === subId);
  if (!sub) return null;
  if (patch.title !== undefined) sub.title = String(patch.title).trim() || sub.title;
  if (patch.done !== undefined) sub.done = !!patch.done;
  save();
  return task;
}

function deleteSubtask(taskId, subId) {
  const task = state.tasks.find((t) => t.id === taskId);
  if (!task) return null;
  task.subtasks = task.subtasks.filter((s) => s.id !== subId);
  save();
  return task;
}

module.exports = {
  PRIORITIES,
  STATUSSES,
  load,
  getState,
  listSectors,
  addSector,
  updateSector,
  deleteSector,
  listTasks,
  addTask,
  updateTask,
  deleteTask,
  addSubtask,
  updateSubtask,
  deleteSubtask
};
