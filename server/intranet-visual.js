/* Enfoque OS 0.2.41 — on-demand visual support from authorized TI browser. */
(() => {
  "use strict";
  const API = "/api/remote-access/visual";
  const style = document.createElement("style");
  style.textContent = `
.enfoque-visual-overlay{position:fixed;inset:0;z-index:99990;background:rgba(10,16,26,.88);display:flex;align-items:center;justify-content:center;padding:14px}
.enfoque-visual-panel{background:#121d30;color:#f1f5f9;border:1px solid #324359;border-radius:14px;display:flex;flex-direction:column;width:min(96vw,1350px);max-height:96vh;box-shadow:0 18px 80px #0009;overflow:hidden;font-family:system-ui,-apple-system,sans-serif}
.enfoque-visual-head{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 16px;background:#1c2e48}
.enfoque-visual-head strong{display:block;font-size:15px}
.enfoque-visual-head small{color:#adc7dd;font-size:12px}
.enfoque-visual-panel button{cursor:pointer;border:1px solid #537092;border-radius:7px;background:#274668;color:#f8fafc;padding:8px 10px;font-size:13px}
.enfoque-visual-panel button:hover{background:#3d5a7c}
.enfoque-visual-view{display:flex;align-items:center;justify-content:center;background:#0b1220;min-height:220px;overflow:auto;max-height:64vh}
.enfoque-visual-view img{display:block;object-fit:contain;max-width:100%;max-height:62vh;width:auto;height:auto;cursor:crosshair;user-select:none;touch-action:none}
.enfoque-visual-toolbar{display:flex;flex-wrap:wrap;align-items:center;gap:9px;padding:11px 14px}
.enfoque-visual-toolbar input{min-width:190px;flex:1;background:#f8fafc;color:#0f172a;border:1px solid #94a3b8;border-radius:7px;padding:9px}
.enfoque-visual-status{font-size:12px;color:#abd4fa;padding:0 14px 12px}
.enfoque-visual-kbd{display:inline-flex;align-items:center;gap:6px;font-size:12px;cursor:pointer}
.enfoque-visual-kbd input{min-width:unset;flex:none}
`;
  document.head.append(style);

  function elem(tag, text, cls) {
    const el = document.createElement(tag);
    if (text != null) el.textContent = text;
    if (cls) el.className = cls;
    return el;
  }
  function button(text, click) {
    const b = elem("button", text);
    b.type = "button"; b.addEventListener("click", click); return b;
  }
  async function api(endpoint, body, signal) {
    const response = await fetch(API + endpoint, {
      method: "POST", credentials: "same-origin", cache: "no-store",
      headers: { "Content-Type": "application/json",
                 "X-Enfoque-TI-Action": "visual-remote", "Accept": "application/json" },
      body: JSON.stringify(body), signal
    });
    const json = await response.json().catch(() => ({}));
    if (!response.ok || json.ok !== true) {
      throw new Error(json.error || ("Falha HTTP " + response.status));
    }
    return json;
  }

  let current = null;
  async function open(device) {
    if (current) return;
    const deviceId = "enfoqueos-" + device.deviceId;
    if (!window.confirm("Iniciar sessão visual autorizada em " + device.pcName +
      "?\\nA TI verá a tela ativa e poderá enviar mouse/teclado. " +
      "A captura para quando a sessão for encerrada.")) return;
    let reply;
    try {
      reply = await api("/start", { deviceId });
    } catch (error) {
      alert("Não foi possível conectar: " + error.message);
      return;
    }
    const token = reply.token;
    let closed = false, busy = false, pointerDown = false, frameInfo = null;
    let inputQueue = Promise.resolve();
    let lastMoveAt = 0, consecutiveErrors = 0;
    const controller = new AbortController();
    const overlay = elem("div", null, "enfoque-visual-overlay");
    const panel = elem("section", null, "enfoque-visual-panel");
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-modal", "true");
    panel.setAttribute("aria-label", "Visualização remota de " + device.pcName);
    const head = elem("div", null, "enfoque-visual-head");
    const label = elem("div");
    label.append(elem("strong", device.pcName + " — " + device.unitName));
    label.append(elem("small", "Enfoque OS • visualização sob demanda • TI autenticada"));
    const closeBtn = button("Encerrar sessão", close);
    head.append(label, closeBtn);
    const viewer = elem("div", null, "enfoque-visual-view");
    viewer.tabIndex = 0;
    const img = document.createElement("img");
    img.draggable = false;
    img.alt = "Tela ao vivo do computador remoto";
    viewer.append(img);
    const toolbar = elem("div", null, "enfoque-visual-toolbar");
    const textInput = document.createElement("input");
    textInput.type = "text";
    textInput.placeholder = "Texto para digitar no PC...";
    textInput.setAttribute("aria-label", "Texto para digitar no computador remoto");
    const sendText = button("Enviar texto", () => {
      const text = textInput.value;
      textInput.value = "";
      if (text) enqueue({ op: "type", text });
    });
    textInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") { e.preventDefault(); sendText.click(); }
    });
    const enter = button("Enter", () => enqueue({ op: "key", key: "Return" }));
    const esc = button("Esc", () => enqueue({ op: "key", key: "Escape" }));
    const tab = button("Tab", () => enqueue({ op: "key", key: "Tab" }));
    const checkLabel = elem("label", null, "enfoque-visual-kbd");
    const keyboard = document.createElement("input");
    keyboard.type = "checkbox";
    checkLabel.append(keyboard, document.createTextNode(" Teclado direto"));
    const status = elem("div", "Conectando à sessão gráfica...", "enfoque-visual-status");
    toolbar.append(textInput, sendText, enter, esc, tab, checkLabel);
    panel.append(head, viewer, toolbar, status);
    overlay.append(panel);
    document.body.append(overlay);
    current = { close };

    function enqueue(event) {
      if (closed) return;
      inputQueue = inputQueue.then(async () => {
        if (!closed) await api("/input", { token, event }, controller.signal);
      }).catch((error) => { if (!closed) status.textContent = "Controle: " + error.message; });
    }

    function screenCoords(e) {
      if (!frameInfo || !img.naturalWidth || !img.naturalHeight) return null;
      const bounds = img.getBoundingClientRect();
      if (!bounds.width || !bounds.height) return null;
      const x = Math.max(0, Math.min(frameInfo.screenWidth - 1,
        Math.round((e.clientX - bounds.left) / bounds.width * frameInfo.screenWidth)));
      const y = Math.max(0, Math.min(frameInfo.screenHeight - 1,
        Math.round((e.clientY - bounds.top) / bounds.height * frameInfo.screenHeight)));
      return { x, y };
    }

    img.addEventListener("pointerdown", (e) => {
      const xy = screenCoords(e);
      if (!xy || (e.button !== 0 && e.button !== 1 && e.button !== 2)) return;
      e.preventDefault();
      pointerDown = true;
      img.setPointerCapture?.(e.pointerId);
      const btn = e.button === 2 ? "right" : e.button === 1 ? "middle" : "left";
      enqueue({ op: "move", ...xy });
      enqueue({ op: "mouse_down", button: btn });
      img.dataset.button = btn;
    });
    img.addEventListener("pointerup", (e) => {
      if (!pointerDown) return;
      e.preventDefault();
      const xy = screenCoords(e);
      if (xy) enqueue({ op: "move", ...xy });
      enqueue({ op: "mouse_up", button: img.dataset.button || "left" });
      pointerDown = false;
    });
    img.addEventListener("pointercancel", () => {
      if (!pointerDown) return;
      enqueue({ op: "mouse_up", button: img.dataset.button || "left" });
      pointerDown = false;
    });
    img.addEventListener("pointermove", (e) => {
      if (!pointerDown) return;
      if (Date.now() - lastMoveAt < 105) return;
      lastMoveAt = Date.now();
      const xy = screenCoords(e);
      if (xy) enqueue({ op: "move", ...xy });
    });
    img.addEventListener("contextmenu", e => e.preventDefault());
    img.addEventListener("wheel", e => {
      e.preventDefault();
      enqueue({ op: "scroll", delta: e.deltaY < 0 ? 120 : -120 });
    }, { passive: false });
    viewer.addEventListener("keydown", e => {
      if (!keyboard.checked || !e.isTrusted || closed) return;
      const mapped = {
        Enter: "Return", Escape: "Escape", Backspace: "BackSpace",
        Tab: "Tab", ArrowLeft: "Left", ArrowRight: "Right",
        ArrowUp: "Up", ArrowDown: "Down", Delete: "Delete",
        Home: "Home", End: "End", PageUp: "Prior", PageDown: "Next"
      };
      let event;
      const key = mapped[e.key] || (/^[A-Za-z0-9]$/.test(e.key) ? e.key : null);
      const modifiers = [];
      if (e.ctrlKey) modifiers.push("Control_L");
      if (e.altKey) modifiers.push("Alt_L");
      if (e.shiftKey && modifiers.length) modifiers.push("Shift_L");
      if (modifiers.length && key) event = { op: "hotkey", keys: [...modifiers, key] };
      else if (mapped[e.key]) event = { op: "key", key: mapped[e.key] };
      else if (e.key.length === 1 && !e.ctrlKey && !e.altKey) event = { op: "type", text: e.key };
      if (event) { e.preventDefault(); enqueue(event); }
    });

    async function pump() {
      if (closed || busy) return;
      busy = true;
      try {
        const frame = await api("/frame", { token }, controller.signal);
        if (!closed) {
          frameInfo = { screenWidth: frame.screenWidth, screenHeight: frame.screenHeight };
          img.src = "data:image/jpeg;base64," + frame.data;
          consecutiveErrors = 0;
          status.textContent = "Visualização ativa • " + frame.screenWidth + "×" + frame.screenHeight +
            " • " + new Date(frame.capturedAt).toLocaleTimeString("pt-BR") +
            " • Coordenadas reais • Sessão expira sem solicitações";
        }
      } catch (error) {
        if (!closed) {
          consecutiveErrors++;
          status.textContent = "Aguardando quadro: " + error.message;
          if (consecutiveErrors > 7) { close(); return; }
        }
      } finally {
        busy = false;
        if (!closed) setTimeout(pump, consecutiveErrors ? 650 : 100);
      }
    }

    function close() {
      if (closed) return;
      closed = true;
      controller.abort();
      const release = pointerDown
        ? api("/input", { token, event: { op: "mouse_up", button: img.dataset.button || "left" } })
            .catch(() => { /* agent or desktop disconnected */ })
        : Promise.resolve();
      pointerDown = false;
      overlay.remove();
      current = null;
      release.finally(() => api("/stop", { token })
        .catch(() => { /* server session still expires */ }));
    }
    closeBtn.focus();
    pump();
  }
  window.EnfoqueVisual = { open };
})();
