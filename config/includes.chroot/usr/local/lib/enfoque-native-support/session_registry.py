"""Pilot session registry for Enfoque native support (no remote I/O).

This is a fail-closed, in-memory protocol model. It does not listen on a
network, capture screens, inject input, or provide unattended access. A later
server implementation must persist audit records to a protected store.
"""
from dataclasses import dataclass
import hashlib
import json

from session_policy import Status, SupportSession


@dataclass(frozen=True)
class AuditEvent:
    sequence: int
    session_id: str
    device_id: str
    operator_id: str
    action: str
    when: float
    previous_hash: str
    event_hash: str


class SessionRegistry:
    """One session per device; authorization and expiry checked on every use."""

    def __init__(self):
        self._sessions = {}
        self._events = []

    def _record(self, session, action, now):
        previous = self._events[-1].event_hash if self._events else "0" * 64
        values = {
            "sequence": len(self._events) + 1,
            "session_id": session.session_id,
            "device_id": session.device_id,
            "operator_id": session.operator_id,
            "action": action,
            "when": float(now),
            "previous_hash": previous,
        }
        digest = hashlib.sha256(json.dumps(values, sort_keys=True,
                                            separators=(",", ":")).encode()).hexdigest()
        self._events.append(AuditEvent(**values, event_hash=digest))

    @property
    def events(self):
        return tuple(self._events)

    def _session(self, session_id):
        try:
            return self._sessions[session_id]
        except KeyError:
            raise PermissionError("Sessao nao reconhecida") from None

    def request(self, session_id, device_id, operator_id, now):
        # Release stale slots before enforcing exclusivity for this device.
        self.expire(now)
        if session_id in self._sessions:
            raise PermissionError("Sessao duplicada")
        if any(s.device_id == device_id and s.status in
               (Status.REQUESTED, Status.ACTIVE) for s in self._sessions.values()):
            raise PermissionError("Equipamento ja tem solicitacao em andamento")
        session = SupportSession(session_id, device_id, operator_id, now)
        self._sessions[session_id] = session
        self._record(session, "requested", now)
        return session

    def approve(self, session_id, now, *, ti_approved=False, local_consent=False):
        before = self._session(session_id)
        after = before.approve(now, ti_approved=ti_approved,
                               local_consent=local_consent)
        self._sessions[session_id] = after
        self._record(after, "active", now)
        return after

    def authorize(self, session_id, now, *, device_id, operator_id, ti_authorized):
        s = self._session(session_id)
        return s.may_interact(now, device_id=device_id,
                              operator_id=operator_id,
                              ti_authorized=ti_authorized)

    def close(self, session_id, now, reason="closed"):
        if reason not in ("closed", "operator-disconnect", "local-disconnect",
                          "revoked", "device-disconnect", "locked", "logout"):
            raise ValueError("Motivo de encerramento invalido")
        before = self._session(session_id)
        after = before.close()
        if after is not before:
            self._sessions[session_id] = after
            self._record(after, reason, now)
        return after

    def expire(self, now):
        count = 0
        for sid, s in tuple(self._sessions.items()):
            if s.status == Status.REQUESTED and now > s.requested_at + 120:
                self._sessions[sid] = SupportSession(
                    s.session_id, s.device_id, s.operator_id, s.requested_at,
                    Status.EXPIRED)
                self._record(self._sessions[sid], "request-expired", now)
                count += 1
            elif s.status == Status.ACTIVE and s.expires_at is not None and now >= s.expires_at:
                self._sessions[sid] = SupportSession(
                    s.session_id, s.device_id, s.operator_id, s.requested_at,
                    Status.EXPIRED, s.approved_by_ti, s.consent_at, s.expires_at)
                self._record(self._sessions[sid], "session-expired", now)
                count += 1
        return count

    def audit_valid(self):
        prev = "0" * 64
        for expected_sequence, event in enumerate(self._events, start=1):
            values = {
                "sequence": event.sequence, "session_id": event.session_id,
                "device_id": event.device_id, "operator_id": event.operator_id,
                "action": event.action, "when": event.when,
                "previous_hash": event.previous_hash,
            }
            digest = hashlib.sha256(json.dumps(values, sort_keys=True,
                                                separators=(",", ":")).encode()).hexdigest()
            if event.sequence != expected_sequence or event.previous_hash != prev or event.event_hash != digest:
                return False
            prev = digest
        return True
