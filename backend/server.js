const express = require("express");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = Number(process.env.PORT || 3005);
const HOST = process.env.HOST || "127.0.0.1";
const DATA_DIR = path.join(__dirname, "data");
const DATA_FILE = path.join(DATA_DIR, "tasks.json");

app.use(express.json());

function readTasks() {
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
}

function writeTasks(tasks) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const tempFile = `${DATA_FILE}.tmp`;
  fs.writeFileSync(tempFile, JSON.stringify(tasks, null, 2));
  fs.renameSync(tempFile, DATA_FILE);
}

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", service: "taskboard-api", timestamp: new Date().toISOString() });
});

app.get("/api/dashboard", (_req, res) => {
  const tasks = readTasks();
  res.json({
    total: tasks.length,
    open: tasks.filter(task => task.status === "Open").length,
    inProgress: tasks.filter(task => task.status === "In Progress").length,
    completed: tasks.filter(task => task.status === "Completed").length
  });
});

app.get("/api/tasks", (_req, res) => {
  res.json({ tasks: readTasks() });
});

app.post("/api/tasks", (req, res) => {
  const title = String(req.body?.title || "").trim();
  const owner = String(req.body?.owner || "Unassigned").trim() || "Unassigned";
  if (!title) return res.status(400).json({ error: "Task title is required" });

  const tasks = readTasks();
  const task = {
    id: `TASK-${Date.now().toString().slice(-7)}`,
    title,
    owner,
    status: "Open",
    createdAt: new Date().toISOString()
  };
  tasks.unshift(task);
  writeTasks(tasks);
  res.status(201).json({ task });
});

app.patch("/api/tasks/:id", (req, res) => {
  const allowed = ["Open", "In Progress", "Completed"];
  const status = String(req.body?.status || "");
  if (!allowed.includes(status)) {
    return res.status(400).json({ error: "Status must be Open, In Progress, or Completed" });
  }

  const tasks = readTasks();
  const task = tasks.find(item => item.id === req.params.id);
  if (!task) return res.status(404).json({ error: "Task not found" });
  task.status = status;
  task.updatedAt = new Date().toISOString();
  writeTasks(tasks);
  res.json({ task });
});

app.delete("/api/tasks/:id", (req, res) => {
  const tasks = readTasks();
  const remaining = tasks.filter(item => item.id !== req.params.id);
  if (remaining.length === tasks.length) {
    return res.status(404).json({ error: "Task not found" });
  }
  writeTasks(remaining);
  res.json({ deleted: true, id: req.params.id });
});

app.listen(PORT, HOST, () => {
  console.log(`TaskBoard API listening on http://${HOST}:${PORT}`);
});
