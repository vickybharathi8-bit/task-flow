
const ALLOWED_ORIGIN = "https://task-flow.vickybharathi8.workers.dev";

const headers = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Vary": "Origin"
};

function response(data, status = 200, origin = "") {
  const resultHeaders = { ...headers };

  if (origin === ALLOWED_ORIGIN) {
    resultHeaders["Access-Control-Allow-Origin"] = origin;
  }

  return new Response(JSON.stringify(data), {
    status,
    headers: resultHeaders
  });
}

function mapTask(row) {
  return {
    id: row.id,
    title: row.title,
    owner: row.owner,
    status: row.status,
    createdAt: row.created_at,
    ...(row.updated_at ? { updatedAt: row.updated_at } : {})
  };
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;
    const origin = request.headers.get("Origin") || "";

    if (method === "OPTIONS") {
      if (origin && origin !== ALLOWED_ORIGIN) {
        return new Response(null, { status: 403 });
      }

      const preflightHeaders = {
        ...headers,
        "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
        "Access-Control-Max-Age": "86400"
      };

      return new Response(null, {
        status: 204,
        headers: preflightHeaders
      });
    }

    try {
      if (method === "GET" && path === "/api/health") {
        return response({
          status: "ok",
          service: "task-flow-api-cloudflare",
          timestamp: new Date().toISOString()
        }, 200, origin);
      }

      if (method === "GET" && path === "/api/dashboard") {
        const result = await env.DB.prepare(`
          SELECT
            COUNT(*) AS total,
            COALESCE(SUM(status = 'Open'), 0) AS open,
            COALESCE(SUM(status = 'In Progress'), 0) AS inProgress,
            COALESCE(SUM(status = 'Completed'), 0) AS completed
          FROM tasks
        `).first();

        return response(result, 200, origin);
      }

      if (method === "GET" && path === "/api/tasks") {
        const result = await env.DB.prepare(
          "SELECT * FROM tasks ORDER BY rowid DESC"
        ).all();

        return response({
          tasks: (result.results || []).map(mapTask)
        }, 200, origin);
      }

      if (method === "POST" && path === "/api/tasks") {
        const body = await request.json();
        const title = String(body?.title || "").trim();
        const owner = String(body?.owner || "Unassigned").trim() || "Unassigned";

        if (!title) {
          return response({ error: "Task title is required" }, 400, origin);
        }

        const id = `TASK-${crypto.randomUUID()}`;
        const createdAt = new Date().toISOString();

        await env.DB.prepare(`
          INSERT INTO tasks (id, title, owner, status, created_at)
          VALUES (?, ?, ?, 'Open', ?)
        `).bind(id, title, owner, createdAt).run();

        return response({
          task: {
            id,
            title,
            owner,
            status: "Open",
            createdAt
          }
        }, 201, origin);
      }

      const taskMatch = path.match(/^\/api\/tasks\/([^/]+)$/);

      if (taskMatch) {
        const id = decodeURIComponent(taskMatch[1]);

        if (method === "PATCH") {
          const body = await request.json();
          const status = String(body?.status || "");
          const allowed = ["Open", "In Progress", "Completed"];

          if (!allowed.includes(status)) {
            return response({
              error: "Status must be Open, In Progress, or Completed"
            }, 400, origin);
          }

          const existing = await env.DB.prepare(
            "SELECT * FROM tasks WHERE id = ?"
          ).bind(id).first();

          if (!existing) {
            return response({ error: "Task not found" }, 404, origin);
          }

          const updatedAt = new Date().toISOString();

          await env.DB.prepare(
            "UPDATE tasks SET status = ?, updated_at = ? WHERE id = ?"
          ).bind(status, updatedAt, id).run();

          return response({
            task: mapTask({
              ...existing,
              status,
              updated_at: updatedAt
            })
          }, 200, origin);
        }

        if (method === "DELETE") {
          const result = await env.DB.prepare(
            "DELETE FROM tasks WHERE id = ?"
          ).bind(id).run();

          if (!result.meta?.changes) {
            return response({ error: "Task not found" }, 404, origin);
          }

          return response({ deleted: true, id }, 200, origin);
        }
      }

      return response({ error: "Route not found" }, 404, origin);

    } catch (error) {
      console.error("Task Flow API error:", error);
      return response({ error: "Internal server error" }, 500, origin);
    }
  }
};
