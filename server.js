'use strict';

const path = require('path');
const express = require('express');
const store = require('./store');

const PORT = process.env.PORT || 3000;

store.load();

const app = express();
app.use(express.json());

// ---- API ----

// Volledige staat (sectoren + taken). De dataset is klein, dus dit in één keer.
app.get('/api/state', (req, res) => {
  res.json({ sectors: store.listSectors(), tasks: store.getState().tasks });
});

// Sectoren
app.post('/api/sectors', (req, res) => {
  res.status(201).json(store.addSector(req.body || {}));
});

app.patch('/api/sectors/:id', (req, res) => {
  const sector = store.updateSector(req.params.id, req.body || {});
  if (!sector) return res.status(404).json({ error: 'Sector niet gevonden' });
  res.json(sector);
});

app.delete('/api/sectors/:id', (req, res) => {
  const ok = store.deleteSector(req.params.id);
  if (!ok) return res.status(404).json({ error: 'Sector niet gevonden' });
  res.status(204).end();
});

// Taken
app.post('/api/tasks', (req, res) => {
  const task = store.addTask(req.body || {});
  if (!task) return res.status(400).json({ error: 'Onbekende sector' });
  res.status(201).json(task);
});

app.patch('/api/tasks/:id', (req, res) => {
  const task = store.updateTask(req.params.id, req.body || {});
  if (!task) return res.status(404).json({ error: 'Taak niet gevonden' });
  res.json(task);
});

app.delete('/api/tasks/:id', (req, res) => {
  const ok = store.deleteTask(req.params.id);
  if (!ok) return res.status(404).json({ error: 'Taak niet gevonden' });
  res.status(204).end();
});

// Subtaken
app.post('/api/tasks/:id/subtasks', (req, res) => {
  const task = store.addSubtask(req.params.id, (req.body || {}).title);
  if (!task) return res.status(404).json({ error: 'Taak niet gevonden' });
  res.status(201).json(task);
});

app.patch('/api/tasks/:id/subtasks/:subId', (req, res) => {
  const task = store.updateSubtask(req.params.id, req.params.subId, req.body || {});
  if (!task) return res.status(404).json({ error: 'Subtaak niet gevonden' });
  res.json(task);
});

app.delete('/api/tasks/:id/subtasks/:subId', (req, res) => {
  const task = store.deleteSubtask(req.params.id, req.params.subId);
  if (!task) return res.status(404).json({ error: 'Subtaak niet gevonden' });
  res.json(task);
});

// ---- Frontend ----
app.use(express.static(path.join(__dirname, 'public')));

app.listen(PORT, () => {
  console.log(`TGM Draaiboek draait op http://localhost:${PORT}`);
});
