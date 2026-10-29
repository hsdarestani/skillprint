import { newSession, appendAction, deriveState, evaluate, SCENARIO } from "../src/engine.js";

// Cloudflare Worker + SQLite Durable Object; capability links, DEMO DATA ONLY.
const headers = { "access-control-allow-origin": "*", "access-control-allow-methods": "GET, POST, OPTIONS", "access-control-allow-headers": "content-type", "cache-control": "no-store", "referrer-policy": "no-referrer" };
const json = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { ...headers, "content-type": "application/json; charset=utf-8" } });
const error = (message, code = 400) => json({ error: message }, code);
const randomToken = () => [...crypto.getRandomValues(new Uint8Array(24))].map(n => n.toString(16).padStart(2, "0")).join("");
const idOK = value => /^[a-z0-9-]{6,48}$/.test(value);

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });
    const url = new URL(request.url);
    if (url.pathname === "/api/health") return json({ ok: true, name: "SKILLPRINT LIVE API", mode: "demo" });
    if (url.pathname === "/api/sessions" && request.method === "POST") {
      const id = "sl-" + crypto.randomUUID().slice(0, 8);
      const tokens = { coachToken: randomToken(), candidateToken: randomToken() };
      const room = env.ROOMS.get(env.ROOMS.idFromName(id));
      const response = await room.fetch("https://room/init", { method: "POST", body: JSON.stringify({ id, ...tokens }) });
      if (!response.ok) return error("Could not create assessment", 500);
      return json({ id, ...tokens, scenario: SCENARIO.id }, 201);
    }
    const match = url.pathname.match(/^\/api\/sessions\/([a-z0-9-]+)\/(snapshot|action|finalize|stream)$/);
    if (!match || !idOK(match[1])) return error("NOT_FOUND", 404);
    const [, id, method] = match;
    const token = url.searchParams.get("token") || request.headers.get("x-assessment-token");
    if (!token || !/^[a-f0-9]{48}$/.test(token)) return error("UNAUTHORIZED", 401);
    const expectedMethod = { snapshot: "GET", action: "POST", finalize: "POST", stream: "GET" }[method];
    if (request.method !== expectedMethod) return error("METHOD_NOT_ALLOWED", 405);
    const qs = new URLSearchParams({ token }).toString();
    const target = "https://room/" + method + "?" + qs;
    const room = env.ROOMS.get(env.ROOMS.idFromName(id));
    const proxied = await room.fetch(new Request(target, request));
    if (method === "stream" || proxied.status === 101) return proxied;
    const extra = new Headers(proxied.headers);
    Object.entries(headers).forEach(([k, v]) => extra.set(k, v));
    return new Response(proxied.body, { status: proxied.status, headers: extra });
  }
};

export class AssessmentRoom {
  constructor(ctx) { this.ctx = ctx; this.clients = new Map(); }
  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === "/init" && request.method === "POST") {
      if (await this.ctx.storage.get("session")) return error("ALREADY_INITIALIZED", 409);
      const data = await request.json();
      if (!idOK(data.id) || !/^[a-f0-9]{48}$/.test(data.coachToken) || !/^[a-f0-9]{48}$/.test(data.candidateToken)) return error("INVALID_INIT");
      await this.ctx.storage.put("session", { ...newSession(data.id), coachToken: data.coachToken, candidateToken: data.candidateToken });
      return json({ ok: true });
    }
    let session = await this.ctx.storage.get("session");
    if (!session) return error("NOT_FOUND", 404);
    const token = url.searchParams.get("token");
    const role = token === session.coachToken ? "coach" : token === session.candidateToken ? "candidate" : null;
    if (!role) return error("UNAUTHORIZED", 401);
    if (url.pathname === "/snapshot" && request.method === "GET") return json(this.snapshot(session, role));
    if (url.pathname === "/stream" && request.headers.get("Upgrade")?.toLowerCase() === "websocket") {
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);
      server.accept();
      this.clients.set(server, role);
      server.send(JSON.stringify({ type: "snapshot", data: this.snapshot(session, role) }));
      server.addEventListener("close", () => this.clients.delete(server));
      server.addEventListener("error", () => this.clients.delete(server));
      return new Response(null, { status: 101, webSocket: client });
    }
    if (url.pathname === "/action" && request.method === "POST") {
      let action;
      try { action = await request.json(); } catch { return error("INVALID_JSON"); }
      try { session = appendAction(session, action, role); } catch (e) { return error(e.message); }
      await this.ctx.storage.put("session", session);
      this.broadcast(session);
      return json(this.snapshot(session, role));
    }
    if (url.pathname === "/finalize" && request.method === "POST") {
      if (role !== "coach") return error("FORBIDDEN", 403);
      if (session.status !== "completed") return error("ASSESSMENT_NOT_COMPLETED", 409);
      if (session.reviewStatus === "approved") return json(this.snapshot(session, role));
      const event = { id: crypto.randomUUID(), sequence: session.events.length + 1, at: new Date().toISOString(), actor: "observer", type: "human_review", payload: { decision: "rubric_reviewed" } };
      session = { ...session, reviewStatus: "approved", events: [...session.events, event] };
      await this.ctx.storage.put("session", session);
      this.broadcast(session);
      return json(this.snapshot(session, role));
    }
    return error("NOT_FOUND", 404);
  }
  snapshot(session, role) {
    const visibleEvents = role === "coach" ? session.events : session.events.filter(e => e.actor === "candidate");
    const base = { id: session.id, scenarioId: session.scenarioId, rubricVersion: session.rubricVersion, status: session.status, reviewStatus: session.reviewStatus, events: visibleEvents, state: deriveState(visibleEvents), role };
    return role === "coach" ? { ...base, report: evaluate(session.events) } : base;
  }
  broadcast(session) {
    for (const [socket, role] of this.clients) {
      try { socket.send(JSON.stringify({ type: "snapshot", data: this.snapshot(session, role) })); }
      catch { this.clients.delete(socket); try { socket.close(); } catch {} }
    }
  }
}
