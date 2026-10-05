import importlib.util
import json
import tempfile
import unittest
import zipfile
from pathlib import Path


SCRIPT = Path(__file__).resolve().parents[1] / "plugins" / "interactive-xapi-designer" / "skills" / "interactive-xapi-designer" / "scripts" / "package_sls.py"
SPEC = importlib.util.spec_from_file_location("package_sls", SCRIPT)
package_sls = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(package_sls)


class PackageSlsTests(unittest.TestCase):
    def test_folder_package_has_expected_name_metadata_and_unchanged_runtime_bytes(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            source = root / "source"
            (source / "lib").mkdir(parents=True)
            (source / "index.html").write_bytes(b"<html>activity</html>")
            (source / "lib" / "xAPI.js").write_bytes(b"vendor transport bytes")

            output = package_sls.package_activity(
                source,
                title="Countable Nouns!",
                kind="scorable",
                mode="integrate-only",
                platform="codex",
                model="not-reported",
                effort="not-reported",
                prompt="Preserve the activity and add honest reporting.",
                iterations=["Round 1: inspected the check handler and kept the xAPI transport unchanged."],
                output_dir=root / "deliverables",
                verification_status="partial",
                verification_notes=["Local browser path checked; live SLS not tested."],
            )

            self.assertEqual(output.name, "iwant2study.moe.edu.sg_scorable_countable-nouns.zip")
            with zipfile.ZipFile(output) as archive:
                self.assertEqual(archive.read("index.html"), b"<html>activity</html>")
                self.assertEqual(archive.read("lib/xAPI.js"), b"vendor transport bytes")
                metadata = json.loads(archive.read(package_sls.METADATA_JSON))
                text = archive.read(package_sls.METADATA_TEXT).decode("utf-8")

            self.assertEqual(metadata["prompt"], "Preserve the activity and add honest reporting.")
            self.assertEqual(metadata["iterations"][0].startswith("Round 1:"), True)
            self.assertEqual(metadata["verification"]["status"], "partial")
            self.assertEqual(metadata["authoringEnvironment"]["platform"], "codex")
            self.assertEqual(metadata["authoringEnvironment"]["model"], "not-reported")
            self.assertIn("Reasoning/thinking effort: not-reported", text)
            self.assertIn("iwant2study.moe.edu.sg_scorable_countable-nouns.zip", text)
            self.assertIn("Local browser path checked", text)
            self.assertEqual({item["path"] for item in metadata["sourceFiles"]}, {"index.html", "lib/xAPI.js"})

    def test_zip_input_keeps_entry_content_and_uses_interactive_prefix(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            source = root / "legacy.zip"
            with zipfile.ZipFile(source, "w") as archive:
                archive.writestr("index.html", b"<main>legacy</main>")
                archive.writestr("assets/model.js", b"model state")
            output = package_sls.package_activity(
                source,
                title="Acid–alkali R1",
                kind="interactive",
                mode="integrate-and-improve",
                platform="claude-code",
                model="Claude model label",
                effort="extended thinking",
                prompt="Keep the existing exploration flow.",
                iterations=["Round 1: added a targeted teacher report without altering the xAPI library."],
                output_dir=root / "out",
            )
            self.assertEqual(output.name, "iwant2study.moe.edu.sg_interactive_acid-alkali-r1.zip")
            with zipfile.ZipFile(output) as archive:
                self.assertEqual(archive.read("index.html"), b"<main>legacy</main>")
                self.assertEqual(archive.read("assets/model.js"), b"model state")
                self.assertIn(package_sls.METADATA_TEXT, archive.namelist())
                metadata = json.loads(archive.read(package_sls.METADATA_JSON))
                self.assertEqual(metadata["authoringEnvironment"]["platform"], "claude-code")
                self.assertEqual(metadata["authoringEnvironment"]["effort"], "extended thinking")

    def test_archive_traversal_is_rejected_before_output(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            source = root / "unsafe.zip"
            with zipfile.ZipFile(source, "w") as archive:
                archive.writestr("index.html", b"ok")
                archive.writestr("../outside.txt", b"unsafe")
            with self.assertRaisesRegex(ValueError, "Unsafe"):
                package_sls.package_activity(
                    source,
                    title="Unsafe example",
                    kind="scorable",
                    mode="build-or-redesign",
                    platform="codex",
                    model="not-reported",
                    effort="not-reported",
                    prompt="Prompt",
                    iterations=["Round 1: built a page."],
                    output_dir=root / "out",
                )
            self.assertFalse((root / "out").exists())


if __name__ == "__main__":
    unittest.main()
