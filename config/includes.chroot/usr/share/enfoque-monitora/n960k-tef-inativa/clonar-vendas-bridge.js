(function () {
  if (window.__enfoqueClonarVendaPageBridgeV3) return;
  window.__enfoqueClonarVendaPageBridgeV3 = true;

  function clone(obj) { return JSON.parse(JSON.stringify(obj || {})); }
  function num(v) { var n = Number(v); return Number.isFinite(n) ? n : 0; }

  function findScopeVendasOnce() {
    function ok(s) {
      return !!(s && s.dados && s.dados.Venda && Array.isArray(s.dados.Produtos));
    }

    try { if (ok(window.__enfoqueScopeVendas)) return window.__enfoqueScopeVendas; } catch (e) {}

    try {
      if (window.angular && angular.element) {
        var all = document.querySelectorAll('*');
        for (var i = 0; i < all.length; i++) {
          var el = all[i];
          try {
            var s = angular.element(el).scope();
            if (ok(s)) return s;
            var ngc = el.getAttribute && String(el.getAttribute('ng-controller') || '').toLowerCase();
            if (ngc === 'vendas' && s && s.dados) return s;
          } catch (e) {}
        }
      }
    } catch (e) {}

    try {
      if (window.angular && angular.element) {
        var root = angular.element(document.body).scope();
        var found = null;
        function walk(sc) {
          if (!sc || found) return;
          if (ok(sc)) { found = sc; return; }
          walk(sc.$$childHead);
          walk(sc.$$nextSibling);
        }
        walk(root);
        if (found) return found;
      }
    } catch (e) {}

    return null;
  }

  function findScopeVendasWithRetry(cb) {
    var tries = 0;
    var max = 60;
    var timer = setInterval(function () {
      tries++;
      var s = findScopeVendasOnce();
      if (s || tries >= max) {
        clearInterval(timer);
        cb(s);
      }
    }, 250);
  }

  function sanitizePagamento(pg) {
    var p = clone(pg);
    p.Id = null;
    p.LancamentosIDs = null;
    return p;
  }

  function sanitizeVenda(origem, atual) {
    var venda = Object.assign({}, atual || {}, clone(origem));
    ['Id','Codigo','Data','Alteracao','Validade'].forEach(function (k) {
      if (atual && Object.prototype.hasOwnProperty.call(atual, k)) venda[k] = atual[k];
    });

    venda.Id = (atual && atual.Id) || null;
    venda.Codigo = (atual && atual.Codigo) || 0;
    venda.Status = (atual && atual.Status) || 'Orçamento';
    venda.Finalizado = false;
    venda.Lancado = false;
    venda.FreteLancado = false;
    venda.Enviado = false;
    venda.NumeroNFe = null;
    venda.DataFaturamento = '';
    venda.DataFaturamentoNFE = '';
    venda.DataHoraFaturamentoNFE = '';
    venda.FaturadoPor = null;
    venda.FaturadoPorID = null;
    venda.DataFaturadoCaxia = '';
    venda.CanceladoPor = null;
    venda.CanceladoPorID = null;
    venda.DataCancelamento = null;

    if (Array.isArray(venda.PagamentosVenda)) venda.PagamentosVenda = venda.PagamentosVenda.map(sanitizePagamento);
    return venda;
  }

  function sanitizeProduto(p, indice) {
    var produto = clone(p);
    produto.Id = null;
    produto.VendaID = null;
    produto.OSID = null;
    produto.NumeroNFE = null;
    produto.DataNFE = '';
    produto.Entregue = false;
    produto.Indice = indice + 1;
    produto.Quantidade = num(produto.Quantidade);
    produto.ValorUnitario = num(produto.ValorUnitario);
    produto.DescontoUnitario = num(produto.DescontoUnitario);
    produto.DescontoUnitarioPercentual = num(produto.DescontoUnitarioPercentual);
    produto.DescontoTotal = num(produto.DescontoTotal);
    produto.ValorTotal = Math.round(((produto.Quantidade * produto.ValorUnitario) - produto.DescontoTotal) * 100) / 100;
    return produto;
  }

  function sanitizeDuplicata(d) {
    var dup = clone(d);
    dup.Id = null;
    dup.VendaID = null;
    dup.LancamentoID = null;
    dup.LancamentosIDs = null;
    return dup;
  }

  function sanitizeLancamento(l) {
    var lanc = clone(l);
    lanc.Id = null;
    lanc.VendaID = null;
    lanc.OrdemServicoID = null;
    lanc.LancamentoPaiId = null;
    lanc.LancamentoGrupoID = null;
    lanc.LancamentoFaturamentoID = null;
    lanc.Pago = false;
    lanc.Conciliado = false;
    lanc.ValorPago = 0;
    lanc.Pagamentos = 0;
    lanc.PagamentosConciliados = 0;
    lanc.PagamentosList = null;
    lanc.NewPagamento = null;
    return lanc;
  }

  function sanitizeOSItem(x) {
    var item = clone(x);
    item.Id = null;
    item.VendaID = null;
    item.OSID = null;
    return item;
  }

  function applyModelInScope(modelo, s) {
    var raw = (modelo && modelo.raw) || {};
    var origemVenda = raw.Venda || {};
    var origemProdutos = Array.isArray(raw.Produtos) ? raw.Produtos : [];
    var origemDuplicatas = Array.isArray(raw.Duplicatas) ? raw.Duplicatas : [];
    var origemOSLaudos = Array.isArray(raw.OSLaudos) ? raw.OSLaudos : [];
    var origemOSEquipamentos = Array.isArray(raw.OSEquipamentos) ? raw.OSEquipamentos : [];
    var origemOSVeiculos = Array.isArray(raw.OSVeiculos) ? raw.OSVeiculos : [];
    var origemLancamentos = Array.isArray(raw.Lancamentos) ? raw.Lancamentos : [];

    var doApply = function () {
      var atual = clone(s.dados.Venda || {});
      s.dados.Venda = sanitizeVenda(origemVenda, atual);
      s.dados.Produtos = origemProdutos.map(sanitizeProduto);
      s.dados.Duplicatas = origemDuplicatas.map(sanitizeDuplicata);
      s.dados.OSLaudos = origemOSLaudos.map(sanitizeOSItem);
      s.dados.OSEquipamentos = origemOSEquipamentos.map(sanitizeOSItem);
      s.dados.OSVeiculos = origemOSVeiculos.map(sanitizeOSItem);
      s.dados.Lancamentos = origemLancamentos.map(sanitizeLancamento);

      s.dados.ClienteEstaInadimplente = !!raw.ClienteEstaInadimplente;
      s.dados.IsPlanodeContaDespesa = !!raw.IsPlanodeContaDespesa;
      s.dados.GerenciadorID = raw.GerenciadorID || s.dados.GerenciadorID;
      s.dados.IsRoleGerenciador = !!raw.IsRoleGerenciador;
      s.dados.MostrarCustosVendas = !!raw.MostrarCustosVendas;
      s.dados.SomarICMSSTValorFinal = !!raw.SomarICMSSTValorFinal;
      s.dados.SomarIPIValorFinal = !!raw.SomarIPIValorFinal;
      s.dados.NaoPermitirAlterarComissaoVenda = !!raw.NaoPermitirAlterarComissaoVenda;
      s.dados.VendasBloquearCampoValor = !!raw.VendasBloquearCampoValor;
      s.dados.OcultarCampos = !!raw.OcultarCampos;
      s.dados.PossuiSIGEP = !!raw.PossuiSIGEP;
      s.dados.PodeEditarLancamentos = !!raw.PodeEditarLancamentos;

      s.dados.Venda.QuantidadeTotalItensVendidos = s.dados.Produtos.reduce(function (acc, p) { return acc + num(p.Quantidade); }, 0);
      s.dados.Venda.ValorFinal = Math.round(s.dados.Produtos.reduce(function (acc, p) { return acc + num(p.ValorTotal); }, 0) * 100) / 100;

      if (typeof s.bindSubTotais === 'function') s.bindSubTotais();
      if (typeof s.atualizaTotaisVenda === 'function') s.atualizaTotaisVenda();
      if (typeof s.atualizePagamentos === 'function') s.atualizePagamentos();
      if (typeof s.atualizarDuplicatas === 'function') s.atualizarDuplicatas();
      if (typeof s.atualizeButtons === 'function') s.atualizeButtons();
    };

    if (typeof s.$apply === 'function') {
      try {
        if (s.$root && s.$root.$$phase) doApply();
        else s.$apply(doApply);
      } catch (e) {
        doApply();
        try { if (s.$digest) s.$digest(); } catch (_) {}
      }
    } else {
      doApply();
    }

    window.__enfoqueScopeVendas = s;
    return { produtos: s.dados.Produtos.length, valor: s.dados.Venda.ValorFinal };
  }

  window.addEventListener('message', function (ev) {
    var data = ev.data || {};
    if (!data || data.source !== 'ENFOQUE_CLONAR_VENDA_EXT' || data.type !== 'APPLY_MODEL') return;

    var requestId = data.requestId;
    var modelo = data.modelo;

    findScopeVendasWithRetry(function (s) {
      try {
        if (!s || !s.dados || !s.dados.Venda) {
          window.postMessage({ source:'ENFOQUE_CLONAR_VENDA_PAGE', type:'APPLY_RESULT', requestId:requestId, ok:false, error:'controller_not_found' }, '*');
          return;
        }
        var result = applyModelInScope(modelo, s);
        window.postMessage({ source:'ENFOQUE_CLONAR_VENDA_PAGE', type:'APPLY_RESULT', requestId:requestId, ok:true, result:result }, '*');
      } catch (e) {
        window.postMessage({ source:'ENFOQUE_CLONAR_VENDA_PAGE', type:'APPLY_RESULT', requestId:requestId, ok:false, error:String(e && (e.stack || e.message) || e) }, '*');
      }
    });
  });
})();
