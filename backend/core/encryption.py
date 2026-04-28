"""
Fernet symmetric encryption for sensitive tenant credentials stored in DB.

Usage:
    from core.encryption import encrypt, decrypt

    stored = encrypt("sk-my-secret-token")   # store this in DB
    plain  = decrypt(stored)                  # read back original

Set FERNET_KEY in env (generate once: python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())").
If FERNET_KEY is not set, values are stored as-is (dev convenience only).
"""

from __future__ import annotations

import logging
import os

log = logging.getLogger("ata.encryption")

_fernet = None
_warned = False


def _get_fernet():
    global _fernet, _warned
    if _fernet is not None:
        return _fernet

    key = os.getenv("FERNET_KEY", "")
    if not key:
        if not _warned:
            log.warning(
                "FERNET_KEY not set — tokens stored in plaintext. "
                "Set FERNET_KEY in production!"
            )
            _warned = True
        return None

    try:
        from cryptography.fernet import Fernet
        _fernet = Fernet(key.encode())
        return _fernet
    except Exception as exc:
        log.error("FERNET_KEY غير صالح (%s) — التوكنات ستُخزَّن بدون تشفير!", exc)
        return None


def encrypt(value: str | None) -> str | None:
    """Encrypt a plaintext string. Returns None if value is None."""
    if value is None:
        return None
    f = _get_fernet()
    if f is None:
        return value
    return f.encrypt(value.encode()).decode()


def decrypt(value: str | None) -> str | None:
    """Decrypt a Fernet-encrypted string. Returns None if value is None."""
    if value is None:
        return None
    f = _get_fernet()
    if f is None:
        return value
    try:
        return f.decrypt(value.encode()).decode()
    except Exception:
        # Value might be plaintext (pre-encryption migration), return as-is.
        return value
