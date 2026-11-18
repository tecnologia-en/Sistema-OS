/*
 * Enfoque PDV - escolha Cliente / Escola antes de finalizar venda.
 * Captura o clique na fase de captura, sem executar o ng-click do SIGE.
 * O clique original so e liberado para Cliente ou apos informar a Escola.
 */
(() => {
  'use strict';

  if (window.__enfoquePdvTipoVendaInstalled) return;
  window.__enfoquePdvTipoVendaInstalled = true;

  const FINALIZAR = '#btnFinalizarVenda';
  const ESCOLA = '#idNomeEscola';
  const REQUIRED_CLASS = 'enfoque-pdv-nome-escola-obrigatorio';
  const STYLE_ID = 'enfoque-pdv-tipo-venda-estilo-campo';

  let escolaSelecionada = false;
  let liberacaoPontual = null;
  let modalHost = null;
  let botaoOriginal = null;
  let ultimoCampoMarcado = null;

  const noPdv = () => /^\/sistema\/pdv(?:\/|$)/i.test(location.pathname);

  function bloquearEvento(evento) {
    if (evento.cancelable) evento.preventDefault();
    evento.stopImmediatePropagation();
    evento.stopPropagation();
  }

  function campoEscola() {
    return document.querySelector(ESCOLA);
  }

  function garantirEstiloCampo() {
    if (document.getElementById(STYLE_ID)) return;
    const estilo = document.createElement('style');
    estilo.id = STYLE_ID;
    estilo.textContent = [
      '#idNomeEscola.' + REQUIRED_CLASS + '{',
      'outline:3px solid #f59e0b !important;',
      'outline-offset:3px !important;',
      'box-shadow:0 0 0 6px rgba(245,158,11,.24) !important;',
      'background:#fffbeb !important;',
      'transition:box-shadow .18s,outline-color .18s !important;',
      'animation:enfoque-pdv-escola-pulse .85s ease-in-out 2 !important;',
      '}',
      '@keyframes enfoque-pdv-escola-pulse{',
      '0%,100%{box-shadow:0 0 0 6px rgba(245,158,11,.24)}',
      '50%{box-shadow:0 0 0 10px rgba(245,158,11,.12)}',
      '}'
    ].join('');
    (document.head || document.documentElement).appendChild(estilo);
  }

  function atualizarDestaqueEscola() {
    const campo = campoEscola();
    if (ultimoCampoMarcado && ultimoCampoMarcado !== campo) {
      ultimoCampoMarcado.classList.remove(REQUIRED_CLASS);
    }
    ultimoCampoMarcado = campo;
    if (campo) {
      campo.classList.toggle(REQUIRED_CLASS, escolaSelecionada && !String(campo.value || '').trim());
    }
    return campo;
  }

  function focarNomeEscola(tentativa = 0) {
    if (!escolaSelecionada || !noPdv()) return;
    garantirEstiloCampo();
    const campo = atualizarDestaqueEscola();
    if (!campo) {
      if (tentativa < 12) setTimeout(() => focarNomeEscola(tentativa + 1), 250);
      return;
    }
    try {
      campo.scrollIntoView({ behavior: 'smooth', block: 'center' });
      campo.focus({ preventScroll: true });
    } catch (_) {
      try { campo.focus(); } catch (_) {}
    }
  }

  function fecharModal(restaurarFoco = false) {
    if (modalHost) {
      modalHost.remove();
      modalHost = null;
    }
    if (restaurarFoco && botaoOriginal && botaoOriginal.isConnected) {
      try { botaoOriginal.focus(); } catch (_) {}
    }
  }

  function continuarComoCliente() {
    const botao = botaoOriginal && botaoOriginal.isConnected
      ? botaoOriginal
      : document.querySelector(FINALIZAR);
    fecharModal(false);
    if (!botao) return;

    // Somente este clique sintetico escapa deste bloqueio.
    // Os demais listeners e o ng-click original do SIGE continuam funcionando.
    liberacaoPontual = botao;
    try {
      botao.click();
    } finally {
      liberacaoPontual = null;
    }
  }

  function continuarComoEscola() {
    fecharModal(false);
    escolaSelecionada = true;
    focarNomeEscola();
  }

  function abrirModal(botao) {
    if (modalHost) return;
    botaoOriginal = botao;

    const host = document.createElement('div');
    host.id = 'enfoque-pdv-tipo-venda-modal';
    host.style.cssText = 'position:fixed!important;inset:0!important;z-index:2147483647!important;';
    const shadow = host.attachShadow({ mode: 'open' });
    shadow.innerHTML = [
      '<style>',
      ':host{all:initial;font-family:Inter,Segoe UI,Arial,sans-serif;color:#18263e;font-size:14px}',
      '*{box-sizing:border-box}',
      '.fundo{position:fixed;inset:0;display:flex;align-items:center;justify-content:center;',
      'padding:20px;background:rgba(15,23,42,.55);backdrop-filter:blur(7px);-webkit-backdrop-filter:blur(7px)}',
      '.modal{position:relative;width:min(640px,100%);padding:30px;border-radius:22px;',
      'background:#fff;box-shadow:0 24px 80px rgba(15,23,42,.36);}',
      '.fechar{position:absolute;right:18px;top:17px;width:34px;height:34px;border:0;',
      'border-radius:10px;background:#f1f5f9;color:#64748b;font-size:23px;cursor:pointer;line-height:1}',
      '.fechar:hover{background:#e2e8f0;color:#0f172a}',
      '.marca{font-size:11px;font-weight:800;letter-spacing:.13em;color:#3268d7;margin-bottom:8px}',
      'h2{font-size:25px;line-height:1.2;color:#111e38;margin:0 34px 10px 0;font-weight:800}',
      '.descricao{font-size:14px;line-height:1.6;color:#64748b;margin:0 0 22px}',
      '.opcoes{display:grid;grid-template-columns:1fr 1fr;gap:14px}',
      '.opcao{padding:20px 17px 17px;border:1px solid #dbe4f2;border-radius:16px;',
      'background:#f8faff;display:flex;flex-direction:column;min-height:199px}',
      '.opcao.escola{background:#fffbf4;border-color:#f4e2bd}',
      '.rotulo{font-size:18px;font-weight:800;color:#173668;margin-bottom:9px}',
      '.escola .rotulo{color:#925b14}',
      '.explicacao{font-size:13px;line-height:1.55;color:#59677e;margin:0 0 18px;flex:1}',
      '.escolher{border:0;border-radius:11px;padding:12px 10px;font:700 13px Inter,Segoe UI,Arial,sans-serif;',
      'background:#2766d5;color:#fff;cursor:pointer;width:100%;min-height:43px}',
      '.escola .escolher{background:#ab711d}',
      '.escolher:hover{filter:brightness(.92)}',
      'button:focus-visible{outline:3px solid #60a5fa;outline-offset:3px}',
      '@media(max-width:520px){.modal{padding:25px 18px;border-radius:18px}',
      '.opcoes{grid-template-columns:1fr}.opcao{min-height:auto;padding:16px}',
      'h2{font-size:22px}.explicacao{margin-bottom:12px}}',
      '</style>',
      '<div class="fundo" id="enfFundo">',
      '<section class="modal" role="dialog" aria-modal="true" aria-labelledby="enfTitulo" aria-describedby="enfDescricao">',
      '<button class="fechar" type="button" id="enfFechar" aria-label="Fechar">×</button>',
      '<div class="marca">ENFOQUE · PDV</div>',
      '<h2 id="enfTitulo">Qual é o tipo desta venda?</h2>',
      '<p class="descricao" id="enfDescricao">Selecione uma opção antes de continuar para a próxima etapa do SIGE.</p>',
      '<div class="opcoes">',
      '<div class="opcao cliente">',
      '<div class="rotulo">Cliente</div>',
      '<p class="explicacao">Venda comum, sem vínculo com uma escola. A finalização segue normalmente no SIGE.</p>',
      '<button class="escolher" type="button" id="enfCliente">Continuar como cliente</button>',
      '</div>',
      '<div class="opcao escola">',
      '<div class="rotulo">Escola</div>',
      '<p class="explicacao">Venda vinculada a uma instituição. É necessário informar o Nome da Escola para avançar.</p>',
      '<button class="escolher" type="button" id="enfEscola">Informar escola</button>',
      '</div>',
      '</div></section></div>'
    ].join('');

    (document.body || document.documentElement).appendChild(host);
    modalHost = host;

    shadow.getElementById('enfCliente').addEventListener('click', continuarComoCliente);
    shadow.getElementById('enfEscola').addEventListener('click', continuarComoEscola);
    shadow.getElementById('enfFechar').addEventListener('click', () => fecharModal(true));
    shadow.getElementById('enfFundo').addEventListener('click', (evento) => {
      if (evento.target.id === 'enfFundo') fecharModal(true);
    });
    shadow.getElementById('enfCliente').focus();
  }

  // Captura antes do ng-click do Angular, inclusive cliques pelo teclado.
  window.addEventListener('click', (evento) => {
    if (!noPdv()) return;
    const alvo = evento.target;
    const botao = alvo && typeof alvo.closest === 'function' ? alvo.closest(FINALIZAR) : null;
    if (!botao) return;

    if (liberacaoPontual === botao) return;

    if (escolaSelecionada) {
      const campo = atualizarDestaqueEscola();
      if (campo && String(campo.value || '').trim()) {
        // Escola informada: este clique e os listeners nativos do SIGE prosseguem.
        escolaSelecionada = false;
        atualizarDestaqueEscola();
        return;
      }

      bloquearEvento(evento);
      focarNomeEscola();
      return;
    }

    bloquearEvento(evento);
    abrirModal(botao);
  }, true);

  function observarMudancaEscola(evento) {
    if (!escolaSelecionada || !evento.target || evento.target.id !== 'idNomeEscola') return;
    atualizarDestaqueEscola();
  }
  document.addEventListener('input', observarMudancaEscola, true);
  document.addEventListener('change', observarMudancaEscola, true);

  window.addEventListener('keydown', (evento) => {
    if (!modalHost) return;
    if (evento.key === 'Escape') {
      bloquearEvento(evento);
      fecharModal(true);
      return;
    }
    if (evento.key !== 'Tab') return;

    const shadow = modalHost.shadowRoot;
    const botoes = Array.from(shadow.querySelectorAll('button'));
    const focoAtual = shadow.activeElement;
    if (!botoes.length) return;
    if (evento.shiftKey && focoAtual === botoes[0]) {
      bloquearEvento(evento);
      botoes[botoes.length - 1].focus();
    } else if (!evento.shiftKey && focoAtual === botoes[botoes.length - 1]) {
      bloquearEvento(evento);
      botoes[0].focus();
    }
  }, true);

  const limparAoSairDoPdv = () => {
    if (noPdv()) return;
    escolaSelecionada = false;
    atualizarDestaqueEscola();
    fecharModal(false);
  };
  window.addEventListener('popstate', limparAoSairDoPdv);
  window.addEventListener('hashchange', limparAoSairDoPdv);
})();
