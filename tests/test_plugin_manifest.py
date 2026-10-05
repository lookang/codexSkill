import json
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
PLUGIN = ROOT / "plugins" / "interactive-xapi-designer"


class PluginManifestTests(unittest.TestCase):
    def test_marketplace_starters_fit_the_128_character_limit(self):
        manifest = json.loads((PLUGIN / ".codex-plugin" / "plugin.json").read_text())
        starters = manifest["interface"]["defaultPrompt"]
        self.assertTrue(starters)
        for index, starter in enumerate(starters, start=1):
            with self.subTest(starter=index):
                self.assertLessEqual(len(starter), 128)

    def test_codex_and_claude_manifests_share_one_plugin_version(self):
        codex = json.loads((PLUGIN / ".codex-plugin" / "plugin.json").read_text())
        claude = json.loads((PLUGIN / ".claude-plugin" / "plugin.json").read_text())
        self.assertEqual(codex["name"], claude["name"])
        self.assertEqual(codex["version"], claude["version"])


if __name__ == "__main__":
    unittest.main()
