import sys
import threading
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from willow_market.service import MarketDataService


class CapacityTests(unittest.TestCase):
    def test_distinct_blocked_keys_are_bounded_and_duplicate_keys_share_work(self):
        gate = threading.Event()
        service = MarketDataService(object(), max_workers=2)
        try:
            def blocked():
                gate.wait(5)
                return 1

            requests = [service._start(str(i), 60, blocked) for i in range(20)]
            self.assertEqual(len(service._inflight), 8)
            self.assertEqual(sum(future.done() for future in requests), 12)
            self.assertIs(service._start('0', 60, blocked), requests[0])
        finally:
            gate.set()
        for future in requests[:8]:
            self.assertEqual(future.result(timeout=5), 1)
