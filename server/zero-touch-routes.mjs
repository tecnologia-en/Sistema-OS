/**
 * Zero Touch API under the existing Intranet session and ACL.
 * New devices can only request an enrollment; no agent is activated until
 * an authenticated TI administrator explicitly approves the fingerprint.
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";
const execFileAsync = promisify(execFile);
const LIMIT_WINDOW = 10 * 60_000;
const MONITORA_PROVISIONER = "/opt/monitora-src/server/auto_provision.py";
const MONITORA_TOKEN = /^[A-Za-z0-9_-]{40,100}$/;
// Called ONLY after registry.poll validates the signed, approved Zero Touch
// identity. The child drops to the restricted Monitora account.
async function getApprovedMonitoraToken(record) {
  const { stdout } = await execFileAsync("/usr/sbin/runuser",
    ["-u", "monitora", "--", "/usr/bin/python3", MONITORA_PROVISIONER,
     "issue", record.deviceId, record.unitName, record.pcName],
    { timeout: 9000, maxBuffer: 4096, windowsHide: true });
  const result = JSON.parse(stdout);
  if (result.deviceId !== record.deviceId ||
      typeof result.token !== "string" || !MONITORA_TOKEN.test(result.token)) {
    throw new Error("Monitora provision response invalid");
  }
  return result.token;
}

const LIMIT_COUNT = 20;
export function installZeroTouchRoutes({ app, registry, inventory, isAdmin,
  provisionDeviceKeys, syncAuthorizedTunnels, dropTunnelSessionsAfterRevocation,
  provisionMonitora = getApprovedMonitoraToken }) {
  const attempts = new Map();
  function noStore(res) {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
  }
  function basicRate(req, res) {
    const now = Date.now();
    const ip = String(req.ip || req.socket?.remoteAddress || "unknown");
    if (attempts.size > 4000) {
      for (const [key, item] of attempts) if (now > item.until) attempts.delete(key);
      if (attempts.size > 4000) attempts.clear();
    }
    const entry = attempts.get(ip);
    if (!entry || now >= entry.until) {
      attempts.set(ip, { count: 1, until: now + LIMIT_WINDOW });
      return true;
    }
    entry.count += 1;
    if (entry.count > LIMIT_COUNT) {
      res.status(429).json({ ok: false, error: "Limite de cadastro excedido" });
      return false;
    }
    return true;
  }
  function protectedAdmin(req, res) {
    if (!isAdmin(req)) {
      res.status(403).json({ ok: false, error: "Somente administrador TI" });
      return false;
    }
    if (req.get("X-Enfoque-TI-Action") !== "zero-touch-review") {
      res.status(400).json({ ok: false, error: "Confirmacao de acao ausente" });
      return false;
    }
    return true;
  }
  function fail(res, error) {
    const message = error?.publicReason ? error.message : "Falha no servico de inscricao";
    if (!error?.publicReason) console.error("[zero-touch] unexpected operation error:", String(error?.name || "Error"));
    return res.status(error?.publicReason ? 400 : 503).json({ ok: false, error: message });
  }
  app.post("/api/remote-access/zero-touch/register", async (req, res) => {
    noStore(res);
    if (!basicRate(req, res)) return;
    try {
      if (JSON.stringify(req.body || {}).length > 3000) return res.status(413).json({ ok: false });
      return res.json({ ok: true, ...(await registry.request(req.body)) });
    } catch (error) { return fail(res, error); }
  });
  app.post("/api/remote-access/zero-touch/status", async (req, res) => {
    noStore(res);
    try {
      if (JSON.stringify(req.body || {}).length > 1200) return res.status(413).json({ ok: false });
      const record = await registry.poll(req.body);
      // Older OS versions never ask for a token. No fleet enrollment is
      // triggered until a 0.2.43 client opts in with approved signed status.
      if (req.body?.monitoraProvision === true && record.status === "approved") {
        try {
          const token = await provisionMonitora(record);
          return res.json({ ok:true, ...record, monitora: {
            deviceId: record.deviceId, token
          } });
        } catch (error) {
          console.error("[zero-touch] Monitora bootstrap unavailable",
            { deviceId:record.deviceId, error:String(error?.name||"Error") });
          return res.json({ ok:true, ...record, monitora: { available:false } });
        }
      }
      return res.json({ ok: true, ...record });
    } catch (error) { return fail(res, error); }
  });
  app.get("/api/remote-access/zero-touch/pending", async (req, res) => {
    noStore(res);
    if (!isAdmin(req)) return res.status(403).json({ ok: false, error: "Somente TI" });
    try {
      const records = await registry.pending();
      return res.json({ ok: true, devices: records });
    } catch (error) { return fail(res, error); }
  });
  app.post("/api/remote-access/zero-touch/:deviceId/approve", async (req, res) => {
    noStore(res);
    if (!protectedAdmin(req, res)) return;
    try {
      const actor = String(req.intranetUser?.email || "ti");
      // Only one initial TI admin approval; devices authenticate their
      // Ed25519 identity automatically. No manual key or on-PC code.
      if (req.body?.grantFullRoot !== true) {
        return res.status(400).json({ ok: false, error: "Confirme a concessao unica de acesso root total" });
      }
      const item = await registry.approveFromAdmin(req.params.deviceId, actor,
        async ({ name, location, actor, deviceId, tunnelPort }) => {
          const adminPublicKey = await provisionDeviceKeys(deviceId);
          const created = await inventory.register({ name, location, actor });
          return { ...created, adminPublicKey, tunnelPort };
        });
      await syncAuthorizedTunnels(await registry.approvedConnections());
      console.info("[zero-touch] enrollment approved", { deviceId: item.deviceId, by: actor });
      return res.json({ ok: true, device: item });
    } catch (error) { return fail(res, error); }
  });
  app.post("/api/remote-access/zero-touch/:deviceId/revoke", async (req, res) => {
    noStore(res);
    if (!protectedAdmin(req, res)) return;
    try {
      const actor = String(req.intranetUser?.email || "ti");
      if (req.body?.confirmRevoke !== true) return res.status(400).json({ ok: false, error: "Confirme a revogacao" });
      const item = await registry.revokeFromAdmin(req.params.deviceId, actor);
      await syncAuthorizedTunnels(await registry.approvedConnections());
      await dropTunnelSessionsAfterRevocation();
      console.warn("[zero-touch] tunnel credentials revoked; reconnection refused",
        { deviceId: item.deviceId, by: actor });
      return res.json({ ok: true, device: item });
    } catch (error) { return fail(res, error); }
  });
  app.post("/api/remote-access/zero-touch/:deviceId/reject", async (req, res) => {
    noStore(res);
    if (!protectedAdmin(req, res)) return;
    try {
      const actor = String(req.intranetUser?.email || "ti");
      if (req.body?.confirmReject !== true) return res.status(400).json({ ok: false, error: "Confirme a recusa" });
      const item = await registry.rejectFromAdmin(req.params.deviceId, actor);
      console.info("[zero-touch] enrollment rejected", { deviceId: item.deviceId, by: actor });
      return res.json({ ok: true, device: item });
    } catch (error) { return fail(res, error); }
  });
}
