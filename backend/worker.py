"""Standalone durable ticket worker. Run with: python -m backend.worker"""

import logging
import signal
import time

from backend.services.job_queue import run_one_job


logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)
_running = True


def _stop(_signum, _frame):
    global _running
    _running = False


def main() -> None:
    signal.signal(signal.SIGINT, _stop)
    signal.signal(signal.SIGTERM, _stop)
    logger.info("Ticket worker started.")
    while _running:
        if not run_one_job():
            time.sleep(2)
    logger.info("Ticket worker stopped.")


if __name__ == "__main__":
    main()
