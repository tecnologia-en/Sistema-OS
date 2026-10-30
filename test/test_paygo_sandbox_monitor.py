"""Deterministic, credential-free ControlPay sandbox status regression suite.

Only status replays; no sales, PIN-pad input, network or customer accounts.
"""
import importlib.util
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
MODULE_PATH = ROOT / "scripts/paygo_sandbox_monitor.py"
SPEC = importlib.util.spec_from_file_location("paygo_sandbox_monitor", MODULE_PATH)
import sys as _sys
monitor = importlib.util.module_from_spec(SPEC)
_sys.modules[SPEC.name] = monitor
SPEC.loader.exec_module(monitor)


def step(intent_id, status_id, *, terminal=7057, external=None):
    result = {"id": intent_id, "terminal_id": terminal, "status_id": status_id}
    if external is not None:
        result["payment_status_id"] = external
    return result


class ControlPayStatusReplayTests(unittest.TestCase):
    def check(self, name, steps, expected, *, mode="sale", terminal=7057, definitive=True):
        with self.subTest(name=name):
            result = monitor.audit_trace(
                steps, intent_id=887001, operation=mode, terminal_id=terminal
            )
            self.assertEqual(result.outcome, expected)
            self.assertEqual(result.definitive, definitive)
            self.assertTrue(result.offline)
            self.assertEqual(result.intent_id, 887001)
            self.assertEqual(result.operation, mode)

    def test_authorized_card_and_auto_pix(self):
        self.check("debit_approved",
                   [step(887001, 5), step(887001, 6), step(887001, 10, external=15)],
                   "APROVADA")
        self.check("pix_auto_approved",
                   [step(887001, 5), step(887001, 6), step(887001, 10)],
                   "APROVADA")

    def test_card_denied(self):
        self.check("credit_denied", [step(887001, 6), step(887001, 25, external=15)],
                   "RECUSADA")

    def test_provider_expired_is_definitive(self):
        self.check("provider_expired", [step(887001, 5), step(887001, 15)],
                   "EXPIRADA")

    def test_local_poll_timeout_is_not_provider_expiration(self):
        self.check("poll_timeout", [step(887001, 5), step(887001, 6)],
                   "TRANSACAO_PENDENTE_NAO_REPETIR", definitive=False)
        self.check("no_response", [], "TIMEOUT_LOCAL_ESTADO_DESCONHECIDO",
                   definitive=False)

    def test_network_error_is_uncertain_never_a_new_sale(self):
        self.check("network_error", [step(887001, 6), {"error": "HTTP timeout"}],
                   "CONSULTA_FALHOU_ESTADO_DESCONHECIDO", definitive=False)

    def test_cancel_after_approved_must_not_stop_at_creditado(self):
        self.check("after_approval",
                   [step(887001, 10), step(887001, 18), step(887001, 19),
                    step(887001, 20, external=15)], "CANCELADA", mode="cancel")

    def test_cancel_status_pending_is_uncertain(self):
        self.check("cancel_pending",
                   [step(887001, 10), step(887001, 18), step(887001, 19)],
                   "CANCELAMENTO_PENDENTE_NAO_REPETIR", mode="cancel",
                   definitive=False)

    def test_cancel_status_25_not_assumed_success(self):
        self.check("cancel_denial_not_final",
                   [step(887001, 10), step(887001, 25)],
                   "TRANSICAO_INCONSISTENTE_NAO_REPROCESSAR", mode="cancel",
                   definitive=False)

    def test_approved_with_external_payment_still_processing(self):
        self.check("external_awaited",
                   [step(887001, 10, external=10)],
                   "PAGAMENTO_EXTERNO_PENDENTE", definitive=False)
        self.check("external_final",
                   [step(887001, 10, external=10), step(887001, 10, external=15)],
                   "APROVADA")

    def test_duplicate_poll_is_safe(self):
        res = monitor.audit_trace([step(887001, 5), step(887001, 6),
                                   step(887001, 6), step(887001, 10)],
                                  intent_id=887001, terminal_id=7057)
        self.assertEqual(res.observed_statuses, (5, 6, 6, 10))
        self.assertTrue(res.definitive)

    def test_unknown_status_not_accepted(self):
        self.check("unknown", [step(887001, 999)],
                   "STATUS_DESCONHECIDO_NAO_REPROCESSAR", definitive=False)

    def test_unknown_payment_status_not_accepted(self):
        self.check("external_unknown", [step(887001, 10, external=999)],
                   "STATUS_EXTERNO_DESCONHECIDO", definitive=False)

    def test_cross_transaction_and_cross_terminal_rejected(self):
        with self.assertRaisesRegex(ValueError, "Wrong intention"):
            monitor.audit_trace([step(887002, 10)], intent_id=887001)
        with self.assertRaisesRegex(ValueError, "Wrong physical"):
            monitor.audit_trace([step(887001, 10, terminal=6928)], intent_id=887001,
                                terminal_id=7057)

    def test_missing_terminal_proof_fails_closed(self):
        sample={"id":887001, "status_id":10, "terminal_id":None}
        result=monitor.audit_trace([sample], intent_id=887001, terminal_id=7057)
        self.assertFalse(result.definitive)
        self.assertEqual(result.outcome, "TERMINAL_NAO_COMPROVADO")

    def test_invalid_ids_and_status_types_fail_closed(self):
        for bad_id in (0, -1, True):
            with self.subTest(intent_id=bad_id):
                with self.assertRaises(ValueError):
                    monitor.audit_trace([], intent_id=bad_id)
        for bad_status in (None, True, "10"):
            with self.subTest(status=bad_status):
                with self.assertRaises(ValueError):
                    monitor.audit_trace([step(887001, bad_status)], intent_id=887001)

    def test_sale_then_cancellation_uses_last_provider_status(self):
        # Do not claim sale is still approved after a later cancellation.
        self.check("cancelled_sale_trace",
                   [step(887001, 5), step(887001, 6),
                    step(887001, 10, external=15),
                    step(887001, 18), step(887001, 19),
                    step(887001, 20, external=15)], "CANCELADA")

    def test_cancel_after_approval_pending_is_not_approved(self):
        self.check("cancel_started_after_credit",
                   [step(887001, 10, external=15), step(887001, 18)],
                   "CANCELAMENTO_PENDENTE_NAO_REPETIR", definitive=False)
        self.check("cancel_failed_back_to_approved",
                   [step(887001, 10), step(887001, 18), step(887001, 10)],
                   "CANCELAMENTO_NAO_CONFIRMADO", definitive=False)

    def test_client_timeout_after_approval_is_unknown(self):
        self.check("stale_response",
                   [step(887001, 10, external=15), {"error": "read timeout"}],
                   "CONSULTA_FALHOU_ESTADO_DESCONHECIDO", definitive=False)
        self.check("recovered_after_timeout",
                   [step(887001, 10), {"error": "timeout"},
                    step(887001, 10, external=15)], "APROVADA")

    def test_conflicting_or_regressing_status_is_blocked(self):
        self.check("reversal_from_denial_to_approval",
                   [step(887001, 25), step(887001, 10)],
                   "TRANSICAO_INCONSISTENTE_NAO_REPROCESSAR", definitive=False)
        self.check("reversal_from_cancelled_to_approval",
                   [step(887001, 20), step(887001, 10)],
                   "TRANSICAO_INCONSISTENTE_NAO_REPROCESSAR", definitive=False)
        self.check("reversal_from_expired_to_payment",
                   [step(887001, 15), step(887001, 6)],
                   "TRANSICAO_INCONSISTENTE_NAO_REPROCESSAR", definitive=False)

    def test_cancellation_external_type_and_counts(self):
        a = step(887001, 20, external=15)
        a.update(external_payment_type_id=10, external_count=2)
        self.check("cancellation_confirmed_with_two_payments",
                   [step(887001, 10), a], "CANCELADA", mode="cancel")
        b = dict(a, external_count=1)
        self.check("only_original_payment_in_response",
                   [step(887001, 10), b],
                   "CANCELAMENTO_EXTERNO_NAO_COMPROVADO", mode="cancel",
                   definitive=False)
        c = dict(a, external_payment_type_id=5)
        self.check("wrong_external_type",
                   [step(887001, 10), c],
                   "CANCELAMENTO_EXTERNO_NAO_COMPROVADO", mode="cancel",
                   definitive=False)
        d = dict(a, external_count=0)
        self.check("external_count_zero", [step(887001, 10), d],
                   "CANCELAMENTO_EXTERNO_NAO_COMPROVADO", mode="cancel",
                   definitive=False)

    def test_silent_external_count_regression_fails_closed(self):
        before = dict(step(887001, 10), external_count=2)
        after = dict(step(887001, 20), external_count=1)
        self.check("count_must_be_monotonic", [before, after],
                   "CONTAGEM_EXTERNA_REGREDIU", definitive=False)

    def test_explicit_identity_reference_and_amount(self):
        snapshots = [dict(step(887001, 10), reference="EOS-DEMO-001", amount="1,00")]
        accepted = monitor.audit_trace(
            snapshots, intent_id=887001, terminal_id=7057,
            reference="EOS-DEMO-001", amount="1,00")
        self.assertTrue(accepted.definitive)
        self.assertFalse(accepted.automatic_retry_allowed)
        with self.assertRaisesRegex(ValueError, "Wrong reference"):
            monitor.audit_trace(snapshots, intent_id=887001, reference="EOS-DEMO-WRONG")
        with self.assertRaisesRegex(ValueError, "Wrong amount"):
            monitor.audit_trace(snapshots, intent_id=887001, amount="2,00")
        missing = monitor.audit_trace([step(887001, 10)], intent_id=887001,
                                      reference="EOS-DEMO-001", terminal_id=7057)
        self.assertFalse(missing.definitive)
        self.assertEqual(missing.outcome, "REFERENCIA_NAO_COMPROVADA")

    def test_identity_must_be_consistent_across_every_poll(self):
        with self.assertRaisesRegex(ValueError, "Reference changed"):
            monitor.audit_trace(
                [dict(step(887001, 5), reference="EOS-A"),
                 dict(step(887001, 10), reference="EOS-B")], intent_id=887001)
        with self.assertRaisesRegex(ValueError, "Amount changed"):
            monitor.audit_trace(
                [dict(step(887001, 5), amount="1,00"),
                 dict(step(887001, 10), amount="2,00")], intent_id=887001)

    def test_missing_or_malformed_fields_fail_closed(self):
        bad = [dict(step(887001, 10), external_count=-1),
               dict(step(887001, 10), external_count=True)]
        for item in bad:
            with self.subTest(bad=item):
                audit = monitor.audit_trace([item], intent_id=887001)
                self.assertFalse(audit.definitive)
                self.assertEqual(audit.outcome, "CONTAGEM_EXTERNA_INVALIDA")
        missing = monitor.audit_trace([step(887001, 10)],
                                      intent_id=887001, amount="1,00", terminal_id=7057)
        self.assertFalse(missing.definitive)
        self.assertEqual(missing.outcome, "VALOR_NAO_COMPROVADO")

    def test_sale_is_never_automatically_retried(self):
        for terminal_state in (10, 15, 20, 25):
            item = monitor.audit_trace([step(887001, terminal_state)],
                                       intent_id=887001)
            self.assertFalse(item.automatic_retry_allowed)

    def test_no_expected_terminal_is_never_definitive(self):
        result = monitor.audit_trace([step(887001, 10)], intent_id=887001)
        self.assertFalse(result.definitive)
        self.assertEqual(result.outcome, "TERMINAL_ESPERADO_NAO_INFORMADO")
        self.assertFalse(result.automatic_retry_allowed)

    def test_pending_scan_four_statuses_empty_is_only_observation(self):
        batches={i:{"http_status":200, "rows":[], "recordsFiltered":None}
                 for i in (5,6,18,19)}
        result=monitor.audit_open_status_batches(batches, terminal_id=7057)
        self.assertTrue(result.complete)
        self.assertEqual(result.checked_statuses, (5,6,18,19))
        self.assertEqual(result.outcome, "SEM_PENDENCIAS_OBSERVADAS")
        self.assertFalse(result.coverage_verified)  # provider returned null count
        self.assertFalse(result.automatic_new_sale_allowed)

    def test_pending_scan_detects_older_unsettled_intentions(self):
        batches={i:{"http_status":200, "rows":[], "recordsFiltered":0}
                 for i in (5,6,18,19)}
        batches[5]["rows"].append(step(887001, 5))
        batches[5]["recordsFiltered"]=1
        batches[19]["rows"].append(step(887002, 19))
        batches[19]["recordsFiltered"]=1
        result=monitor.audit_open_status_batches(batches, terminal_id=7057)
        self.assertTrue(result.complete)
        self.assertEqual(result.outcome, "PENDENCIAS_ENCONTRADAS")
        self.assertTrue(result.coverage_verified)
        self.assertEqual(result.observed_open_ids, (887001,887002))
        self.assertFalse(result.automatic_new_sale_allowed)

    def test_pending_scan_missing_bucket_fails_closed(self):
        batches={i:{"http_status":200, "rows":[]} for i in (5,6,18)}
        result=monitor.audit_open_status_batches(batches, terminal_id=7057)
        self.assertFalse(result.complete)
        self.assertEqual(result.outcome, "FILTROS_DE_STATUS_INCOMPLETOS")

    def test_pending_scan_http_error_fails_closed(self):
        batches={i:{"http_status":200, "rows":[]} for i in (5,6,18,19)}
        batches[18]["http_status"]=503
        result=monitor.audit_open_status_batches(batches, terminal_id=7057)
        self.assertFalse(result.complete)
        self.assertEqual(result.outcome, "CONSULTA_DE_STATUS_FALHOU")

    def test_pending_scan_wrong_terminal_or_status_fails_closed(self):
        batches={i:{"http_status":200, "rows":[]} for i in (5,6,18,19)}
        batches[6]["rows"]=[step(887001, 6, terminal=6928)]
        wrong=monitor.audit_open_status_batches(batches, terminal_id=7057)
        self.assertFalse(wrong.complete)
        self.assertEqual(wrong.outcome, "TERMINAL_INCONSISTENTE")
        batches[6]["rows"]=[step(887001, 10)]
        inconsistent=monitor.audit_open_status_batches(batches, terminal_id=7057)
        self.assertFalse(inconsistent.complete)
        self.assertEqual(inconsistent.outcome, "STATUS_INCONSISTENTE")

    def test_pending_scan_pagination_mismatch_fails_closed(self):
        batches={i:{"http_status":200, "rows":[]} for i in (5,6,18,19)}
        batches[5]["recordsFiltered"]=3
        audited=monitor.audit_open_status_batches(batches, terminal_id=7057)
        self.assertFalse(audited.complete)
        self.assertEqual(audited.outcome, "PAGINACAO_NAO_CONFERIDA")

    def test_pending_scan_cross_bucket_race_fails_closed(self):
        batches={i:{"http_status":200, "rows":[]} for i in (5,6,18,19)}
        batches[5]["rows"]=[step(887001, 5)]
        batches[6]["rows"]=[step(887001, 6)]
        audited=monitor.audit_open_status_batches(batches, terminal_id=7057)
        self.assertFalse(audited.complete)
        self.assertEqual(audited.outcome, "CONSULTAS_NAO_ATOMICAS_INCONSISTENTES")

    def test_pending_scan_refuses_raw_payload(self):
        batches={i:{"http_status":200, "rows":[]} for i in (5,6,18,19)}
        batches[5]["rows"]=[dict(step(887001,5), pes_key="SECRET")]
        audited=monitor.audit_open_status_batches(batches, terminal_id=7057)
        self.assertFalse(audited.complete)
        self.assertEqual(audited.outcome, "RESPOSTA_NAO_SANITIZADA")

    def test_real_loopback_http_timeout_keeps_intent_unknown(self):
        # Transport-level fault injection. Serves no financial or personal
        # data and does not contact sandbox, PayGo or the card reader.
        from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
        import threading
        import time
        import urllib.error
        import urllib.request

        class SlowResponse(BaseHTTPRequestHandler):
            def do_GET(self):
                time.sleep(0.22)
                try:
                    self.send_response(200)
                    self.end_headers()
                    self.wfile.write(b'{"status_id":10}')
                except OSError:
                    # Expected: client intentionally timed out/disconnected.
                    pass

            def log_message(self, *args):
                return

        server=ThreadingHTTPServer(("127.0.0.1",0), SlowResponse)
        thread=threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        try:
            url=f"http://127.0.0.1:{server.server_port}/fake-readonly-status"
            with self.assertRaises((TimeoutError, urllib.error.URLError)):
                with urllib.request.urlopen(url,timeout=0.04) as response:
                    response.read()
        finally:
            server.shutdown()
            server.server_close()
            thread.join(timeout=3)
        result=monitor.audit_trace(
            [step(887001,6), {"error":"local HTTP timeout"}],
            intent_id=887001,terminal_id=7057)
        self.assertFalse(result.definitive)
        self.assertEqual(result.outcome,"CONSULTA_FALHOU_ESTADO_DESCONHECIDO")
        self.assertFalse(result.automatic_retry_allowed)

    def test_pending_scan_bad_terminal_does_not_authorize_operations(self):
        with self.assertRaisesRegex(ValueError, "Invalid expected terminal"):
            monitor.audit_open_status_batches({}, terminal_id=0)
        with self.assertRaisesRegex(ValueError, "Invalid expected terminal"):
            monitor.audit_open_status_batches({}, terminal_id=True)
        records={i:{"http_status":200, "rows":[]} for i in (5,6,18,19)}
        self.assertFalse(monitor.audit_open_status_batches(records, terminal_id=7057)
                         .automatic_new_sale_allowed)

    def test_getbyid_null_terminal_requires_exact_filtered_proof(self):
        get_by_id={
            "id": 887001, "terminal_id": None, "reference": "EOS-LINUX-TEST001",
            "amount": "1,00", "method": "D?bito", "status_id": 10,
            "payment_status_id": 15,
        }
        filter_proof={
            "source": "GetByFiltros", "id": 887001, "terminal_id": 7057,
            "reference": "EOS-LINUX-TEST001", "amount": "1,00",
            "method": "D?bito", "status_id": 10,
        }
        no_proof=monitor.audit_trace([get_by_id], intent_id=887001, terminal_id=7057)
        self.assertEqual(no_proof.outcome, "TERMINAL_NAO_COMPROVADO")
        self.assertFalse(no_proof.definitive)
        proven=monitor.audit_trace([get_by_id], intent_id=887001, terminal_id=7057,
                                   terminal_proof=filter_proof,
                                   reference="EOS-LINUX-TEST001", amount="1,00")
        self.assertEqual(proven.outcome, "APROVADA")
        self.assertTrue(proven.definitive)
        self.assertFalse(proven.automatic_retry_allowed)
        for mutated in (
            {"id": 887002},
            {"terminal_id": 6928},
            {"reference": "EOS-LINUX-OTHER"},
            {"amount": "2,00"},
            {"status_id": 20},
            {"source": "GetById"},
            {"method": "Cr?dito"},
            {"credit_card_pan": "DO_NOT_ACCEPT"},
        ):
            with self.subTest(mutation=mutated):
                proof=dict(filter_proof, **mutated)
                bad=monitor.audit_trace([get_by_id], intent_id=887001,
                                        terminal_id=7057, terminal_proof=proof)
                self.assertEqual(bad.outcome, "TERMINAL_NAO_COMPROVADO")
                self.assertFalse(bad.definitive)

    def test_null_terminal_proof_also_works_for_cancelled_intent(self):
        latest=dict(step(887001, 20), terminal_id=None,
                    reference="EOS-CANCEL-001", amount="1,00",
                    payment_status_id=15, external_count=2,
                    external_payment_type_id=10)
        proof=dict(source="GetByFiltros", id=887001, terminal_id=7057,
                   reference="EOS-CANCEL-001", amount="1,00", status_id=20)
        result=monitor.audit_trace([latest], intent_id=887001, terminal_id=7057,
                                   operation="cancel", terminal_proof=proof)
        self.assertEqual(result.outcome, "CANCELADA")
        self.assertTrue(result.definitive)
        self.assertFalse(result.automatic_retry_allowed)

    def test_cli_consumes_explicit_second_source_evidence(self):
        first={"id":887001, "terminal_id":None, "reference":"EOS-FILTER-001",
               "amount":"1,00", "status_id":10, "payment_status_id":15}
        proof={"source":"GetByFiltros", "id":887001, "terminal_id":7057,
               "reference":"EOS-FILTER-001", "amount":"1,00", "status_id":10}
        with tempfile.TemporaryDirectory() as folder:
            a=Path(folder) / "byid.json"
            b=Path(folder) / "filtered.json"
            a.write_text(json.dumps([first]))
            b.write_text(json.dumps(proof))
            cmd=[sys.executable, str(MODULE_PATH), "--trace", str(a),
                 "--filtered-proof", str(b), "--id", "887001", "--terminal", "7057",
                 "--reference", "EOS-FILTER-001", "--amount", "1,00"]
            process=subprocess.run(cmd, capture_output=True, text=True, timeout=10)
            self.assertEqual(process.returncode, 0, process.stderr)
            output=json.loads(process.stdout)
            self.assertEqual(output["outcome"], "APROVADA")
            self.assertFalse(output["automatic_retry_allowed"])

    def test_timestamps_are_checked_after_vm_restore(self):
        chronological=[
            dict(step(887001, 5), observed_at="2026-10-29T22:00:00-03:00"),
            dict(step(887001, 10), observed_at="2026-10-30T01:01:00+00:00"),
        ]
        self.check("synchronized_clock", chronological, "APROVADA")
        backwards=[
            dict(step(887001, 5), observed_at="2026-10-30T01:01:00+00:00"),
            dict(step(887001, 10), observed_at="2026-10-29T22:00:00-03:00"),
        ]
        self.check("clock_moved_back", backwards, "HORARIO_REGREDIU",
                   definitive=False)
        incomplete=[
            dict(step(887001, 5), observed_at="2026-10-29T22:00:00-03:00"),
            step(887001, 10),
        ]
        self.check("missing_timestamp", incomplete, "HORARIO_INCOMPLETO",
                   definitive=False)
        self.check("naive_timestamp", [
            dict(step(887001, 10), observed_at="2026-10-29T22:00:00")],
            "HORARIO_SEM_FUSO", definitive=False)
        self.check("nonsense_timestamp", [
            dict(step(887001, 10), observed_at="yesterday")],
            "HORARIO_INVALIDO", definitive=False)

    def test_refuse_raw_payload_with_sensitive_fields(self):
        raw=dict(step(887001, 10), key="DO_NOT_LOG_THIS_SECRET")
        self.check("raw_payload_not_sanitized", [raw],
                   "CAMPOS_NAO_SANITIZADOS", definitive=False)
        import io
        from contextlib import redirect_stdout
        with io.StringIO() as output, redirect_stdout(output):
            result=monitor.audit_trace([raw], intent_id=887001,
                                       terminal_id=7057)
            self.assertEqual(output.getvalue(), "")
            self.assertFalse(result.automatic_retry_allowed)

    def test_trace_length_limit(self):
        many=[step(887001, 6)] * (monitor.MAX_TRACE_SNAPSHOTS + 1)
        self.check("bounded_replay", many, "HISTORICO_EXCEDE_LIMITE",
                   definitive=False)

    def test_offline_cli_rejects_large_json_file(self):
        with tempfile.TemporaryDirectory() as folder:
            p=Path(folder) / "giant.json"
            p.write_bytes(b" " * (monitor.MAX_TRACE_BYTES + 1))
            cmd=[sys.executable, str(MODULE_PATH), "--trace", str(p),
                 "--id", "887001", "--terminal", "7057"]
            result=subprocess.run(cmd, capture_output=True, text=True,
                                  check=False, timeout=10)
            self.assertNotEqual(result.returncode, 0)
            self.assertIn("safety limit", result.stderr)
            self.assertNotIn("APROVADA", result.stdout)

    def test_randomized_adversarial_status_sequences_fail_closed(self):
        import random
        rng=random.Random(20261030)
        possibilities=(5, 6, 10, 15, 18, 19, 20, 25, 999)
        for i in range(1600):
            seq=[step(887001,rng.choice(possibilities))
                 for _ in range(rng.randint(0,25))]
            answer=monitor.audit_trace(seq, intent_id=887001,
                                       terminal_id=7057)
            self.assertFalse(answer.automatic_retry_allowed)
            if answer.definitive:
                self.assertIn(answer.outcome,
                              ("APROVADA", "CANCELADA", "RECUSADA", "EXPIRADA"))
                self.assertTrue(seq)
                self.assertEqual(seq[-1]["status_id"],
                                 {"APROVADA":10, "CANCELADA":20,
                                  "RECUSADA":25, "EXPIRADA":15}[answer.outcome])

    def test_unknown_operation_rejected(self):
        with self.assertRaises(ValueError):
            monitor.audit_trace([], intent_id=887001, operation="refund")

    def test_offline_cli_with_sanitized_history(self):
        with tempfile.TemporaryDirectory() as folder:
            p = Path(folder) / "sample.json"
            p.write_text(json.dumps([step(887001, 6), step(887001, 10)]))
            cmd = [sys.executable, str(MODULE_PATH), "--trace", str(p), "--id", "887001",
                   "--terminal", "7057"]
            result = subprocess.run(cmd, capture_output=True, text=True, check=False, timeout=10)
            self.assertEqual(result.returncode, 0, result.stderr)
            output = json.loads(result.stdout)
            self.assertEqual(output["outcome"], "APROVADA")
            self.assertTrue(output["offline"])

    def test_cli_uncertain_returns_error_without_new_sale(self):
        with tempfile.TemporaryDirectory() as folder:
            p = Path(folder) / "pending.json"
            p.write_text(json.dumps([step(887001, 6)]))
            result = subprocess.run([sys.executable, str(MODULE_PATH), "--trace",
                                     str(p), "--id", "887001", "--terminal", "7057"], capture_output=True,
                                    text=True, check=False, timeout=10)
            self.assertEqual(result.returncode, 2)
            self.assertEqual(json.loads(result.stdout)["outcome"],
                             "TRANSACAO_PENDENTE_NAO_REPETIR")


if __name__ == "__main__":
    unittest.main()
