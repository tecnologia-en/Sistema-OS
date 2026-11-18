(function () {
  'use strict';
  if (window.__ENFOQUE_OFFLINE_IMPORT_BRIDGE_V6__) return;
  window.__ENFOQUE_OFFLINE_IMPORT_BRIDGE_V6__ = true;

  function post(type, payload) {
    window.postMessage({ source: 'ENFOQUE_OFFLINE_IMPORT_PAGE', type: type, payload: payload || {} }, '*');
  }
  function log(message) { post('IMPORT_LOG', { message: String(message || '') }); }
  function cleanBearer(value) {
    var s = String(value || '').trim().replace(/^Bearer\s+/i, '');
    return s && s.length > 20 ? s : '';
  }
  function bearer() {
    var candidates = [window.__enfoqueLatestBearer, window.token, window.accessToken, window.authToken];
    for (var i = 0; i < candidates.length; i++) { var t = cleanBearer(candidates[i]); if (t) return t; }
    try {
      for (var j = 0; j < localStorage.length; j++) {
        var key = localStorage.key(j); var v = localStorage.getItem(key);
        if (/token|bearer|auth/i.test(String(key || ''))) { var x = cleanBearer(v); if (x) return x; }
      }
    } catch (_) {}
    return '';
  }
  function angularScope(el) {
    try {
      if (!window.angular || !el) return null;
      var ae = window.angular.element(el);
      return ae.scope && (ae.scope() || (ae.isolateScope && ae.isolateScope()));
    } catch (_) { return null; }
  }
  function firstObject(scope, names) {
    for (var i = 0; scope && i < names.length; i++) {
      var v = scope[names[i]];
      if (v && typeof v === 'object') return v;
    }
    return null;
  }
  function selectedSeller() {
    var sel = document.querySelector('#DropVendedor');
    if (!sel || !sel.value || String(sel.value) === '0') throw new Error('Selecione o vendedor no MeuSIGE.');
    var scope = angularScope(sel);
    var seller = firstObject(scope, ['vendedor', 'Vendedor', 'vendedorSelecionado', 'selectedVendedor']);
    if (!seller && scope) {
      Object.keys(scope).some(function (k) {
        var v = scope[k];
        if (v && typeof v === 'object' && (v.Id || v.id) && /vendedor/i.test(k)) { seller = v; return true; }
        return false;
      });
    }
    if (!seller) {
      var opt = sel.options && sel.selectedIndex >= 0 ? sel.options[sel.selectedIndex] : null;
      seller = { Id: String(sel.value), Nome: String(opt && opt.textContent || '').trim(), Email: '', UserName: null };
    }
    return seller;
  }
  function selectedCompany(initData) {
    var selectors = ['#DropEmpresa', '#dropEmpresa', 'select[ng-model*="empresa"]', 'select[ng-model*="Empresa"]'];
    for (var i = 0; i < selectors.length; i++) {
      var el = document.querySelector(selectors[i]);
      var scope = angularScope(el);
      var company = firstObject(scope, ['empresa', 'Empresa', 'empresaSelecionada', 'selectedEmpresa']);
      if (company) return company;
    }
    var bodyScope = angularScope(document.body);
    var fromBody = firstObject(bodyScope, ['empresa', 'Empresa', 'empresaSelecionada', 'selectedEmpresa']);
    if (fromBody) return fromBody;
    var companies = initData && (initData.Empresas || initData.empresas || initData.EmpresasDisponiveis);
    if (Array.isArray(companies) && companies.length === 1) return companies[0];
    if (Array.isArray(companies) && companies.length) {
      var activeName = '';
      var companySelect = document.querySelector('#DropEmpresa,select[ng-model*="empresa"],select[ng-model*="Empresa"]');
      if (companySelect && companySelect.selectedIndex >= 0) activeName = String(companySelect.options[companySelect.selectedIndex].textContent || '').trim().toLowerCase();
      var match = companies.find(function (c) { return activeName && String(c.Nome || c.NomeFantasia || '').trim().toLowerCase() === activeName; });
      if (match) return match;
      return companies[0];
    }
    throw new Error('Não foi possível identificar a empresa ativa no MeuSIGE.');
  }
  async function api(path, options) {
    var token = bearer();
    if (!token) throw new Error('Bearer do MeuSIGE ainda não foi capturado. Recarregue a página do PDV e aguarde alguns segundos.');
    var response = await fetch(path, Object.assign({
      credentials: 'include',
      cache: 'no-store',
      headers: { 'Authorization': 'Bearer ' + token, 'Accept': 'application/json, text/plain, */*', 'Content-Type': 'application/json;charset=UTF-8', 'X-Requested-With': 'XMLHttpRequest' }
    }, options || {}));
    var text = await response.text();
    var data = null;
    try { data = JSON.parse(text); } catch (_) { data = text; }
    if (!response.ok) throw new Error('MeuSIGE retornou HTTP ' + response.status + ': ' + String((data && (data.Mensagem || data.message || data.error)) || text || 'erro'));
    return data;
  }
  function normalizePaymentMethod(value) {
    var raw = String(value || '').trim();
    var key = raw.toLocaleLowerCase('pt-BR')
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    var map = {
      'cartao de credito': 'Cartão de Crédito',
      'cartao de debito': 'Cartão de Débito',
      'pix (maquina)': 'Pix (Máquina)',
      'pix maquina': 'Pix (Máquina)',
      'pix (cnpj)': 'Pix (CNPJ)',
      'pix cnpj': 'Pix (CNPJ)',
      'dinheiro': 'Dinheiro',
      'cheque': 'Cheque',
      'credito loja': 'Crédito Loja',
      'vale presente': 'Vale Presente',
      '15 dias fora mes': '15 DIAS FORA MÊS',
      'outros': 'Outros',
      'vale/cupom desconto': 'Vale/Cupom Desconto'
    };
    return map[key] || raw;
  }
  function mapPayment(p) {
    p = p || {};
    var method = normalizePaymentMethod(p.FormaPagamento || p.method || '');
    var amount = Number(p.ValorPagamento != null ? p.ValorPagamento : Number(p.amountCents || 0) / 100);
    var requestedInstallments = Math.max(0, Number(p.Parcelas || 0));
    var isCreditCard = method === 'Cartão de Crédito';
    var installments = isCreditCard && requestedInstallments <= 1 ? 0 : requestedInstallments;
    var paymentCondition = isCreditCard && requestedInstallments > 1 ? '1' : '0';
    return {
      ValorPagamento: Math.round(amount * 100) / 100,
      FormaPagamento: method,
      GeradoAutomaticamente: true,
      DescricaoPagamento: 'Pagamento recebido em ' + method,
      BandeiraCartao: String(p.BandeiraCartao || ''),
      CredenciadoraCartao: String(p.CredenciadoraCartao || ''),
      CV_NSU: String(p.CV_NSU || ''),
      CondicaoPagamento: paymentCondition,
      Parcelas: installments,
      PeriodoParcelas: Number(p.PeriodoParcelas || 30),
      PeriodoParcelasOutros: Number(p.PeriodoParcelasOutros || 0),
      idPagamento: String(p.idPagamento || (crypto.randomUUID ? crypto.randomUUID() : Date.now() + '-' + Math.random())),
      CodigoVale: Number(p.CodigoVale || 0),
      Valido: true,
      '$$hashKey': 'offpay' + Math.random().toString(16).slice(2, 5)
    };
  }
  async function importSale(sale) {
    log('Lendo sessão, caixa e empresa ativos...');
    var init = await api('/api/v2/pdv/GetDadosInit', { method: 'GET' });
    var seller = selectedSeller();
    var company = selectedCompany(init);
    log('Vendedor: ' + String(seller.Nome || seller.Email || seller.Id || 'selecionado'));
    log('Empresa: ' + String(company.Nome || company.NomeFantasia || company.Id || 'ativa'));

    var products = [];
    var items = Array.isArray(sale.items) ? sale.items : [];
    if (!items.length) throw new Error('A venda local não possui produtos.');
    for (var i = 0; i < items.length; i++) {
      var item = items[i] || {};
      var code = String(item.ean || item.code || '').trim();
      if (!code) throw new Error('Produto sem código na posição ' + (i + 1) + '.');
      log('Consultando produto ' + (i + 1) + '/' + items.length + ': ' + code);
      var product = await api('/api/v2/pdv/GetProduto', {
        method: 'POST',
        body: JSON.stringify({ data: 'null', arg: code, arg2: JSON.stringify(company), arg3: JSON.stringify(seller) })
      });
      if (!product || product.Encontrou === false || !product.Id) throw new Error(product && product.Mensagem || ('Produto não encontrado no MeuSIGE: ' + code));
      var qty = Math.max(1, Number(item.quantity || 1));
      var unit = Number(item.unitPriceCents || 0) / 100;
      if (!(unit > 0)) unit = Number(product.ValorUnitario || product.ValorUnitarioOriginal || 0);
      product.Quantidade = qty;
      product.ValorUnitario = Math.round(unit * 100) / 100;
      product.ValorUnitarioOriginal = Number(product.ValorUnitarioOriginal || product.ValorUnitario);
      product.ValorTotal = Math.round(product.ValorUnitario * qty * 100) / 100;
      // O MeuSIGE usa o vendedor enviado no GetProduto. No payload real de savevenda,
      // UsuarioVendedor permanece vazio; sobrescrever com e-mail causa divergencia.
      product.UsuarioVendedor = String(product.UsuarioVendedor || '');
      product.ComissaoVendedor = Number(product.ComissaoVendedor || 0);
      product['$$hashKey'] = 'offprod' + String(i + 1).padStart(3, '0');
      products.push(product);
    }

    var payments = (sale.payments || []).map(mapPayment);
    if (!payments.length) throw new Error('A venda local não possui pagamentos.');
    var totalPayments = payments.reduce(function (sum, p) { return sum + Number(p.ValorPagamento || 0); }, 0);
    var totalSale = Number(sale.totalCents || 0) / 100 - Number(sale.discountCents || 0) / 100;
    if (Math.round(totalPayments * 100) < Math.round(totalSale * 100)) throw new Error('O total dos pagamentos é menor que o total da venda.');

    var customer = sale.customer && typeof sale.customer === 'object' ? sale.customer : { DataNascimento: '' };
    var discount = (Number(sale.discountCents || 0) / 100).toFixed(2).replace('.', ',');
    var payload = {
      data: JSON.stringify(products),
      arg: JSON.stringify(customer),
      arg2: JSON.stringify(payments),
      arg3: JSON.stringify(discount),
      arg4: 'false',
      arg5: JSON.stringify(''),
      arg8: JSON.stringify('')
    };

    log('Enviando venda diretamente ao savevenda...');
    var saved = await api('/api/v2/pdv/savevenda', { method: 'POST', headers: { 'Authorization': 'Bearer ' + bearer(), 'Accept': 'application/json, text/plain, */*', 'Content-Type': 'application/json;charset=UTF-8', 'X-Requested-With': 'XMLHttpRequest', 'X-Enfoque-Offline-Import': '1' }, body: JSON.stringify(payload) });
    if (!Array.isArray(saved) || !saved[0] || !saved[1]) throw new Error('Resposta inesperada do savevenda. A venda local não será marcada como concluída.');
    if (String(saved[0]).toUpperCase() !== 'NFCE') throw new Error('O MeuSIGE retornou fluxo ' + saved[0] + ', não NFCE. Venda criada, mas não marcada como concluída.');
    var vendaId = String(saved[1]);
    log('Pedido criado: ' + vendaId + '. Emitindo NFC-e...');
    var fiscal = await api('/api/v2/PDV/EmitirNFCe', {
      method: 'POST',
      body: JSON.stringify({ data: vendaId, arg: JSON.stringify(products), arg2: false })
    });
    if (!(fiscal && (fiscal.Sucesso === true || fiscal.sucesso === true))) {
      throw new Error((fiscal && (fiscal.Mensagem || fiscal.message || fiscal.Error)) || 'Pedido criado, mas a NFC-e não foi autorizada.');
    }
    log('NFC-e autorizada.');
    return { saved: saved, fiscal: fiscal, vendaId: vendaId };
  }

  window.addEventListener('message', function (event) {
    var d = event.data || {};
    if (event.source !== window || d.source !== 'ENFOQUE_OFFLINE_IMPORT_CONTENT' || d.type !== 'RUN_DIRECT_IMPORT') return;
    (async function () {
      try {
        var result = await importSale(d.sale || {});
        post('DIRECT_IMPORT_RESULT', { ok: true, result: result });
      } catch (error) {
        post('DIRECT_IMPORT_RESULT', { ok: false, message: String(error && error.message || error) });
      }
    })();
  });
})();
