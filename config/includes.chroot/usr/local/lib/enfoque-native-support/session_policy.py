"""Enfoque OS native support: local permission rules, no remote control.

This library is intentionally non-operational until a separate authenticated,
audited relay and a visible, explicitly authorized desktop client exist. It
contains no screen capture, input injection, remote shell, network or daemon.
"""
from dataclasses import dataclass
from enum import Enum
import re
from typing import Optional

UUID4 = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$")
MAX_PENDING_SECONDS = 120
MAX_SESSION_SECONDS = 900


class Status(str, Enum):
    REQUESTED = "requested"
    ACTIVE = "active"
    DENIED = "denied"
    CLOSED = "closed"
    EXPIRED = "expired"


@dataclass(frozen=True)
class SupportSession:
    session_id: str
    device_id: str
    operator_id: str
    requested_at: float
    status: Status = Status.REQUESTED
    approved_by_ti: bool = False
    consent_at: Optional[float] = None
    expires_at: Optional[float] = None

    def __post_init__(self):
        if not UUID4.fullmatch(self.session_id):
            raise ValueError("Identificador de sessao invalido")
        if not UUID4.fullmatch(self.device_id):
            raise ValueError("Identificador de computador invalido")
        if not isinstance(self.operator_id, str) or not re.fullmatch(r"[A-Za-z0-9@._-]{3,120}", self.operator_id):
            raise ValueError("Operador nao identificado")
        if not isinstance(self.requested_at, (float, int)) or self.requested_at <= 0:
            raise ValueError("Horario de solicitacao invalido")

    def approve(self, now, *, ti_approved=False, local_consent=False):
        if self.status is not Status.REQUESTED:
            raise PermissionError("Sessao nao esta aguardando autorizacao")
        if now < self.requested_at or now - self.requested_at > MAX_PENDING_SECONDS:
            raise PermissionError("Solicitacao expirada")
        if ti_approved is not True or local_consent is not True:
            raise PermissionError("Aprovacao da TI e consentimento local obrigatorios")
        return SupportSession(self.session_id, self.device_id, self.operator_id,
                              self.requested_at, Status.ACTIVE, True, now,
                              now + MAX_SESSION_SECONDS)

    def may_interact(self, now, *, device_id, operator_id, ti_authorized):
        return (self.status is Status.ACTIVE and self.approved_by_ti is True and
                self.consent_at is not None and self.expires_at is not None and
                self.consent_at <= now < self.expires_at and
                self.device_id == device_id and self.operator_id == operator_id and
                ti_authorized is True)

    def close(self):
        if self.status not in (Status.ACTIVE, Status.REQUESTED):
            return self
        return SupportSession(self.session_id, self.device_id, self.operator_id,
                              self.requested_at, Status.CLOSED, self.approved_by_ti,
                              self.consent_at, self.expires_at)
