import { useCallback, useEffect, useState } from "react";

const API = (import.meta.env.VITE_API_BASE_URL || "/api").replace(/\/$/, "");

async function api(path, options = {}) {
  const response = await fetch(`${API}${path}`, {
    ...options,
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...options.headers
    }
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error || `Request failed (${response.status})`);
  }
  return payload;
}

export default function App() {
  const [tasks, setTasks] = useState([]);
  const [dashboard, setDashboard] = useState(null);
  const [online, setOnline] = useState(false);
  const [error, setError] = useState("");
  const [title, setTitle] = useState("");
  const [owner, setOwner] = useState("");

  const refresh = useCallback(async () => {
    try {
      const [health, summary, taskResult] = await Promise.all([
        api("/health"),
        api("/dashboard"),
        api("/tasks")
      ]);
      setOnline(health.status === "ok");
      setDashboard(summary);
      setTasks(taskResult.tasks || []);
      setError("");
    } catch (err) {
      setOnline(false);
      setError(err.message);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function addTask(event) {
    event.preventDefault();
    if (!title.trim()) return;
    try {
      await api("/tasks", {
        method: "POST",
        body: JSON.stringify({ title: title.trim(), owner: owner.trim() || "Unassigned" })
      });
      setTitle("");
      setOwner("");
      await refresh();
    } catch (err) {
      setError(err.message);
    }
  }

  async function updateStatus(task) {
    const nextStatus = task.status === "Open" ? "In Progress" : "Completed";
    try {
      await api(`/tasks/${task.id}`, {
        method: "PATCH",
        body: JSON.stringify({ status: nextStatus })
      });
      await refresh();
    } catch (err) {
      setError(err.message);
    }
  }

  async function removeTask(id) {
    try {
      await api(`/tasks/${id}`, { method: "DELETE" });
      await refresh();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <main className="shell">
      <header className="topbar">
        <div>
          <div className="eyebrow">FULL-STACK DEPLOYMENT PRACTICE</div>
          <h1>TaskBoard</h1>
          <p className="subtitle">A small application running across S3, CloudFront and Ubuntu.</p>
        </div>
        <div className={`connection ${online ? "online" : "offline"}`}>
          <span className="dot" />
          API {online ? "Online" : "Offline"}
        </div>
      </header>

      {error && <div className="error" role="alert">{error}</div>}

      <section className="stats">
        <article className="stat-card"><span>Total tasks</span><strong>{dashboard?.total ?? "—"}</strong></article>
        <article className="stat-card"><span>Open</span><strong>{dashboard?.open ?? "—"}</strong></article>
        <article className="stat-card"><span>In progress</span><strong>{dashboard?.inProgress ?? "—"}</strong></article>
        <article className="stat-card"><span>Completed</span><strong>{dashboard?.completed ?? "—"}</strong></article>
      </section>

      <section className="panel">
        <div className="panel-heading">
          <div><div className="eyebrow">WORK QUEUE</div><h2>Create a task</h2></div>
        </div>
        <form className="task-form" onSubmit={addTask}>
          <label>
            Task title
            <input value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Verify CloudFront API routing" required />
          </label>
          <label>
            Owner
            <input value={owner} onChange={e => setOwner(e.target.value)} placeholder="e.g. DevOps team" />
          </label>
          <button type="submit">Add task</button>
        </form>
      </section>

      <section className="panel">
        <div className="panel-heading">
          <div><div className="eyebrow">LIVE API DATA</div><h2>Tasks</h2></div>
          <button className="secondary" onClick={refresh} type="button">Refresh</button>
        </div>
        {tasks.length === 0 ? (
          <div className="empty">{online ? "No tasks yet. Create your first task above." : "Waiting for the API connection…"}</div>
        ) : (
          <div className="task-list">
            {tasks.map(task => (
              <article className="task-row" key={task.id}>
                <div className="task-main">
                  <strong>{task.title}</strong>
                  <span>{task.id} · {task.owner}</span>
                </div>
                <span className={`status status-${task.status.toLowerCase().replaceAll(" ", "-")}`}>{task.status}</span>
                <div className="actions">
                  <button className="secondary" type="button" onClick={() => updateStatus(task)}>
                    {task.status === "Open" ? "Start" : task.status === "In Progress" ? "Complete" : "Reopen"}
                  </button>
                  <button className="danger" type="button" onClick={() => removeTask(task.id)}>Delete</button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
      <footer>Frontend: S3 + CloudFront <span>·</span> Backend: Ubuntu + Express + PM2</footer>
    </main>
  );
}
