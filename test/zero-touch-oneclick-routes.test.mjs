import test from "node:test";
import assert from "node:assert/strict";
import { installZeroTouchRoutes } from "../server/zero-touch-routes.mjs";

function fixture() {
  const routes = new Map();
  const state = { approvals: [], revocations: [], rejections: [], tunnels: 0, dropped: 0 };
  const app = {
    get(name, handler) { routes.set("GET " + name, handler); },
    post(name, handler) { routes.set("POST " + name, handler); },
  };
  const registry = {
    async approveFromAdmin(uuid, actor, issue) {
      state.approvals.push({ uuid, actor });
      await issue({ name: "CAIXA1-ITAIPU", location: "Itaipu", actor, deviceId: uuid, tunnelPort: 23103 });
      return { deviceId: uuid, status: "approved" };
    },
    async revokeFromAdmin(uuid, actor) {
      state.revocations.push({ uuid, actor });
      return { deviceId: uuid, status: "revoked" };
    },
    async rejectFromAdmin(uuid, actor) {
      state.rejections.push({ uuid, actor });
      return { deviceId: uuid, status: "rejected" };
    },
    async approvedConnections() { return []; },
  };
  installZeroTouchRoutes({
    app, registry, inventory: { async register() { return { id: "safe-id", secret: "fake-secret" }; } },
    isAdmin: (req) => Boolean(req.isTiAdmin),
    async provisionDeviceKeys() { return "ssh-ed25519 fake-public-key"; },
    async syncAuthorizedTunnels() { state.tunnels++; },
    async dropTunnelSessionsAfterRevocation() { state.dropped++; },
  });
  function response() {
    return {
      code: 200, result: null, status(code) { this.code = code; return this; },
      setHeader() {}, json(data) { this.result = data; return this; },
    };
  }
  async function action(verb, { admin = true, body = {}, header = "zero-touch-review" } = {}) {
    const res = response();
    const req = { params: { deviceId: "6c9a0c54-09c6-4f25-86ef-891f311d9624" },
      intranetUser: { email: "admin@enfoque" }, isTiAdmin: admin,
      body, get(name) { return name === "X-Enfoque-TI-Action" ? header : undefined; } };
    const route = routes.get("POST /api/remote-access/zero-touch/:deviceId/" + verb);
    assert.equal(typeof route, "function");
    await route(req, res);
    return res;
  }
  return { state, action };
}

test("root approval requires TI role, CSRF-like action header and explicit one-click grant", async () => {
  const f = fixture();
  assert.equal((await f.action("approve", { admin: false, body: { grantFullRoot: true } })).code, 403);
  assert.equal((await f.action("approve", { header: "wrong", body: { grantFullRoot: true } })).code, 400);
  assert.equal((await f.action("approve", { body: {} })).code, 400);
  assert.equal(f.state.approvals.length, 0);
  const approved = await f.action("approve", { body: { grantFullRoot: true } });
  assert.equal(approved.code, 200);
  assert.equal(approved.result.device.status, "approved");
  assert.deepEqual(f.state.approvals, [{
    uuid: "6c9a0c54-09c6-4f25-86ef-891f311d9624", actor: "admin@enfoque"
  }]);
  assert.equal(f.state.tunnels, 1);
});

test("revoke and reject also never require a manually typed SSH key or code", async () => {
  const f = fixture();
  assert.equal((await f.action("revoke", { body: {} })).code, 400);
  assert.equal((await f.action("reject", { body: {} })).code, 400);
  assert.equal((await f.action("revoke", { body: { confirmRevoke: true } })).result.device.status, "revoked");
  assert.equal(f.state.dropped, 1);
  assert.equal((await f.action("reject", { body: { confirmReject: true } })).result.device.status, "rejected");
});

test("browser panel exposes a single-click full root action with NO code prompt", async () => {
  const { readFile } = await import("node:fs/promises");
  const code = await readFile(new URL("../server/intranet-zero-touch.js", import.meta.url), "utf8");
  assert.match(code, /Liberar acesso completo \(root\)/);
  assert.match(code, /grantFullRoot: true/);
  assert.doesNotMatch(code, /window\.prompt/);
  assert.match(code, /window\.confirm/);
});
