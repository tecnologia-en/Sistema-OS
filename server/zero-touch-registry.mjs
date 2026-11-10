/**
 * Enfoque OS Zero Touch - pending-only enrollment with per-device Ed25519 proof.
 *
 * A new machine can REQUEST enrollment, not approve itself. The existing
 * Intranet admin session approves a fingerprint, then the server returns
 * a per-machine credential only to the machine proving its private key.
 * No shared ISO secrets, remote shell endpoints, or automatic admin elevation.
 */
import fs from "node:fs/promises";
import path from "node:path";
import {
  createHash, createPublicKey, verify, randomUUID
} from "node:crypto";

const UUID4 = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const NONCE = /^[a-f0-9]{32}$/;
const STORE = new Set([
  "ilha-plaza", "copacabana", "itaipu", "icarai", "sao-goncalo",
  "centro", "deposito", "administracao", "papel-arte"
]);
const MAX_DEVICES = 350;
const MAX_AGE_MS = 5 * 60 * 1000;
const SAFE_NAME = /^[A-Za-zÀ-ÿ0-9 _.-]{3,48}$/;
const TUNNEL_PORT_START = 23101;
const TUNNEL_HOST = "intranet.enfoquepapelaria.com.br";
function digest(bytes) { return createHash("sha256").update(bytes).digest("hex"); }
function err(message) { const e = new Error(message); e.publicReason = true; return e; }
export function parsePublicKey(pem) {
  if (typeof pem !== "string" || pem.length > 220 || !pem.startsWith("-----BEGIN PUBLIC KEY-----\n")) {
    throw err("Chave publica invalida");
  }
  let key;
  try { key = createPublicKey(pem); } catch { throw err("Chave publica invalida"); }
  if (key.asymmetricKeyType !== "ed25519") throw err("Somente Ed25519 e permitido");
  return { key, der: key.export({ type: "spki", format: "der" }) };
}
export function verificationCode(uuid, pem) {
  const { der } = parsePublicKey(pem);
  return digest(Buffer.concat([Buffer.from(uuid, "ascii"), der])).slice(0, 10).toUpperCase();
}
export function signedPayload(action, { deviceId, pcName, unitId, unitName, timestamp, nonce, publicKey, tunnelPublicKey, hostPublicKey }) {
  if (!["register", "status"].includes(action)) throw err("Acao invalida");
  const values = [
    "enfoque-zt-v1", action, deviceId,
    action === "register" ? digest(parsePublicKey(publicKey).der) : "",
    action === "register" ? pcName : "",
    action === "register" ? unitId : "",
    action === "register" ? unitName : "",
    action === "register" ? digest(Buffer.from(tunnelPublicKey || "", "ascii")) : "",
    action === "register" ? digest(Buffer.from(hostPublicKey || "", "ascii")) : "",
    String(timestamp), nonce
  ];
  return Buffer.from(values.join("\n") + "\n", "utf8");
}
function verifyProof(action, data, pem, clock) {
  if (typeof data !== "object" || data === null) throw err("Cadastro invalido");
  if (!UUID4.test(data.deviceId || "")) throw err("UUID v4 invalido");
  if (!NONCE.test(data.nonce || "")) throw err("Nonce invalido");
  if (!Number.isSafeInteger(data.timestamp) || Math.abs(clock() - data.timestamp) > MAX_AGE_MS) {
    throw err("Solicitacao expirada");
  }
  if (typeof data.signature !== "string" || data.signature.length > 150 || !/^[A-Za-z0-9+/]+={0,2}$/.test(data.signature)) {
    throw err("Assinatura ausente");
  }
  const sig = Buffer.from(data.signature, "base64");
  if (sig.length !== 64) throw err("Assinatura malformada");
  const { key } = parsePublicKey(pem);
  if (!verify(null, signedPayload(action, { ...data, publicKey: pem }), key, sig)) {
    throw err("Comprovacao de chave invalida");
  }
}
export function validateSshKey(value) {
  if (typeof value !== "string" || value.length > 200 ||
      !/^ssh-ed25519 [A-Za-z0-9+/]+={0,2}$/.test(value)) throw err("Chave SSH Ed25519 invalida");
  const raw = Buffer.from(value.split(" ")[1], "base64");
  if (raw.length !== 51 || raw.readUInt32BE(0) !== 11 ||
      raw.subarray(4, 15).toString("ascii") !== "ssh-ed25519" ||
      raw.readUInt32BE(15) !== 32) throw err("Chave SSH Ed25519 malformada");
  return value;
}
function publicView(record) {
  const { deviceId, pcName, unitId, unitName, status, code, createdAt,
          approvedAt, rejectedAt, lastCheckAt, approvedBy, rejectionReason,
          revokedAt, revokedBy } = record;
  return { deviceId, pcName, unitId, unitName, status, code, createdAt,
           approvedAt, rejectedAt, lastCheckAt, approvedBy, rejectionReason,
           revokedAt, revokedBy };
}
export class ZeroTouchRegistry {
  constructor(directory, clock = () => Date.now()) {
    this.directory = directory;
    this.file = path.join(directory, "zero-touch-enrollment.json");
    this.clock = clock;
    this.queue = Promise.resolve();
  }
  async read() {
    try {
      const info = await fs.lstat(this.file);
      if (!info.isFile() || info.isSymbolicLink() || info.mode & 0o077) {
        throw err("Registro de inscricao com permissoes invalidas");
      }
      const data = JSON.parse(await fs.readFile(this.file, "utf8"));
      if (!Array.isArray(data.entries)) throw err("Registro corrompido");
      return data.entries;
    } catch (e) {
      if (e.code === "ENOENT") return [];
      throw e;
    }
  }
  async save(entries) {
    await fs.mkdir(this.directory, { mode: 0o700, recursive: true });
    // DATA_DIR may be shared with other services; do not change its permissions.
    const temp = path.join(this.directory, ".zero-touch-" + randomUUID());
    try {
      await fs.writeFile(temp, JSON.stringify({ schema: 1, entries }, null, 2), { flag: "wx", mode: 0o600 });
      await fs.rename(temp, this.file);
    } finally {
      await fs.rm(temp, { force: true });
    }
  }
  transact(fn) {
    const task = this.queue.catch(() => {}).then(async () => {
      const entries = await this.read();
      const { changed = false, value } = await fn(entries);
      if (changed) await this.save(entries);
      return value;
    });
    this.queue = task.catch(() => {});
    return task;
  }
  async request(data) {
    if (!data || !UUID4.test(data.deviceId || "") || !SAFE_NAME.test(data.pcName || "") ||
        !STORE.has(data.unitId) || !SAFE_NAME.test(data.unitName || "") ||
        typeof data.publicKey !== "string") throw err("Dados de inscricao invalidos");
    validateSshKey(data.tunnelPublicKey);
    validateSshKey(data.hostPublicKey);
    verifyProof("register", data, data.publicKey, this.clock);
    const code = verificationCode(data.deviceId, data.publicKey);
    return this.transact(async (entries) => {
      let entry = entries.find(x => x.deviceId === data.deviceId);
      if (entry) {
        if (entry.publicKey !== data.publicKey || entry.pcName !== data.pcName ||
            entry.unitId !== data.unitId || entry.unitName !== data.unitName ||
            entry.tunnelPublicKey !== data.tunnelPublicKey || entry.hostPublicKey !== data.hostPublicKey) {
          throw err("Identidade ja vinculada a outra inscricao; aprovacão manual necessária");
        }
        return { value: publicView(entry) };
      }
      if (entries.length >= MAX_DEVICES) throw err("Limite de inscricoes atingido");
      entry = {
        deviceId: data.deviceId, publicKey: data.publicKey,
        tunnelPublicKey: data.tunnelPublicKey, hostPublicKey: data.hostPublicKey,
        pcName: data.pcName, unitId: data.unitId, unitName: data.unitName,
        status: "pending", code, createdAt: new Date(this.clock()).toISOString(),
        lastCheckAt: null, lastNonce: data.nonce
      };
      entries.push(entry);
      return { changed: true, value: publicView(entry) };
    });
  }
  async poll(data) {
    return this.transact(async entries => {
      const record = entries.find(x => x.deviceId === data?.deviceId);
      if (!record) throw err("Inscricao nao localizada");
      verifyProof("status", data, record.publicKey, this.clock);
      if (record.lastNonce === data.nonce) throw err("Repeticao de assinatura negada");
      record.lastNonce = data.nonce;
      record.lastCheckAt = new Date(this.clock()).toISOString();
      const body = { ...publicView(record) };
      if (record.status === "approved" && record.issued) {
        body.credentials = { id: record.issued.id, token: record.issued.secret };
        body.ssh = { port: record.issued.tunnelPort,
          adminPublicKey: record.issued.adminPublicKey, host: TUNNEL_HOST };
      }
      return { changed: true, value: body };
    });
  }
  async pending() {
    return (await this.read()).map(publicView);
  }
  async approvedConnections() {
    return (await this.read()).filter(x => x.status === "approved").map(x => ({
      deviceId: x.deviceId, status: x.status,
      tunnelPublicKey: x.tunnelPublicKey,
      hostPublicKey: x.hostPublicKey,
      issued: { tunnelPort: x.issued?.tunnelPort }
    }));
  }
  /**
   * One-click TI authorization. The initial device registration is signed
   * with its private Ed25519 key and the machine MUST have recently completed
   * a second, separately signed status poll before any root grant.
   * No key or fingerprint is ever typed into the browser.
   */
  async approveFromAdmin(deviceId, actor, issue) {
    if (!UUID4.test(deviceId || "") || typeof actor !== "string" || !actor) {
      throw err("Aprovacao da TI invalida");
    }
    const item = (await this.read()).find(x => x.deviceId === deviceId);
    if (!item || item.status !== "pending") throw err("Computador nao aguarda aprovacao");
    const check = Date.parse(item.lastCheckAt || "");
    if (!Number.isFinite(check) || this.clock() - check > 15 * 60_000 ||
        this.clock() < check - 30_000) {
      throw err("Computador precisa estar online e responder ao cadastro seguro recentemente");
    }
    return this.approve(deviceId, item.code, actor, issue);
  }
  async revokeFromAdmin(deviceId, actor) {
    const item = (await this.read()).find(x => x.deviceId === deviceId);
    if (!item || item.status !== "approved") throw err("Computador nao autorizado");
    return this.revoke(deviceId, item.code, actor);
  }
  async rejectFromAdmin(deviceId, actor) {
    const item = (await this.read()).find(x => x.deviceId === deviceId);
    if (!item || item.status !== "pending") throw err("Computador nao esta pendente");
    return this.reject(deviceId, item.code, actor);
  }
  async revoke(deviceId, code, actor) {
    if (!UUID4.test(deviceId || "") || !/^[0-9A-F]{10}$/.test(code || "") || !actor) {
      throw err("Revogacao administrativa invalida");
    }
    return this.transact(async entries => {
      const item = entries.find(x => x.deviceId === deviceId);
      if (!item || item.status !== "approved" || item.code !== code) {
        throw err("Acesso aprovado nao localizado");
      }
      item.status = "revoked";
      item.revokedBy = String(actor).slice(0, 180);
      item.revokedAt = new Date(this.clock()).toISOString();
      return { changed: true, value: publicView(item) };
    });
  }
  async approve(deviceId, code, actor, issue) {
    if (!UUID4.test(deviceId || "") || !/^[0-9A-F]{10}$/.test(code || "") ||
        typeof actor !== "string" || !actor) throw err("Aprovacao administrativa invalida");
    return this.transact(async entries => {
      const item = entries.find(x => x.deviceId === deviceId);
      if (!item || item.status !== "pending" || item.code !== code) {
        throw err("Inscricao nao encontrada ou codigo nao confere");
      }
      const tunnelPort = TUNNEL_PORT_START + entries.indexOf(item);
      const issued = await issue({ name: item.pcName, location: item.unitName, actor,
        deviceId: item.deviceId, tunnelPort,
        tunnelPublicKey: item.tunnelPublicKey, hostPublicKey: item.hostPublicKey });
      if (!UUID4.test(issued.id) || typeof issued.secret !== "string" ||
          !/^[A-Za-z0-9_-]{40,150}$/.test(issued.secret) ||
          issued.tunnelPort !== tunnelPort) {
        throw err("Credencial individual invalida");
      }
      validateSshKey(issued.adminPublicKey);
      item.issued = { id: issued.id, secret: issued.secret,
        tunnelPort, adminPublicKey: issued.adminPublicKey };
      item.status = "approved";
      item.approvedBy = actor.slice(0, 180);
      item.approvedAt = new Date(this.clock()).toISOString();
      return { changed: true, value: publicView(item) };
    });
  }
  async reject(deviceId, code, actor) {
    if (!UUID4.test(deviceId || "") || !/^[0-9A-F]{10}$/.test(code || "") ||
        typeof actor !== "string" || !actor) throw err("Rejeicao administrativa invalida");
    return this.transact(async entries => {
      const item = entries.find(x => x.deviceId === deviceId);
      if (!item || item.status !== "pending" || item.code !== code) {
        throw err("Inscricao nao encontrada ou codigo nao confere");
      }
      item.status = "rejected";
      item.rejectedAt = new Date(this.clock()).toISOString();
      item.rejectionReason = "Recusado pela TI";
      return { changed: true, value: publicView(item) };
    });
  }
}
