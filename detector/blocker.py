from __future__ import annotations

import logging
import subprocess


class IptablesBlocker:
    def __init__(self, chain: str = "INPUT", dry_run: bool = True) -> None:
        self.chain = chain
        self.dry_run = dry_run
        self.logger = logging.getLogger("detrudr.blocker")

    def block(self, ip_address: str) -> bool:
        return self._run(["iptables", "-I", self.chain, "-s", ip_address, "-j", "DROP"])

    def unblock(self, ip_address: str) -> bool:
        return self._run(["iptables", "-D", self.chain, "-s", ip_address, "-j", "DROP"])

    def _run(self, command: list[str]) -> bool:
        if self.dry_run:
            self.logger.info("Dry-run iptables command: %s", " ".join(command))
            return True
        try:
            subprocess.run(command, check=True, capture_output=True, text=True)
            return True
        except subprocess.CalledProcessError as exc:
            self.logger.error("iptables command failed: %s", exc.stderr.strip())
            return False
