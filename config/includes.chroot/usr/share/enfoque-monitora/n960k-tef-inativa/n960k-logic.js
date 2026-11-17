/* Enfoque - payment DOM logic, independent of network / AOA. No payment confirmation. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.EnfoqueN960KLogic = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  function plain(text) {
    return String(text == null ? '' : text).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim();
  }
  function centsFromBRL(text) {
    const raw = String(text == null ? '' : text).trim().replace(/[R$\s]/gi, '');
    if (!raw || !/^\d[\d.,]*$/.test(raw)) return null;
    let normalized;
    if (raw.includes(',')) {
      if (!/^(?:\d{1,3}(?:\.\d{3})*|\d+)(?:,\d{1,3})?$/.test(raw)) return null;
      normalized = raw.replace(/\./g, '').replace(',', '.');
    } else if (raw.includes('.')) {
      // SIGE uses pt-BR; a lone dot with 3 trailing digits is a grouping separator.
      normalized = /\.\d{3}$/.test(raw) ? raw.replace(/\./g, '') : raw;
      if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) return null;
    } else {
      normalized = raw;
    }
    const amount = Number(normalized);
    if (!Number.isFinite(amount) || amount < 0 || amount > 1000000) return null;
    return Math.round(amount * 100);
  }
  function paymentType(text) {
    const t = plain(text).toLowerCase();
    if (!t) return null;
    if (t.includes('pix (cnpj)') || t.includes('pix cnpj')) return null; // transfer != maquininha
    if (t.includes('pix')) return 'PIX';
    if (t.includes('cartao de debito') || /\bdebito\b/.test(t)) return 'DEBIT';
    if (t.includes('cartao de credito') || /\bcredito\b/.test(t) && !t.includes('credito loja')) return 'CREDIT';
    return null; // cash, boleto, credit loja etc never sent
  }
  function installmentRange(creditDescriptor) {
    const descriptor=plain(creditDescriptor||'').toLowerCase();
    const m=descriptor.match(/(?:^|\b)(?:de\s+)?([2-9]|1[0-2])\s*x?\s*(?:a|ate|-)\s*([2-9]|1[0-2])\s*x?(?:\b|$)/i);
    if(!m)return null;
    const min=Number(m[1]),max=Number(m[2]);
    return min>=2&&max<=12&&min<=max?{min,max}:null;
  }
  function installmentsKind(row) {
    if (row.method !== 'CREDIT') return 'none';
    const condition = String(row.condition || '').trim();
    const descriptor = plain(row.creditDescriptor || '').toLowerCase();
    const field = String(row.installmentsField || '').trim();
    const installments = /^\d{1,2}$/.test(field) ? Number(field) : null;
    // Faixas como "Credito - 2 a 5", "2X a 6X", "7X a 12X" nao sao o numero exato.
    const hasRange = Boolean(installmentRange(descriptor));
    if (hasRange || /parcelad|a prazo/.test(descriptor) ||
        (Number.isInteger(installments) && installments > 1 && installments <= 12) ||
        condition === '1') return 'parcelado';
    if (/\b1\s*x\b|a vista/.test(descriptor) || condition === '0') return 'vista';
    return 'unknown';  // exige confirmacao do operador antes de definir 1x ou N parcelas
  }
  function ensureRows(rows, saleTotalCents = null) {
    if (!Array.isArray(rows) || rows.length > 24) throw new Error('Quantidade de pagamentos invalida.');
    const normalized = rows.map((row, i) => {
      const method = paymentType(row.methodText);
      const cents = centsFromBRL(row.amountText);
      if (cents == null || cents <= 0) throw new Error('Valor invalido no pagamento da linha ' + (i + 1));
      return {
        id: 'p' + i, index: i, method, amountCents: cents,
        methodText: String(row.methodText || '').slice(0, 130),
        creditDescriptor: String(row.creditDescriptor || '').slice(0, 130),
        condition: String(row.condition || ''),
        installmentsField: String(row.installmentsField || ''),
        kind: method === 'CREDIT' ? installmentsKind({ method, creditDescriptor: row.creditDescriptor, condition: row.condition, installmentsField: row.installmentsField }) : 'none',
        terminal: method !== null
      };
    });
    if (saleTotalCents != null && normalized.length) {
      const sum = normalized.reduce((n, p) => n + p.amountCents, 0);
      if (Math.abs(sum - saleTotalCents) > 1) throw new Error('Soma dos pagamentos diverge do total do pedido (' + sum + ' != ' + saleTotalCents + ' centavos).');
    }
    return normalized;
  }
  function rowFingerprint(rows) {
    return JSON.stringify(rows.map(r => [r.methodText, r.amountCents, r.condition, r.creditDescriptor, r.installmentsField]));
  }
  function receiptSummary(rows) {
    return rows.filter(r => r.terminal).map(r => ({
      index: r.index, amountCents: r.amountCents, method: r.method,
      installments: r.method === 'CREDIT' ? (r.kind === 'vista' ? 1 : null) : 1,
      needsModal: r.method === 'CREDIT' && r.kind !== 'vista'
    }));
  }
  return {plain, centsFromBRL, paymentType, installmentsKind, installmentRange, ensureRows, rowFingerprint, receiptSummary};
});

