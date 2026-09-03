import unittest

from deploy.cloudflare.apply_region_cache_rule import RULE, RULE_REF, rule_matches


class RegionCacheRuleTests(unittest.TestCase):
    def test_rule_is_narrow_and_immutable(self):
        expression = RULE["expression"]
        self.assertEqual(RULE["ref"], RULE_REF)
        self.assertIn('http.host eq "carto.canadaverse.org"', expression)
        self.assertIn('/assets/meshcore-canada-region', expression)
        self.assertIn('.geojson', expression)
        self.assertIn('.json', expression)
        for protected in ('/api/', '/healthz', '/readyz'):
            self.assertIn(protected, expression)
        self.assertTrue(RULE["action_parameters"]["cache"])
        self.assertEqual(RULE["action_parameters"]["edge_ttl"], {"mode": "override_origin", "default": 31_536_000})
        self.assertEqual(RULE["action_parameters"]["browser_ttl"], {"mode": "respect_origin"})

    def test_verification_accepts_cloudflare_response_metadata_but_not_weaker_settings(self):
        returned = {
            **RULE,
            "id": "rule-id",
            "version": "1",
            "action_parameters": {**RULE["action_parameters"], "origin_error_page_passthru": False},
        }
        self.assertTrue(rule_matches(returned))
        returned["action_parameters"]["edge_ttl"] = {"mode": "override_origin", "default": 60}
        self.assertFalse(rule_matches(returned))


if __name__ == "__main__":
    unittest.main()
