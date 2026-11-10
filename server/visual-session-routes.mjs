/**
 * Enfoque OS 0.2.41: on-demand visual support via the EXISTING outbound
 * Enfoque remote agent. Only TI admin + an approved Zero Touch machine.
 *
 * No always-on recording: each frame is an independent, requested JPEG.
 * Sessions are short lived, exclusive per PC, audit input actions only, and
 * die with the Intranet API process. Reuse the loopback PC control bridge,
 * never grant root to the desktop agent or expose a port on the PC.
 */
import { randomBytes } from "node:crypto";
import fs from "node:fs/promises";

const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const DEVICE = /^enfoqueos-([a-f0-9-]{36})$/;
const TOKEN = /^[a-f0-9]{48}$/;
const PC_CONTROL_URL = "http://127.0.0.1:3211/internal/pc-control";
const IDLE_EXPIRE_MS = 60_000;
const MAX_AGE_MS = 2 * 60 * 60 * 1000;
const MAX_SESSIONS = 24;
const MAX_IMAGE_B64 = 64_000;
const INPUTS = new Set(["move", "click", "double_click", "mouse_down", "mouse_up", "scroll", "type", "key", "hotkey", "screen_size", "cursor"]);

class VisualError extends Error {
  constructor(message, status = 400) {
    super(message); this.status = status;
  }
}

export async function pcAgentRequest(deviceId, action, args = {}, timeoutMs = 14000, fetchImpl = fetch) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs + 2000);
  try {
    const response = await fetchImpl(PC_CONTROL_URL, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deviceId, action, args, timeoutMs }),
      signal: ctrl.signal
    });
    if (!response.ok) throw new VisualError("Canal de controle do agente indisponível", 503);
    const text = await response.text();
    if (text.length > 165000) throw new VisualError("Resposta de tela excessiva", 502);
    const result = JSON.parse(text);
    if (!result || result.ok !== true) {
      throw new VisualError(String(result?.error || "Agente não respondeu").slice(0, 160), 503);
    }
    return result;
  } catch (e) {
    if (e instanceof VisualError) throw e;
    throw new VisualError("Notebook indisponível ou sem sessão gráfica", 503);
  } finally {
    clearTimeout(timer);
  }
}

export class VisualSessionController {
  constructor({ registry, requestPc = pcAgentRequest, log = async () => {}, clock = () => Date.now() }) {
    this.registry = registry;
    this.requestPc = requestPc;
    this.log = log;
    this.clock = clock;
    this.sessions = new Map();
  }

  prune() {
    const now = this.clock();
    for (const [id, s] of this.sessions) {
      if (now - s.lastAt > IDLE_EXPIRE_MS || now - s.createdAt > MAX_AGE_MS) {
        this.sessions.delete(id);
      }
    }
  }

  session(token, actor) {
    this.prune();
    const s = TOKEN.test(token || "") && this.sessions.get(token);
    if (!s || s.actor !== actor) throw new VisualError("Sessão visual inexistente ou expirada", 403);
    s.lastAt = this.clock();
    return s;
  }

  async start(deviceId, actor) {
    this.prune();
    const match = DEVICE.exec(deviceId || "");
    if (!match || !UUID.test(match[1])) throw new VisualError("Identificador do computador inválido");
    if (!actor || typeof actor !== "string" || actor.length > 180) {
      throw new VisualError("Usuário administrativo indisponível", 403);
    }
    // Do not interpret approval of the ordinary agent as permission for
    // viewing staff screens. Require separate TI Zero Touch approval.
    const enrollment = (await this.registry.pending()).find(x => x.deviceId === match[1]);
    if (!enrollment || enrollment.status !== "approved") {
      throw new VisualError("Acesso Zero Touch deste PC ainda não aprovado pela TI", 403);
    }
    if (this.sessions.size >= MAX_SESSIONS ||
        [...this.sessions.values()].some(x => x.deviceId === deviceId)) {
      throw new VisualError("Já existe uma sessão de suporte ativa neste computador", 409);
    }
    // Demand that the logged-in session socket can actually respond.
    await this.requestPc(deviceId, "session_status", {}, 9000);
    const token = randomBytes(24).toString("hex");
    const now = this.clock();
    this.sessions.set(token, {
      deviceId, actor, createdAt: now, lastAt: now, frameBusy: false,
      inputsInWindow: 0, windowStarted: now
    });
    await this.log({ action: "start", deviceId, actor, time: new Date(now).toISOString() });
    return { token, expiresIfIdleSeconds: IDLE_EXPIRE_MS / 1000, maxSessionMinutes: 120 };
  }

  async frame(token, actor) {
    const s = this.session(token, actor);
    if (s.frameBusy) throw new VisualError("Frame anterior ainda em processamento", 429);
    s.frameBusy = true;
    try {
      const raw = await this.requestPc(s.deviceId, "screenshot", {
        inline: true, maxWidth: 1100, quality: 63
      }, 16000);
      if (raw.mimeType !== "image/jpeg" || typeof raw.data !== "string" ||
          raw.data.length < 50 || raw.data.length > MAX_IMAGE_B64 ||
          !/^[A-Za-z0-9+/]+={0,2}$/.test(raw.data) ||
          !Number.isInteger(raw.screenWidth) || !Number.isInteger(raw.screenHeight) ||
          raw.screenWidth < 100 || raw.screenWidth > 8192 ||
          raw.screenHeight < 100 || raw.screenHeight > 8192) {
        throw new VisualError("Frame retornado pelo PC é inválido", 502);
      }
      // Verify JPEG marker in addition to the declared mime type.
      const buf = Buffer.from(raw.data, "base64");
      if (buf.length < 40 || buf[0] !== 0xff || buf[1] !== 0xd8 ||
          buf[buf.length - 2] !== 0xff || buf[buf.length - 1] !== 0xd9) {
        throw new VisualError("Imagem JPEG inválida", 502);
      }
      return {
        mimeType: "image/jpeg", data: raw.data,
        width: raw.width, height: raw.height,
        screenWidth: raw.screenWidth, screenHeight: raw.screenHeight,
        capturedAt: new Date(this.clock()).toISOString()
      };
    } finally {
      s.frameBusy = false;
    }
  }

  async input(token, actor, event) {
    const s = this.session(token, actor);
    if (!event || typeof event !== "object" || Array.isArray(event) ||
        !INPUTS.has(event.op)) throw new VisualError("Operação de teclado/mouse inválida");
    if (JSON.stringify(event).length > 3000) throw new VisualError("Entrada excessiva");
    const now = this.clock();
    if (now - s.windowStarted >= 1000) {
      s.windowStarted = now; s.inputsInWindow = 0;
    }
    if (++s.inputsInWindow > 18) throw new VisualError("Limite de eventos por segundo", 429);
    const result = await this.requestPc(s.deviceId, "gui", event, 12000);
    await this.log({ action: "input", operation: event.op,
      deviceId: s.deviceId, actor, time: new Date(now).toISOString() });
    // Never log or echo typed text, key combinations or screen contents.
    return { ok: true, x: result.x ?? null, y: result.y ?? null,
      width: result.width ?? null, height: result.height ?? null };
  }

  async stop(token, actor) {
    const s = this.session(token, actor);
    this.sessions.delete(token);
    await this.log({ action: "stop", deviceId: s.deviceId, actor,
                     time: new Date(this.clock()).toISOString() });
    return { ok: true };
  }
}

export function installVisualSessionRoutes({ app, registry, isAdmin, requestPc = pcAgentRequest,
  auditFile = "/opt/intranet-data/enfoque-visual-audit.jsonl" }) {
  const log = async (data) => {
    try {
      // Screen pixels and typed values are intentionally never persisted.
      await fs.appendFile(auditFile, JSON.stringify(data) + "\n", { mode: 0o600 });
    } catch {
      // Auditing errors must not disclose event data to HTTP clients.
    }
  };
  const manager = new VisualSessionController({ registry, requestPc, log });
  const base = "/api/remote-access/visual";
  function guard(req, res) {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    if (!isAdmin(req)) {
      res.status(403).json({ ok: false, error: "Somente administradores TI autorizados" });
      return false;
    }
    if (req.get("X-Enfoque-TI-Action") !== "visual-remote") {
      res.status(403).json({ ok: false, error: "Confirmação administrativa ausente" });
      return false;
    }
    const origin = req.get("Origin");
    if (origin) {
      try {
        if (new URL(origin).host !== req.get("host")) {
          res.status(403).json({ ok: false, error: "Origem inválida" }); return false;
        }
      } catch { res.status(403).json({ ok: false, error: "Origem inválida" }); return false; }
    }
    return true;
  }
  const actor = req => String(req.intranetUser?.email || "").trim().toLowerCase();
  function sendFailure(res, e) {
    const status = e instanceof VisualError ? e.status : 503;
    res.status(status).json({ ok: false,
      error: e instanceof VisualError ? e.message : "Serviço visual indisponível" });
  }
  app.post(base + "/start", async (req, res) => {
    if (!guard(req, res)) return;
    try { res.json({ ok: true, ...(await manager.start(req.body?.deviceId, actor(req))) }); }
    catch (e) { sendFailure(res, e); }
  });
  app.post(base + "/frame", async (req, res) => {
    if (!guard(req, res)) return;
    try { res.json({ ok: true, ...(await manager.frame(req.body?.token, actor(req))) }); }
    catch (e) { sendFailure(res, e); }
  });
  app.post(base + "/input", async (req, res) => {
    if (!guard(req, res)) return;
    try { res.json(await manager.input(req.body?.token, actor(req), req.body?.event)); }
    catch (e) { sendFailure(res, e); }
  });
  app.post(base + "/stop", async (req, res) => {
    if (!guard(req, res)) return;
    try { res.json(await manager.stop(req.body?.token, actor(req))); }
    catch (e) { sendFailure(res, e); }
  });
  return manager;
}
