/**
 * Zero Touch API under the existing Intranet session and ACL.
 * New devices can only request an enrollment; no agent is activated until
 * an authenticated TI administrator explicitly approves the fingerprint.
 */
const LIMIT_WINDOW = 10 * 60_000;
const LIMIT_COUNT = 20;
export function installZeroTouchRoutes({ app, registry, inventory, isAdmin,
  provisionDeviceKeys, syncAuthorizedTunnels, dropTunnelSessionsAfterRevocation }) {
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
      return res.json({ ok: true, ...(await registry.poll(req.body)) });
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
      const item = await registry.approve(req.params.deviceId, req.body?.code, actor,
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
      const item = await registry.revoke(req.params.deviceId, req.body?.code, actor);
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
      const item = await registry.reject(req.params.deviceId, req.body?.code, actor);
      console.info("[zero-touch] enrollment rejected", { deviceId: item.deviceId, by: actor });
      return res.json({ ok: true, device: item });
    } catch (error) { return fail(res, error); }
  });
}
