/* Enfoque OS Zero Touch approvals. Administrative API enforces TI session/ACL. */
(() => {
  "use strict";
  const root = document.getElementById("enfoqueZeroTouch");
  if (!root) return;
  const list = document.getElementById("ztDevices");
  const message = document.getElementById("ztFeedback");
  const reload = document.getElementById("ztRefresh");
  const base = "/api/remote-access/zero-touch";
  let busy = false;

  async function api(path, method = "GET", data) {
    const response = await fetch(base + path, {
      method,
      credentials: "same-origin",
      headers: {
        Accept: "application/json",
        ...(data ? { "Content-Type": "application/json", "X-Enfoque-TI-Action": "zero-touch-review" } : {})
      },
      body: data ? JSON.stringify(data) : undefined,
      cache: "no-store"
    });
    const payload = await response.json().catch(() => ({ ok: false }));
    if (!response.ok || !payload.ok) {
      const error = new Error(payload.error || "Falha na consulta ao servidor");
      error.httpCode = response.status;
      throw error;
    }
    return payload;
  }

  function el(tag, text, className) {
    const node = document.createElement(tag);
    if (text != null) node.textContent = text;
    if (className) node.className = className;
    return node;
  }

  async function action(device, verb) {
    if (busy) return;
    const phrases = {
      approve: "LIBERAR ROOT TOTAL para " + device.pcName + " (" + device.unitName +
        ")?\n\nA TI terá acesso completo ao computador para manutenção, atualização, recuperação e instalação de programas. A autorização será única, permanente até revogação.\n\nNenhuma chave ou código precisa ser digitado no PC.",
      revoke: "REVOGAR o acesso root do computador " + device.pcName + "? A conexão administrativa será encerrada.",
      reject: "Recusar o pedido de " + device.pcName + "?"
    };
    if (!window.confirm(phrases[verb])) return;
    busy = true;
    message.textContent = "Registrando ação na Central de TI...";
    try {
      const body = verb === "approve" ? { grantFullRoot: true } :
                   verb === "revoke" ? { confirmRevoke: true } : { confirmReject: true };
      await api("/" + encodeURIComponent(device.deviceId) + "/" + verb,
                "POST", body);
      message.textContent = verb === "approve"
        ? "Root total autorizado. A ativação SSH acontece automaticamente na próxima comunicação do computador, sem senha ou chave manual."
        : "Ação registrada pela TI.";
      busy = false;
      await refresh();
    } catch (err) {
      message.textContent = err.message;
    } finally {
      busy = false;
    }
  }

  function card(device) {
    const row = el("article", null, "remote-device-card");
    row.style.padding = "12px";
    row.style.margin = "8px 0";
    row.style.border = "1px solid var(--border, #d0d5dc)";
    row.style.borderRadius = "8px";
    const title = el("strong", device.pcName + " — " + device.unitName);
    const info = el("p", "Estado: " + device.status +
      " | Identificador: " + device.deviceId.slice(0, 13) + "…");
    info.style.fontSize = "0.87rem";
    const commands = el("div");
    commands.style.display = "flex";
    commands.style.gap = "8px";
    for (const [verb, caption] of device.status === "pending"
      ? [["approve","Liberar acesso completo (root)"], ["reject","Recusar"]]
      : device.status === "approved" ? [["revoke","Revogar acesso root"]] : []) {
      const button = el("button", caption, "remote-btn");
      button.type = "button";
      button.addEventListener("click", () => action(device, verb));
      commands.appendChild(button);
    }
    const description = device.status === "pending"
      ? "Aguardando liberação única da TI. Chaves e túnel serão configurados automaticamente."
      : device.status === "approved"
      ? "Root total autorizado. Acesso pela VPS, identidade individual, sem novas confirmações."
      : "Sem autorização root ativa.";
    row.appendChild(el("small", description));
    if (device.lastCheckAt) {
      const last = new Date(device.lastCheckAt);
      if (Number.isFinite(last.getTime())) {
        row.appendChild(el("p", "Última comunicação segura: " + last.toLocaleString("pt-BR")));
      }
    }
    row.append(title, info, commands);
    return row;
  }

  async function refresh() {
    if (busy) return;
    try {
      const state = await api("/pending");
      root.hidden = false;
      list.replaceChildren();
      const devices = Array.isArray(state.devices) ? state.devices : [];
      if (!devices.length) list.append(el("p", "Nenhum computador solicitou inscrição."));
      for (const device of devices) list.append(card(device));
      reload.disabled = false;
    } catch (error) {
      if (error.httpCode === 403 || error.httpCode === 401) {
        root.hidden = true;
        return;
      }
      root.hidden = false;
      message.textContent = error.message;
    }
  }
  reload.addEventListener("click", refresh);
  setTimeout(refresh, 800);
  setInterval(refresh, 30000);
})();
