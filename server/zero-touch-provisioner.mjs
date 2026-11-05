/**
 * Enfoque OS per-device SSH administration keys and restricted tunnel access.
 * Private admin keys never leave the VPS. Public tunnel keys require TI approval.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { validateSshKey } from "./zero-touch-registry.mjs";
const exec = promisify(execFile);
const ROOT = "/var/lib/enfoque-tunnel";
const ADMIN = path.join(ROOT, "ti-keys");
const AUTHORIZED = path.join(ROOT, "authorized_keys");
const HOSTS = path.join(ROOT, "known-hosts");
const UUID4 = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const PORT_MIN = 23101;
const PORT_MAX = 23450;
async function ensureRootDir() {
  if (process.getuid && process.getuid() !== 0) throw new Error("Administrador VPS exigido");
  for (const target of [ROOT, ADMIN, HOSTS]) {
    const expectedMode = target === ROOT ? 0o755 : 0o700;
    await fs.mkdir(target, { recursive: true, mode: expectedMode });
    const stat = await fs.lstat(target);
    if (!stat.isDirectory() || stat.isSymbolicLink() || stat.uid !== 0 ||
        (stat.mode & 0o777) !== expectedMode) {
      throw new Error("Diretorio de chaves administrativas inseguro");
    }
  }
}
async function readKey(file) {
  const s = await fs.lstat(file);
  if (!s.isFile() || s.isSymbolicLink() || s.uid !== 0 || (s.mode & 0o077)) {
    throw new Error("Chave de administracao insegura");
  }
  const key = (await fs.readFile(file + ".pub", "utf8")).trim().split(/\s+/).slice(0,2).join(" ");
  return validateSshKey(key);
}
export async function provisionDeviceKeys(deviceId) {
  if (!UUID4.test(deviceId)) throw new Error("UUID do equipamento invalido");
  await ensureRootDir();
  const target = path.join(ADMIN, deviceId);
  try { return await readKey(target); }
  catch (e) { if (e.code !== "ENOENT") throw e; }
  const tmp = path.join(ADMIN, ".key-" + randomUUID());
  try {
    await exec("/usr/bin/ssh-keygen", ["-q", "-t", "ed25519", "-N", "", "-f", tmp,
      "-C", "enfoque-ti-" + deviceId], { timeout: 20000 });
    await fs.chmod(tmp, 0o600);
    await fs.chmod(tmp + ".pub", 0o600);
    await fs.rename(tmp, target);
    await fs.rename(tmp + ".pub", target + ".pub");
  } finally {
    await fs.rm(tmp, { force: true });
    await fs.rm(tmp + ".pub", { force: true });
  }
  return readKey(target);
}
export function authorizedKeyLine(entry) {
  if (entry.status !== "approved" || !entry.issued) return null;
  const port = entry.issued.tunnelPort;
  if (!Number.isInteger(port) || port < PORT_MIN || port > PORT_MAX ||
      !UUID4.test(entry.deviceId)) throw new Error("Registro SSH nao autorizado");
  const key = validateSshKey(entry.tunnelPublicKey);
  return 'restrict,port-forwarding,permitlisten="127.0.0.1:' + port +
    '",command="/bin/false" ' + key + " enfoque-zt-" + entry.deviceId;
}
export async function syncAuthorizedTunnels(entries) {
  await ensureRootDir();
  const lines = entries.map(authorizedKeyLine).filter(Boolean);
  const activeIds = new Set(entries.filter(x => x.status === "approved").map(x => x.deviceId));
  if (new Set(lines).size !== lines.length) throw new Error("Chaves de tunel duplicadas");
  const ports = entries.filter(x => x.status === "approved").map(x => x.issued?.tunnelPort);
  if (new Set(ports).size !== ports.length) throw new Error("Portas de tunel duplicadas");
  for (const entry of entries) {
    if (entry.status !== "approved") continue;
    const port = entry.issued.tunnelPort;
    const hostKey = validateSshKey(entry.hostPublicKey);
    const hostFile = path.join(HOSTS, entry.deviceId);
    const hostLine = "[127.0.0.1]:" + port + " " + hostKey + "\n";
    const stat = await fs.lstat(hostFile).catch(e => {
      if (e.code === "ENOENT") return null;
      throw e;
    });
    if (stat) {
      if (!stat.isFile() || stat.isSymbolicLink() || stat.uid !== 0 ||
          (stat.mode & 0o077) || (await fs.readFile(hostFile, "utf8")) !== hostLine) {
        throw new Error("Host SSH ja vinculado a chave diferente");
      }
    } else {
      await fs.writeFile(hostFile, hostLine, { flag: "wx", mode: 0o600 });
    }
  }
  for (const file of await fs.readdir(HOSTS)) {
    if (!UUID4.test(file)) throw new Error("Arquivo inesperado nas identidades SSH");
    if (!activeIds.has(file)) await fs.rm(path.join(HOSTS, file), { force: true });
  }
  const tmp = path.join(ROOT, ".authorized-" + randomUUID());
  // This file contains ONLY public keys and must be readable by the sshd
  // authentication process, which temporarily runs as enfoque-tunnel.
  await fs.writeFile(tmp, lines.join("\n") + (lines.length ? "\n" : ""), { flag: "wx", mode: 0o644 });
  try { await fs.rename(tmp, AUTHORIZED); }
  finally { await fs.rm(tmp, { force: true }); }
  return lines.length;
}
export async function dropTunnelSessionsAfterRevocation() {
  // sshd does not disconnect active sessions when authorized_keys is modified.
  // Restart only the dedicated tunnel login sessions. Valid devices reconnect.
  try {
    await exec("/usr/bin/pkill", ["-u", "enfoque-tunnel"], { timeout: 10000 });
  } catch (error) {
    if (error.code !== 1) throw error; // No existing tunnel is not an error.
  }
}
export async function checkSshConfig() {
  await exec("/usr/sbin/sshd", ["-t"], { timeout: 12000 });
}
