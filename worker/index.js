import { newSession, appendAction, deriveState, evaluate, SCENARIO } from "../src/engine.js";
import { generateGuestReply, normalizeLocale } from "../src/guest.js";
import { serviceReply } from "../src/service-dialogue.js";

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
    const clientKey = request.headers.get("cf-connecting-ip") || "unknown-test-client";
    if (url.pathname === "/api/sessions" && request.method === "POST") {
      if (env.RATE_CREATE) {
        const {success} = await env.RATE_CREATE.limit({key:clientKey});
        if (!success) return error("SESSION_RATE_LIMIT",429);
      }
      let options={};
      try { options=await request.json(); } catch { /* legacy create requests can have no body */ }
      const mode=options?.mode==="multitask"?"multitask":"classic";
      const id = "sl-" + crypto.randomUUID().slice(0, 8);
      const tokens = { coachToken: randomToken(), candidateToken: randomToken() };
      const room = env.ROOMS.get(env.ROOMS.idFromName(id));
      const response = await room.fetch("https://room/init", { method: "POST", body: JSON.stringify({ id, mode, ...tokens }) });
      if (!response.ok) return error("Could not create assessment", 500);
      return json({ id, mode, ...tokens, scenario: SCENARIO.id }, 201);
    }
    const match = url.pathname.match(/^\/api\/sessions\/([a-z0-9-]+)\/(snapshot|action|chat|service-chat|finalize|stream)$/);
    if (!match || !idOK(match[1])) return error("NOT_FOUND", 404);
    const [, id, method] = match;
    const token = url.searchParams.get("token") || request.headers.get("x-assessment-token");
    if (!token || !/^[a-f0-9]{48}$/.test(token)) return error("UNAUTHORIZED", 401);
    const expectedMethod = { snapshot: "GET", action: "POST", chat: "POST", "service-chat": "POST", finalize: "POST", stream: "GET" }[method];
    if (request.method !== expectedMethod) return error("METHOD_NOT_ALLOWED", 405);
    if (["chat","service-chat"].includes(method) && env.RATE_CHAT) {
      const {success} = await env.RATE_CHAT.limit({key:clientKey});
      if (!success) return error("CHAT_RATE_LIMIT",429);
    }
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
  constructor(ctx, env) { this.ctx = ctx; this.env = env; this.clients = new Map(); }
  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === "/init" && request.method === "POST") {
      if (await this.ctx.storage.get("session")) return error("ALREADY_INITIALIZED", 409);
      const data = await request.json();
      if (!idOK(data.id) || !/^[a-f0-9]{48}$/.test(data.coachToken) || !/^[a-f0-9]{48}$/.test(data.candidateToken)) return error("INVALID_INIT");
      await this.ctx.storage.put("session", { ...newSession(data.id, new Date().toISOString(), data.mode), coachToken: data.coachToken, candidateToken: data.candidateToken });
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
      if (["candidate_message","guest_message","service_message","service_reply"].includes(action?.type)) return error("USE_CHAT_ENDPOINT", 403);
      try { session = appendAction(session, action, role); } catch (e) { return error(e.message); }
      await this.ctx.storage.put("session", session);
      this.broadcast(session);
      return json(this.snapshot(session, role));
    }
    if (url.pathname === "/chat" && request.method === "POST") {
      if (role !== "candidate") return error("FORBIDDEN", 403);
      let body;
      try { body = await request.json(); } catch { return error("INVALID_JSON"); }
      const text = typeof body?.text === "string" ? body.text.trim() : "";
      const id = typeof body?.id === "string" && /^[a-zA-Z0-9_-]{8,80}$/.test(body.id) ? body.id : "";
      if (!id || text.length < 3 || text.length > 500) return error("INVALID_CHAT_INPUT");
      const locale = normalizeLocale(body?.locale);
      const existing = session.events.find(e => e.id === id);
      if (existing) return existing.actor === "candidate" && existing.type === "candidate_message"
        ? json(this.snapshot(session, role)) : error("ID_CONFLICT", 409);
      try { session = appendAction(session,{ id,type:"candidate_message",text,locale }, "candidate"); }
      catch (e) { return error(e.message, e.message === "GUEST_REPLY_PENDING" ? 409 : 400); }
      await this.ctx.storage.put("session",session);
      this.broadcast(session);
      const generated = await generateGuestReply({ events:session.events, locale, message:text, ai:this.env.AI });
      // Another event may have been recorded during the model call. Reload before appending.
      session = await this.ctx.storage.get("session");
      if (!session.events.some(e => e.id === "guest_"+id)) {
        session = appendAction(session,{ id:"guest_"+id, type:"guest_message", text:generated.text,locale,source:generated.source },"guest");
        await this.ctx.storage.put("session",session);
        this.broadcast(session);
      }
      return json(this.snapshot(session, role));
    }
    if (url.pathname === "/service-chat" && request.method === "POST") {
      if (role !== "candidate") return error("FORBIDDEN",403);
      let body;
      try { body = await request.json(); } catch { return error("INVALID_JSON"); }
      const channel = body?.channel;
      const text = typeof body?.text === "string" ? body.text.trim() : "";
      const id = typeof body?.id === "string" && /^[a-zA-Z0-9_-]{8,80}$/.test(body.id) ? body.id : "";
      if (!id || !["arrival","phone"].includes(channel) || text.length<3 || text.length>500)
        return error("INVALID_SERVICE_INPUT");
      const locale=normalizeLocale(body.locale);
      const existing=session.events.find(e=>e.id===id);
      if (existing) return existing.actor==="candidate" && existing.type==="service_message" && existing.payload.channel===channel
        ? json(this.snapshot(session,role)) : error("ID_CONFLICT",409);
      try {
        session=appendAction(session,{id,type:"service_message",text,channel,locale},"candidate");
      } catch(e) {return error(e.message,["SERVICE_REPLY_PENDING","CHAT_LIMIT_REACHED"].includes(e.message)?409:400);}
      await this.ctx.storage.put("session",session);
      this.broadcast(session);
      const answer=await serviceReply({events:session.events,channel,locale,message:text,ai:this.env.AI});
      session=await this.ctx.storage.get("session");
      if (!session.events.some(e=>e.id==="service_"+id)) {
        session=appendAction(session,{
          id:"service_"+id,type:"service_reply",text:answer.text,channel,locale,source:answer.source,
        },"service");
        await this.ctx.storage.put("session",session);
        this.broadcast(session);
      }
      return json(this.snapshot(session,role));
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
    const visibleEvents = role === "coach" ? session.events : session.events.filter(e => e.actor === "candidate" || e.actor === "guest" || e.actor === "system" || e.actor === "service");
    const base = { id: session.id, scenarioId: session.scenarioId, rubricVersion: session.rubricVersion, mode:session.mode||"classic", status: session.status, reviewStatus: session.reviewStatus, events: visibleEvents, state: deriveState(visibleEvents), role };
    return role === "coach" ? { ...base, report: evaluate(session.events,session.mode) } : base;
  }
  broadcast(session) {
    for (const [socket, role] of this.clients) {
      try { socket.send(JSON.stringify({ type: "snapshot", data: this.snapshot(session, role) })); }
      catch { this.clients.delete(socket); try { socket.close(); } catch {} }
    }
  }
}
