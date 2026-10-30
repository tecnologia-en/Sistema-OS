#!/usr/bin/env python3
"""Offline ControlPay audit: interpret SANITIZED snapshots, never move money.

No HTTP, browser, USB, Wine, keys, database writes, or financial actions.
A local timeout is NOT the provider's definitive expired status (15).
This file does not authorize or initiate a retry, even after a final status.
"""
from __future__ import annotations

import argparse
from dataclasses import asdict, dataclass
from datetime import datetime
import json
from pathlib import Path
from typing import Any, Iterable, Mapping

# PayGo official "Valores de status, IDs e tipos", checked 2026-10-30.
STATUS_LABELS = {
    5: "Pendente",
    6: "Em pagamento",
    10: "Creditado",
    15: "Expirado",
    18: "Cancelamento iniciado",
    19: "Em cancelamento",
    20: "Cancelado",
    25: "Pagamento recusado",
}
EXTERNAL_PAYMENT_STATUSES = {5, 10, 15}  # Pending, in progress, completed
EXTERNAL_TYPES = {5, 10, 15}  # Sale, cancellation, administrative
MAX_TRACE_SNAPSHOTS = 256
MAX_TRACE_BYTES = 1024 * 1024
# Raw API replies may include payment credentials, PAN or device details.
# Refuse them: only deliberately sanitized fields are supported.
ALLOWED_SNAPSHOT_KEYS = frozenset({
    "id", "terminal_id", "reference", "amount", "method",
    "status_id", "status", "payment_status_id", "payment_status",
    "external_count", "external_payment_type_id", "auth_present",
    "nsu_present", "observed_at", "error",
})
SUCCESSFUL_SALE = 10
SUCCESSFUL_CANCEL = 20
FINAL_SALE_STATUS = {10: "APROVADA", 15: "EXPIRADA", 20: "CANCELADA", 25: "RECUSADA"}
# Known normal next states; anything else needs human reconciliation.
ALLOWED_TRANSITIONS: dict[int, set[int]] = {
    5: {5, 6, 10, 15, 25},
    6: {6, 10, 15, 25},
    10: {10, 18, 19, 20},
    18: {18, 19, 20, 10},  # 10 may indicate a failed cancellation, not success
    19: {19, 20, 10},
    15: {15},
    20: {20},
    25: {25},
}


@dataclass(frozen=True)
class AuditResult:
    intent_id: int
    operation: str
    outcome: str
    definitive: bool
    observed_statuses: tuple[int, ...]
    offline: bool = True
    # Deliberately always false: a second charge must require a fresh decision.
    automatic_retry_allowed: bool = False

    def as_dict(self) -> dict[str, Any]:
        output = asdict(self)
        output["observed_statuses"] = list(self.observed_statuses)
        return output


@dataclass(frozen=True)
class PendingAudit:
    terminal_id: int
    outcome: str
    observed_open_ids: tuple[int, ...]
    checked_statuses: tuple[int, ...]
    complete: bool
    # The real ControlPay API may return recordsFiltered=null. Four HTTP 200
    # replies alone do NOT prove complete historical pagination.
    coverage_verified: bool = False
    offline: bool = True
    # Race conditions, other terminals and stale server replicas mean even
    # four empty snapshots must never cause automatic new sales.
    automatic_new_sale_allowed: bool = False

    def as_dict(self) -> dict[str, Any]:
        data = asdict(self)
        data["observed_open_ids"] = list(self.observed_open_ids)
        data["checked_statuses"] = list(self.checked_statuses)
        return data


def audit_open_status_batches(
    batches: Mapping[int, Mapping[str, Any]],
    *,
    terminal_id: int,
) -> PendingAudit:
    """Validate four distinct, sanitized GetByFiltros responses without dates.

    Caller must obtain responses for statuses 5,6,18,19 from the sandbox.
    Payload shape: {status_id: {"http_status": 200, "rows": [sanitized..],
    "recordsFiltered": number_or_null}}. Never approves or repeats payment.
    """
    expected = (5, 6, 18, 19)
    if type(terminal_id) is not int or terminal_id <= 0:
        raise ValueError("Invalid expected terminal")
    pending: set[int] = set()
    checked: list[int] = []
    coverage_verified = True

    def result(state: str, complete: bool = False) -> PendingAudit:
        return PendingAudit(terminal_id, state, tuple(sorted(pending)),
                            tuple(checked), complete,
                            coverage_verified if complete else False)

    if not isinstance(batches, Mapping) or set(batches) != set(expected):
        return result("FILTROS_DE_STATUS_INCOMPLETOS")

    for status_id in expected:
        response = batches[status_id]
        if not isinstance(response, Mapping):
            return result("RESPOSTA_INVALIDA")
        if "error" in response:
            return result("CONSULTA_DE_STATUS_FALHOU")
        if type(response.get("http_status")) is not int or response["http_status"] != 200:
            return result("CONSULTA_DE_STATUS_FALHOU")
        rows = response.get("rows")
        if not isinstance(rows, list) or len(rows) > MAX_TRACE_SNAPSHOTS:
            return result("RESPOSTA_INVALIDA")
        count = response.get("recordsFiltered")
        if count is None:
            coverage_verified = False
        elif type(count) is not int or count != len(rows):
            return result("PAGINACAO_NAO_CONFERIDA")
        for row in rows:
            if not isinstance(row, Mapping):
                return result("RESPOSTA_INVALIDA")
            if not set(row).issubset(ALLOWED_SNAPSHOT_KEYS):
                return result("RESPOSTA_NAO_SANITIZADA")
            if type(row.get("id")) is not int or row["id"] <= 0:
                return result("IDENTIDADE_DA_INTENCAO_INVALIDA")
            if type(row.get("terminal_id")) is not int or row["terminal_id"] != terminal_id:
                return result("TERMINAL_INCONSISTENTE")
            if type(row.get("status_id")) is not int or row["status_id"] != status_id:
                return result("STATUS_INCONSISTENTE")
            if row["id"] in pending:
                # The same intention cannot simultaneously occupy two status
                # buckets in an atomic view. Provider changed while polling.
                return result("CONSULTAS_NAO_ATOMICAS_INCONSISTENTES")
            pending.add(row["id"])
        checked.append(status_id)
    return result("PENDENCIAS_ENCONTRADAS" if pending else
                  "SEM_PENDENCIAS_OBSERVADAS", complete=True)


def _valid_identity(value: Any) -> bool:
    return isinstance(value, str) and bool(value.strip())


def validate_filter_proof(
    proof: Mapping[str, Any] | None,
    *,
    last: Mapping[str, Any],
    terminal_id: int,
) -> bool:
    """Verify a second SANITIZED GetByFiltros result for the exact intention.

    Required fields: source, id, terminal_id, reference, amount, status_id.
    A GetById reply with terminal=null is NOT evidence of terminal identity.
    """
    if not isinstance(proof, Mapping):
        return False
    allowed = {"source", "id", "terminal_id", "reference", "amount",
               "status_id", "method"}
    if not set(proof).issubset(allowed):
        return False
    if proof.get("source") != "GetByFiltros":
        return False
    if type(proof.get("id")) is not int or proof["id"] != last["id"]:
        return False
    if type(proof.get("terminal_id")) is not int or proof["terminal_id"] != terminal_id:
        return False
    if type(proof.get("status_id")) is not int or proof["status_id"] != last["status_id"]:
        return False
    if not _valid_identity(proof.get("reference")) or proof["reference"] != last.get("reference"):
        return False
    if not _valid_identity(proof.get("amount")) or proof["amount"] != last.get("amount"):
        return False
    if "method" in proof and "method" in last and proof["method"] != last["method"]:
        return False
    return True


def audit_trace(
    snapshots: Iterable[Mapping[str, Any]],
    *,
    intent_id: int,
    operation: str = "sale",
    terminal_id: int | None = None,
    reference: str | None = None,
    amount: str | None = None,
    terminal_proof: Mapping[str, Any] | None = None,
) -> AuditResult:
    """Read the ENTIRE ordered trace; do not stop at the first 'creditado'.

    Missing/malformed identity, conflicting transitions, or stale/unconfirmed
    cancellation are all inconclusive, never permission to repeat a sale.

    terminal_id/reference/amount are expected values for *these* snapshots,
    not credentials. Supply them when the API exposes them. Null terminal on
    GetById cannot prove a particular terminal (observed on PayGo DEMO).
    """
    if operation not in ("sale", "cancel"):
        raise ValueError("Operation must be sale or cancel")
    if type(intent_id) is not int or intent_id <= 0:
        raise ValueError("Invalid intent ID")
    if terminal_id is not None and (type(terminal_id) is not int or terminal_id <= 0):
        raise ValueError("Invalid terminal ID")
    if reference is not None and not _valid_identity(reference):
        raise ValueError("Invalid expected reference")
    if amount is not None and not _valid_identity(amount):
        raise ValueError("Invalid expected amount")

    observed: list[int] = []
    last: Mapping[str, Any] | None = None
    ever_cancel_attempt = False
    seen_reference: str | None = None
    seen_amount: str | None = None
    last_external_count: int | None = None
    last_error = False
    previous_timestamp: datetime | None = None
    any_timestamp = False
    missing_timestamp = False

    def result(outcome: str, definitive: bool = False) -> AuditResult:
        return AuditResult(intent_id, operation, outcome, definitive, tuple(observed))

    for index, snapshot in enumerate(snapshots):
        if index >= MAX_TRACE_SNAPSHOTS:
            return result("HISTORICO_EXCEDE_LIMITE")
        if not isinstance(snapshot, Mapping):
            raise ValueError("Snapshot must be a mapping")
        if not set(snapshot).issubset(ALLOWED_SNAPSHOT_KEYS):
            return result("CAMPOS_NAO_SANITIZADOS")
        if "observed_at" in snapshot:
            # Require offset-aware timestamps; naive timestamps can conceal
            # clock drift after VM resume and reordering between poll cycles.
            observed_at = snapshot["observed_at"]
            if not isinstance(observed_at, str):
                return result("HORARIO_INVALIDO")
            try:
                dt = datetime.fromisoformat(observed_at)
            except ValueError:
                return result("HORARIO_INVALIDO")
            if dt.utcoffset() is None:
                return result("HORARIO_SEM_FUSO")
            if previous_timestamp is not None and dt < previous_timestamp:
                return result("HORARIO_REGREDIU")
            previous_timestamp = dt
            any_timestamp = True
        else:
            missing_timestamp = True
        if "error" in snapshot:
            # Last known state can be stale: previous approval/cancel may have
            # changed while the client failed to poll the provider.
            last_error = True
            last = None
            continue

        if type(snapshot.get("id")) is not int or snapshot["id"] != intent_id:
            raise ValueError("Wrong intention ID in status response")

        remote_terminal = snapshot.get("terminal_id")
        if remote_terminal is not None:
            if type(remote_terminal) is not int or remote_terminal <= 0:
                return result("TERMINAL_INVALIDO_NAO_REPROCESSAR")
            if terminal_id is not None and remote_terminal != terminal_id:
                raise ValueError("Wrong physical/logical terminal in response")

        current_ref = snapshot.get("reference")
        if current_ref is not None:
            if not _valid_identity(current_ref):
                return result("REFERENCIA_INVALIDA_NAO_REPROCESSAR")
            if reference is not None and current_ref != reference:
                raise ValueError("Wrong reference in status response")
            if seen_reference is not None and seen_reference != current_ref:
                raise ValueError("Reference changed during intent status history")
            seen_reference = current_ref
        current_amount = snapshot.get("amount")
        if current_amount is not None:
            if not _valid_identity(current_amount):
                return result("VALOR_INVALIDO_NAO_REPROCESSAR")
            if amount is not None and current_amount != amount:
                raise ValueError("Wrong amount in status response")
            if seen_amount is not None and seen_amount != current_amount:
                raise ValueError("Amount changed during intent status history")
            seen_amount = current_amount

        current = snapshot.get("status_id")
        if type(current) is not int:
            raise ValueError("Missing or invalid ControlPay status")
        if current not in STATUS_LABELS:
            return result("STATUS_DESCONHECIDO_NAO_REPROCESSAR")
        if observed and current not in ALLOWED_TRANSITIONS[observed[-1]]:
            observed.append(current)
            return result("TRANSICAO_INCONSISTENTE_NAO_REPROCESSAR")
        observed.append(current)

        payment_status = snapshot.get("payment_status_id")
        if payment_status is not None and (
            type(payment_status) is not int
            or payment_status not in EXTERNAL_PAYMENT_STATUSES
        ):
            return result("STATUS_EXTERNO_DESCONHECIDO")
        payment_type = snapshot.get("external_payment_type_id")
        if payment_type is not None and (
            type(payment_type) is not int or payment_type not in EXTERNAL_TYPES
        ):
            return result("TIPO_EXTERNO_DESCONHECIDO")

        external_count = snapshot.get("external_count")
        if external_count is not None:
            if type(external_count) is not int or external_count < 0:
                return result("CONTAGEM_EXTERNA_INVALIDA")
            if last_external_count is not None and external_count < last_external_count:
                return result("CONTAGEM_EXTERNA_REGREDIU")
            last_external_count = external_count

        if current in (18, 19, 20):
            ever_cancel_attempt = True
        last = snapshot
        last_error = False

    if last_error:
        return result("CONSULTA_FALHOU_ESTADO_DESCONHECIDO")
    if any_timestamp and missing_timestamp:
        return result("HORARIO_INCOMPLETO")
    if not observed or last is None:
        return result("TIMEOUT_LOCAL_ESTADO_DESCONHECIDO")
    if terminal_id is None:
        return result("TERMINAL_ESPERADO_NAO_INFORMADO")
    if last.get("terminal_id") is None and not validate_filter_proof(
        terminal_proof, last=last, terminal_id=terminal_id
    ):
        return result("TERMINAL_NAO_COMPROVADO")
    if reference is not None and last.get("reference") is None:
        return result("REFERENCIA_NAO_COMPROVADA")
    if amount is not None and last.get("amount") is None:
        return result("VALOR_NAO_COMPROVADO")

    current = observed[-1]
    external_status = last.get("payment_status_id")
    external_type = last.get("external_payment_type_id")
    external_count = last.get("external_count")

    if current in (18, 19):
        return result("CANCELAMENTO_PENDENTE_NAO_REPETIR")
    if operation == "cancel":
        if current != SUCCESSFUL_CANCEL:
            # 10 is the approved SALE, and is never proof of a refund.
            return result("CANCELAMENTO_NAO_CONFIRMADO")
    if ever_cancel_attempt and current == SUCCESSFUL_SALE:
        # A cancellation may have failed, leaving the sale approved. This
        # needs explicit reconciliation before calling it final.
        return result("CANCELAMENTO_NAO_CONFIRMADO")

    if current not in FINAL_SALE_STATUS:
        return result("TRANSACAO_PENDENTE_NAO_REPETIR")

    # When external status is explicitly provided, only 'Finalizado' (15)
    # supports declaring the final intent reconciled.
    if external_status is not None and external_status != 15:
        return result("PAGAMENTO_EXTERNO_PENDENTE")

    if current == SUCCESSFUL_CANCEL:
        # There may be multiple external payments in ONE intent: original
        # charge and cancellation. If the provider includes metadata, demand
        # consistency with the cancellation. Missing metadata is not proof
        # of failure: official intention status 20 is itself definitive.
        if external_type is not None and external_type != 10:
            return result("CANCELAMENTO_EXTERNO_NAO_COMPROVADO")
        if external_count is not None and external_count < 2:
            return result("CANCELAMENTO_EXTERNO_NAO_COMPROVADO")
    elif current == SUCCESSFUL_SALE and external_type == 10:
        return result("PAGAMENTO_EXTERNO_INCONSISTENTE")

    if operation == "sale":
        return result(FINAL_SALE_STATUS[current], True)
    return result("CANCELADA", True)


def main() -> int:
    ap = argparse.ArgumentParser(description="Offline PayGo status audit (JSON already sanitized)")
    ap.add_argument("--trace", type=Path, required=True)
    ap.add_argument("--id", type=int, required=True)
    ap.add_argument("--operation", choices=("sale", "cancel"), default="sale")
    ap.add_argument("--terminal", type=int)
    ap.add_argument("--reference", help="Expected sanitized transaction reference")
    ap.add_argument("--amount", help='Expected amount, e.g. "1,00"')
    ap.add_argument("--filtered-proof", type=Path,
                    help="Separate sanitized GetByFiltros evidence for terminal=null")
    args = ap.parse_args()
    if args.trace.stat().st_size > MAX_TRACE_BYTES:
        ap.error("trace exceeds the 1 MiB offline safety limit")
    raw = json.loads(args.trace.read_text(encoding="utf-8"))
    if not isinstance(raw, list):
        ap.error("--trace must be a JSON array of sanitized status snapshots")
    proof = None
    if args.filtered_proof is not None:
        if args.filtered_proof.stat().st_size > 32 * 1024:
            ap.error("filtered proof exceeds the 32 KiB safety limit")
        proof = json.loads(args.filtered_proof.read_text(encoding="utf-8"))
    audited = audit_trace(
        raw, intent_id=args.id, operation=args.operation, terminal_id=args.terminal,
        reference=args.reference, amount=args.amount, terminal_proof=proof,
    )
    print(json.dumps(audited.as_dict(), ensure_ascii=False, sort_keys=True))
    return 0 if audited.definitive else 2


if __name__ == "__main__":
    raise SystemExit(main())
