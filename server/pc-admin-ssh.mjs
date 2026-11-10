/**
 * Enfoque OS 0.2.38: permanent TI root after one Zero Touch approval.
 * approved, host-key-pinned SSH reverse tunnel.
 *
 * The normal MCP agent stays DynamicUser and NEVER receives root, a private
 * admin key, a password, or a new root socket. All privileges belong to the
 * separately approved "enfoque-ti" SSH account with audited sudo.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execute = promisify(execFile);
const UUID4 = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const PROGRAM = /^\/[A-Za-z0-9_./+-]{1,180}$/;
const DEVICE = /^enfoqueos-([a-f0-9-]{36})$/;
const DEFAULTS = Object.freeze({
  zeroTouch: "/opt/intranet-data/zero-touch-enrollment.json",
  privateKeys: "/var/lib/enfoque-tunnel/ti-keys",
  hostKeys: "/var/lib/enfoque-tunnel/known-hosts",
  auditFile: "/var/log/enfoque-pc-admin-audit.jsonl",
  ownerUid: 0,
  runner: execute,
});

function fail(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

async function secureRead(file, uid, { max = 1024 * 1024, privateFile = true } = {}) {
  const stat = await fs.lstat(file);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.uid !== uid ||
      (stat.mode & 0o022) || (privateFile && (stat.mode & 0o077)) ||
      stat.size > max) {
    throw fail("UNTRUSTED_FILE", "Arquivo de autorizacao sem protecao");
  }
  return fs.readFile(file, "utf8");
}
async function securePath(file, uid) {
  const stat = await fs.lstat(file);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.uid !== uid ||
      (stat.mode & 0o077)) {
    throw fail("UNTRUSTED_KEY", "Chave SSH de administracao insegura");
  }
  return file;
}

export function posixQuote(value) {
  if (typeof value !== "string" || value.includes("\0")) {
    throw fail("INVALID_ARG", "Argumento de comando invalido");
  }
  return "'" + value.replace(/'/g, "'\\''") + "'";
}

function validate(request) {
  const deviceId = request?.deviceId;
  const match = DEVICE.exec(deviceId ?? "");
  if (!match || !UUID4.test(match[1])) {
    throw fail("INVALID_DEVICE", "ID do equipamento invalido");
  }
  const { program, args = [], timeoutMs = 60000 } = request;
  if (typeof program !== "string" || !PROGRAM.test(program) ||
      program.split("/").includes("..") || program.startsWith("//") ||
      !Array.isArray(args) || args.length > 64 ||
      args.some(x => typeof x !== "string" || x.length > 8192 || x.includes("\0")) ||
      !Number.isInteger(timeoutMs) || timeoutMs < 1000 || timeoutMs > 600000) {
    throw fail("INVALID_COMMAND", "Comando administrativo invalido");
  }
  const total = args.reduce((n, x) => n + Buffer.byteLength(x), 0);
  if (total > 32768) throw fail("INVALID_COMMAND", "Argumentos excederam o limite");
  return { uuid: match[1], deviceId, program, args, timeoutMs };
}

async function loadApproval(request, cfg) {
  // One signed Zero Touch approval grants lasting access until revoked.
  // Legacy unprivileged MCP enrollment is a different, unnecessary gate.
  const entries = JSON.parse(await secureRead(cfg.zeroTouch, cfg.ownerUid));
  if (!Array.isArray(entries.entries)) throw fail("INVALID_REGISTRY", "Registro Zero Touch invalido");
  const entry = entries.entries.find(row => row.deviceId === request.uuid);
  if (!entry || entry.status !== "approved" || !entry.issued) {
    throw fail("TI_APPROVAL_REQUIRED", "Acesso root exige aprovacao administrativa Zero Touch deste computador");
  }
  const port = entry.issued.tunnelPort;
  if (!Number.isInteger(port) || port < 23101 || port > 23450) {
    throw fail("INVALID_TUNNEL", "Porta individual do tunel invalida");
  }
  const key = path.join(cfg.privateKeys, request.uuid);
  await securePath(key, cfg.ownerUid);
  const pub = (await secureRead(key + ".pub", cfg.ownerUid, { max: 500 })).trim().split(/\s+/).slice(0, 2).join(" ");
  if (pub !== entry.issued.adminPublicKey) {
    throw fail("KEY_MISMATCH", "Chave administrativa nao corresponde ao cadastro da TI");
  }
  const hostFile = path.join(cfg.hostKeys, request.uuid);
  const pinned = await secureRead(hostFile, cfg.ownerUid, { max: 500 });
  if (pinned !== "[127.0.0.1]:" + port + " " + entry.hostPublicKey + "\n") {
    throw fail("HOST_MISMATCH", "Chave SSH do computador diverge da identidade aprovada");
  }
  return { key, hostFile, port };
}

async function audit(cfg, request, status, exitCode = null) {
  const record = {
    at: new Date().toISOString(),
    deviceId: request.deviceId,
    action: "root-exec-over-approved-ssh-0.2.38",
    fingerprint: createHash("sha256")
      .update(JSON.stringify([request.program, request.args])).digest("hex"),
    result: status,
    exitCode: Number.isInteger(exitCode) ? exitCode : null,
  };
  try {
    const file = cfg.auditFile;
    const existing = await fs.lstat(file).catch(e => e.code === "ENOENT" ? null : Promise.reject(e));
    if (existing && (!existing.isFile() || existing.isSymbolicLink() || existing.uid !== cfg.ownerUid ||
                     (existing.mode & 0o077))) return;
    await fs.appendFile(file, JSON.stringify(record) + "\n", { mode: 0o600 });
  } catch {
    // Audit failures never disclose the command contents, device keys or tokens.
  }
}

/** Only the VPS MCP process may call this operation. No root privileges on agents. */
export async function runPrivilegedPcCommand(input, configuration = {}) {
  const cfg = { ...DEFAULTS, ...configuration };
  let request;
  try {
    request = validate(input);
    const { key, hostFile, port } = await loadApproval(request, cfg);
    const remote = "sudo -n -- " + [request.program, ...request.args].map(posixQuote).join(" ");
    const argv = [
      "-F", "/dev/null", "-T", "-p", String(port), "-i", key,
      "-o", "BatchMode=yes", "-o", "IdentitiesOnly=yes",
      "-o", "PreferredAuthentications=publickey",
      "-o", "PasswordAuthentication=no", "-o", "KbdInteractiveAuthentication=no",
      "-o", "StrictHostKeyChecking=yes", "-o", "UserKnownHostsFile=" + hostFile,
      "-o", "GlobalKnownHostsFile=/dev/null", "-o", "UpdateHostKeys=no",
      "-o", "ProxyCommand=none", "-o", "ClearAllForwardings=yes",
      "-o", "ConnectTimeout=8", "-o", "ServerAliveInterval=10",
      "-o", "ServerAliveCountMax=2", "-o", "LogLevel=ERROR",
      "enfoque-ti@127.0.0.1", remote,
    ];
    const result = await cfg.runner("/usr/bin/ssh", argv, {
      timeout: request.timeoutMs,
      maxBuffer: 128 * 1024,
      encoding: "utf8",
    });
    await audit(cfg, request, "ok", 0);
    return { ok: true, scope: "root-via-ti-ssh", exitCode: 0,
             stdout: String(result.stdout ?? "").slice(0, 64000),
             stderr: String(result.stderr ?? "").slice(0, 12000) };
  } catch (error) {
    if (request) await audit(cfg, request, String(error.code || "execution_failed"), error.code === "E_TIMEOUT" ? 124 : null);
    return { ok: false, scope: "admin-authenticated", code: String(error.code || "EXECUTION_FAILED"),
             error: String(error.message || "Falha administrativa").slice(0, 240) };
  }
}
