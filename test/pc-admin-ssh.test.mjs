import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { runPrivilegedPcCommand, posixQuote } from "../server/pc-admin-ssh.mjs";

const uuid = "6c9a0c54-09c6-4f25-86ef-891f311d9624";
const id = "enfoqueos-" + uuid;
const hostKey = "ssh-ed25519 AAAATestPinnedHostPublicKey";
const adminPublicKey = "ssh-ed25519 AAAATestAdminPublicKey";
const entry = {
  deviceId: uuid, pcName: "CAIXA1-ITAIPU", unitId: "itaipu",
  status: "approved", issued: { tunnelPort: 23101, adminPublicKey },
  hostPublicKey: hostKey,
};
async function fixture(t, changes = {}) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "enfoque-root-ssh-"));
  t.after(async () => fs.rm(dir, { recursive: true, force: true }));
  const privateKeys = path.join(dir, "keys");
  const hostKeys = path.join(dir, "hosts");
  await fs.mkdir(privateKeys, { mode: 0o700 });
  await fs.mkdir(hostKeys, { mode: 0o700 });
  const registered = path.join(dir, "devices.json");
  const zeroTouch = path.join(dir, "enrollment.json");
  const auditFile = path.join(dir, "audit.jsonl");
  await fs.writeFile(registered, JSON.stringify(changes.registered ?? {
    [id]: { approvedAt: "2026-11-10T00:00:00.000Z" },
  }), { mode: 0o644 });
  await fs.writeFile(zeroTouch, JSON.stringify({
    entries: [changes.entry ?? entry],
  }), { mode: 0o600 });
  await fs.writeFile(path.join(privateKeys, uuid), "MOCK-PRIVATE", { mode: 0o600 });
  await fs.writeFile(path.join(privateKeys, uuid + ".pub"), adminPublicKey + " test\n", { mode: 0o600 });
  await fs.writeFile(path.join(hostKeys, uuid),
    "[127.0.0.1]:23101 " + hostKey + "\n", { mode: 0o600 });
  const calls = [];
  const runner = async (command, args, options) => {
    calls.push({ command, args, options });
    return { stdout: "uid=0(root) gid=0(root)\n", stderr: "" };
  };
  return { cfg: { registered, zeroTouch, privateKeys, hostKeys, auditFile, ownerUid: process.getuid(), runner }, calls };
}

test("approved TI key uses ONLY the pinned per-PC SSH connection to sudo", async (t) => {
  const { cfg, calls } = await fixture(t);
  const answer = await runPrivilegedPcCommand({
    deviceId: id, program: "/usr/bin/id", args: ["-u"],
  }, cfg);
  assert.equal(answer.ok, true);
  assert.equal(answer.scope, "root-via-ti-ssh");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].command, "/usr/bin/ssh");
  assert(calls[0].args.includes("StrictHostKeyChecking=yes"), "pinned host required");
  assert(calls[0].args.some(x => x.includes("UserKnownHostsFile=" + cfg.hostKeys)));
  assert(calls[0].args.includes("enfoque-ti@127.0.0.1"));
  assert(calls[0].args.includes("sudo -n -- '/usr/bin/id' '-u'"));
  const audit = JSON.parse((await fs.readFile(cfg.auditFile, "utf8")).trim());
  assert.equal(audit.deviceId, id);
  assert.equal(audit.result, "ok");
  assert(!JSON.stringify(audit).includes("/usr/bin/id"), "audit must store only hash of command");
});

test("unapproved TI registration cannot receive remote root", async (t) => {
  const { cfg, calls } = await fixture(t, { entry: { ...entry, status: "pending", issued: null } });
  const result = await runPrivilegedPcCommand({
    deviceId: id, program: "/usr/bin/id",
  }, cfg);
  assert.equal(result.ok, false);
  assert.equal(result.code, "TI_APPROVAL_REQUIRED");
  assert.equal(calls.length, 0);
});

test("single Zero Touch approval persists for future root commands", async (t) => {
  const { cfg, calls } = await fixture(t, { registered: {} });
  const before = await runPrivilegedPcCommand({deviceId: id, program: "/usr/bin/id"}, cfg);
  const after = await runPrivilegedPcCommand({deviceId: id, program: "/usr/bin/id"}, cfg);
  assert.equal(before.ok, true);
  assert.equal(after.ok, true);
  assert.equal(calls.length, 2);
});

test("wrong host pin or SSH key blocks command", async (t) => {
  const { cfg, calls } = await fixture(t);
  await fs.writeFile(path.join(cfg.hostKeys, uuid), "[127.0.0.1]:23101 ssh-ed25519 DIFFERENT\n", { mode: 0o600 });
  const result = await runPrivilegedPcCommand({
    deviceId: id, program: "/usr/bin/id",
  }, cfg);
  assert.equal(result.ok, false);
  assert.equal(result.code, "HOST_MISMATCH");
  assert.equal(calls.length, 0);
});

test("absolute executable paths and bounded arguments are mandatory", async (t) => {
  const { cfg, calls } = await fixture(t);
  for (const program of ["sh", "../bin/sh", "/bin/../bin/sh", "/bin/sh;rm", "//bin/sh"]) {
    const result = await runPrivilegedPcCommand({
      deviceId: id, program,
    }, cfg);
    assert.equal(result.code, "INVALID_COMMAND", program);
  }
  const invalid = await runPrivilegedPcCommand({
    deviceId: id, program: "/bin/sh", args: ["a".repeat(40000)],
  }, cfg);
  assert.equal(invalid.code, "INVALID_COMMAND");
  assert.equal(calls.length, 0);
});

test("POSIX argument escaping cannot break out of quoted strings", () => {
  assert.equal(posixQuote("hello"), "'hello'");
  assert.equal(posixQuote("it's a ; $(test)"), "'it'\\''s a ; $(test)'");
  assert.throws(() => posixQuote("a\0b"));
});
