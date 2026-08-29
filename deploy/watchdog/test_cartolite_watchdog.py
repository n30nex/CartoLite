import unittest

from deploy.watchdog.cartolite_watchdog import evaluate, initial_state


def response(ok=True, *, boot="boot-a"):
    return {"ok": ok, "status": 200 if ok else 503, "data": {
        "ok": ok,
        "ready": ok,
        "bootId": boot,
        "version": "0.5.0",
        "gitSha": "a" * 40,
        "mqtt": ok,
        "checkpoint": ok,
        "dropped": 0,
        "queueDepth": 0,
        "queueHealthy": ok,
    }}


class WatchdogTransitions(unittest.TestCase):
    def setUp(self):
        self.state, alerts = evaluate(initial_state(), response(), response(), seed=True)
        self.assertEqual(alerts, [])

    def run_checks(self, health, readiness, count):
        alerts = []
        for _ in range(count):
            self.state, emitted = evaluate(self.state, health, readiness)
            alerts.extend(emitted)
        return alerts

    def test_outage_alerts_once_after_three_failures_and_recovers_once(self):
        self.assertEqual(self.run_checks(response(False), response(False), 2), [])
        self.assertEqual(self.run_checks(response(False), response(False), 1), ["outage"])
        self.assertEqual(self.run_checks(response(False), response(False), 3), [])
        self.assertEqual(self.run_checks(response(), response(), 1), [])
        self.assertEqual(self.run_checks(response(), response(), 1), ["recovery"])
        self.assertEqual(self.run_checks(response(), response(), 3), [])

    def test_readiness_alerts_once_after_three_failures_and_recovers_once(self):
        self.assertEqual(self.run_checks(response(), response(False), 2), [])
        self.assertEqual(self.run_checks(response(), response(False), 1), ["readiness"])
        self.assertEqual(self.run_checks(response(), response(False), 2), [])
        self.assertEqual(self.run_checks(response(), response(), 2), ["recovery"])

    def test_boot_change_alerts_once_per_new_identity(self):
        self.assertEqual(self.run_checks(response(boot="boot-b"), response(), 1), ["boot-change"])
        self.assertEqual(self.run_checks(response(boot="boot-b"), response(), 3), [])
        self.assertEqual(self.run_checks(response(boot="boot-c"), response(), 1), ["boot-change"])

    def test_health_failure_preserves_last_known_sha(self):
        unreachable = {"ok": False, "status": "URLError", "data": {}}
        self.state, alerts = evaluate(self.state, unreachable, unreachable)
        self.assertEqual(alerts, [])
        self.assertEqual(self.state["gitSha"], "a" * 12)


if __name__ == "__main__":
    unittest.main()
