import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, rm, lstat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { generateKeyPairSync, sign, randomBytes, randomUUID } from "node:crypto";
import { ZeroTouchRegistry, signedPayload, verificationCode } from "../server/zero-touch-registry.mjs";

function sshPublic(key) {
  const raw = key.export({ type: "spki", format: "der" }).subarray(-32);
  const blob = Buffer.alloc(51);
  blob.writeUInt32BE(11, 0);
  blob.write("ssh-ed25519", 4, "ascii");
  blob.writeUInt32BE(32, 15);
  raw.copy(blob, 19);
  return "ssh-ed25519 " + blob.toString("base64");
}
function fixture() {
  const deviceId = randomUUID();
  const keys = generateKeyPairSync("ed25519");
  const publicKey = keys.publicKey.export({ type: "spki", format: "pem" });
  const sshKey = sshPublic(keys.publicKey);
  const base = { deviceId, publicKey, pcName: "CAIXA 1", unitId: "ilha-plaza", unitName: "Ilha Plaza",
    tunnelPublicKey: sshKey, hostPublicKey: sshKey };
  function auth(action, overrides = {}) {
    const body = { ...base, timestamp: Date.now(), nonce: randomBytes(16).toString("hex"), ...overrides };
    body.signature = sign(null, signedPayload(action, body), keys.privateKey).toString("base64");
    if (action === "status") { delete body.pcName; delete body.unitId; delete body.unitName; delete body.publicKey; }
    return body;
  }
  return { base, auth };
}
async function setup(run) {
  const dir = await mkdtemp(path.join(os.tmpdir(), "enfoque-zt-"));
  try { return await run(new ZeroTouchRegistry(dir)); }
  finally { await rm(dir, { recursive: true, force: true }); }
}
const issued = { id: randomUUID(), secret: randomBytes(40).toString("base64url"),
  tunnelPort: 23101, adminPublicKey: sshPublic(generateKeyPairSync("ed25519").publicKey) };

test("new machines remain pending until an authenticated TI approval", async () => {
  await setup(async registry => {
    const f = fixture();
    const request = await registry.request(f.auth("register"));
    assert.equal(request.status, "pending");
    assert.equal(request.code, verificationCode(f.base.deviceId, f.base.publicKey));
    assert.equal((await registry.poll(f.auth("status"))).status, "pending");
    assert.equal((await registry.pending())[0].credentials, undefined);
  });
});

test("approval requires exact code and returns per-machine token only to signed poll", async () => {
  await setup(async registry => {
    const f = fixture();
    await registry.request(f.auth("register"));
    let count = 0;
    const issue = async () => { count += 1; return issued; };
    await assert.rejects(registry.approve(f.base.deviceId, "0000000000", "ti@enfoque", issue));
    assert.equal(count, 0);
    const approved = await registry.approve(f.base.deviceId, verificationCode(f.base.deviceId, f.base.publicKey), "ti@enfoque", issue);
    assert.equal(approved.status, "approved");
    assert.equal(count, 1);
    assert.equal(approved.credentials, undefined);
    assert.equal((await registry.pending())[0].credentials, undefined);
    const status = await registry.poll(f.auth("status"));
    assert.deepEqual(status.credentials, { id: issued.id, token: issued.secret });
    assert.deepEqual(status.ssh, { port: 23101, adminPublicKey: issued.adminPublicKey,
      host: "intranet.enfoquepapelaria.com.br" });
    assert.equal((await registry.approvedConnections())[0].issued.tunnelPort, 23101);
    assert.equal((await registry.approvedConnections())[0].hostPublicKey, f.base.hostPublicKey);
    assert.equal(status.unitId, "ilha-plaza");
    await assert.rejects(registry.approve(f.base.deviceId, verificationCode(f.base.deviceId, f.base.publicKey), "ti", issue));
    assert.equal(count, 1);
  });
});
test("signed status cannot be replayed, forged or used for a different device", async () => {
  await setup(async registry => {
    const f = fixture();
    await registry.request(f.auth("register"));
    const once = f.auth("status");
    await registry.poll(once);
    await assert.rejects(registry.poll(once), /Repeticao/);
    const forged = f.auth("status");
    forged.nonce = randomBytes(16).toString("hex");
    await assert.rejects(registry.poll(forged), /Comprovacao/);
    await assert.rejects(registry.poll({ ...f.auth("status"), deviceId: randomUUID() }));
  });
});
test("registration cannot overwrite existing key or pretend to be another unit", async () => {
  await setup(async registry => {
    const f = fixture();
    const accepted = f.auth("register");
    await registry.request(accepted);
    const repeated = await registry.request(f.auth("register"));
    assert.equal(repeated.status, "pending");
    const other = fixture();
    await assert.rejects(registry.request(other.auth("register", { deviceId: f.base.deviceId })));
    const changed = f.auth("register", { pcName: "CAIXA 2" });
    await assert.rejects(registry.request(changed));
    const tampered = f.auth("register"); tampered.unitId = "centro";
    await assert.rejects(registry.request(tampered));
    const forgedHost = f.auth("register"); forgedHost.hostPublicKey = other.base.hostPublicKey;
    await assert.rejects(registry.request(forgedHost));
  });
});
test("expired status, unsupported key and invalid identity are rejected", async () => {
  await setup(async registry => {
    const f = fixture();
    await registry.request(f.auth("register"));
    await assert.rejects(registry.poll(f.auth("status", { timestamp: Date.now() - 600_000 })), /expirada/);
    await assert.rejects(registry.request(f.auth("register", { unitId: "bad" })));
    await assert.rejects(registry.request(f.auth("register", { pcName: "../x" })));
  });
});
test("only pending requests may be rejected; reject prevents approval", async () => {
  await setup(async registry => {
    const f = fixture();
    await registry.request(f.auth("register"));
    await registry.reject(f.base.deviceId, verificationCode(f.base.deviceId, f.base.publicKey), "ti");
    assert.equal((await registry.poll(f.auth("status"))).status, "rejected");
    await assert.rejects(registry.approve(f.base.deviceId, verificationCode(f.base.deviceId, f.base.publicKey), "ti", async () => issued));
  });
});
test("revocation removes tunnel access without changing other device authorizations", async () => {
  await setup(async registry => {
    const first = fixture(), second = fixture();
    await registry.request(first.auth("register"));
    await registry.request(second.auth("register"));
    await registry.approve(first.base.deviceId, verificationCode(first.base.deviceId, first.base.publicKey),
                           "ti", async ({ tunnelPort }) => ({ ...issued, tunnelPort }));
    await registry.approve(second.base.deviceId, verificationCode(second.base.deviceId, second.base.publicKey),
                           "ti", async ({ tunnelPort }) => ({ ...issued, id: randomUUID(), tunnelPort }));
    assert.equal((await registry.approvedConnections()).length, 2);
    await registry.revoke(first.base.deviceId, verificationCode(first.base.deviceId, first.base.publicKey), "ti");
    assert.equal((await registry.poll(first.auth("status"))).credentials, undefined);
    const remaining = await registry.approvedConnections();
    assert.equal(remaining.length, 1);
    assert.equal(remaining[0].deviceId, second.base.deviceId);
    assert.equal(remaining[0].issued.tunnelPort, 23102);
  });
});

test("one-click full-root approval needs a recent signed poll and no typed key", async () => {
  await setup(async registry => {
    const f = fixture();
    await registry.request(f.auth("register"));
    const issue = async ({ tunnelPort }) => ({ ...issued, tunnelPort });
    await assert.rejects(registry.approveFromAdmin(f.base.deviceId, "ti@enfoque", issue),
                         /precisa estar online/);
    await registry.poll(f.auth("status"));
    const approved = await registry.approveFromAdmin(f.base.deviceId, "ti@enfoque", issue);
    assert.equal(approved.status, "approved");
    assert.equal((await registry.approvedConnections())[0].hostPublicKey, f.base.hostPublicKey);
    assert.equal((await registry.poll(f.auth("status"))).ssh.port, 23101);
    await registry.revokeFromAdmin(f.base.deviceId, "ti@enfoque");
    assert.equal((await registry.poll(f.auth("status"))).status, "revoked");
  });
});

test("one-click denies stale signed polls and rejected devices", async () => {
  await setup(async registry => {
    const f = fixture();
    await registry.request(f.auth("register"));
    await registry.poll(f.auth("status"));
    await registry.transact(async entries => {
      entries[0].lastCheckAt = new Date(Date.now() - 60 * 60_000).toISOString();
      return { changed: true, value: true };
    });
    await assert.rejects(registry.approveFromAdmin(f.base.deviceId, "ti", async () => issued),
                         /precisa estar online/);
    await registry.rejectFromAdmin(f.base.deviceId, "ti");
    await assert.rejects(registry.approveFromAdmin(f.base.deviceId, "ti", async () => issued),
                         /nao aguarda aprovacao/);
  });
});

test("state persists in a root-readable-only file", async () => {
  await setup(async registry => {
    const f = fixture();
    await registry.request(f.auth("register"));
    const file = await lstat(registry.file);
    assert.equal(file.mode & 0o077, 0);
    assert.equal(file.isSymbolicLink(), false);
  });
});
