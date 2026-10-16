"""Offline source guards for CI runtime verification and publication isolation.

These checks do not execute Actions, install packages, load credentials, contact
providers or establish that the Linux native runtime has passed in GitHub CI.
"""

from pathlib import Path
import os
import re
import shlex
import subprocess
import sys
import unittest


ROOT = Path(__file__).resolve().parents[2]
INSTALL = "python -m pip install --require-hashes --only-binary=:all: -r jobs/requirements.txt"
CHECK = "python -m pip check"
TESTS = "python -B -m unittest discover -s jobs/tests"
SMOKE = "python -B jobs/forecast_runtime.py"
PUBLISH = "python jobs/refresh_forecast.py"
OPT_IN = ('python -c "import os, sys; '
          "sys.exit(os.environ.get('NIRMOL_ATOMIC_PUBLISHER_ENABLED') != 'true')\"")


def source(name):
    """Drop full-line comments so examples cannot satisfy an execution guard."""
    text = (ROOT / ".github" / "workflows" / name).read_text(encoding="utf-8")
    return "\n".join(line for line in text.splitlines() if not line.lstrip().startswith("#"))


def commands(text):
    values = re.findall(r"(?m)^\s*(?:-\s*)?run:\s*(\S[^\n]*)$", text)
    # The pip wheel-only option contains ': ' and must be YAML-quoted.
    # Actual YAML syntax is also checked by web/tests/dependencies.test.mjs.
    return [value[1:-1].replace("''", "'") if value.startswith("'") and value.endswith("'") else value
            for value in values]


class RuntimeWorkflowTests(unittest.TestCase):
    def test_case_sensitive_opt_in_runs_before_publication_credentials(self):
        # GitHub's == comparison is case-insensitive: TRUE passes the job's
        # condition. A credential-free step must reject it before the write step.
        workflow = source("forecast.yml")
        self.assertEqual(commands(workflow)[0], OPT_IN)
        before, publish = workflow.split("- run: " + PUBLISH, 1)
        self.assertNotIn("continue-on-error", workflow)
        self.assertNotIn("always()", publish)
        self.assertNotRegex(before, r"\bsecrets\s*\.")
        self.assertEqual(before.count("NIRMOL_ATOMIC_PUBLISHER_ENABLED: ${{ vars.NIRMOL_ATOMIC_PUBLISHER_ENABLED }}"), 1)
        for value in (None, "", "false", "0", "TRUE", "True", " true", "true ", "unexpected", "true"):
            env = {key: item for key, item in os.environ.items()
                   if "SUPABASE" not in key and key != "NIRMOL_ATOMIC_PUBLISHER_ENABLED"}
            if value is not None:
                env["NIRMOL_ATOMIC_PUBLISHER_ENABLED"] = value
            with self.subTest(flag=value):
                result = subprocess.run([sys.executable, *shlex.split(OPT_IN)[1:]],
                                        env=env, capture_output=True, text=True, timeout=10)
                self.assertEqual(result.returncode, 0 if value == "true" else 1)
                self.assertEqual(result.stdout + result.stderr, "")

    def test_validation_has_only_nonpublishing_triggers_and_relevant_paths(self):
        workflow = source("forecast-runtime.yml")
        for trigger in ("push", "pull_request", "workflow_dispatch"):
            self.assertRegex(workflow, rf"(?m)^  {trigger}:")
        self.assertNotRegex(workflow, r"(?m)^  (?:schedule|pull_request_target):")
        # Both push and pull-request path filters must cover runtime contracts.
        for path in ("jobs/**", "ml/train_forecast.py", "ml/artifacts/**",
                     ".github/workflows/forecast.yml", ".github/workflows/forecast-runtime.yml"):
            self.assertEqual(workflow.count(f'"{path}"'), 2, path)

    def test_validation_has_no_secrets_variables_environment_or_publisher(self):
        workflow = source("forecast-runtime.yml")
        self.assertNotRegex(workflow, r"\b(?:secrets|vars)\s*\.")
        self.assertNotRegex(workflow, r"(?m)^\s*(?:env|environment):")
        self.assertNotIn("NIRMOL_ATOMIC_PUBLISHER_ENABLED", workflow)
        self.assertNotIn("publish_nirmol_forecast", workflow)
        self.assertNotIn("refresh_forecast.py", workflow)
        self.assertNotIn("--dry-run", workflow)

    def test_validation_executes_only_locked_install_and_offline_verification(self):
        workflow = source("forecast-runtime.yml")
        self.assertEqual(commands(workflow), [INSTALL, CHECK, TESTS, SMOKE])

    def test_validation_checkout_does_not_persist_credentials(self):
        workflow = source("forecast-runtime.yml")
        checkout = workflow.split("actions/checkout@", 1)[1].split("- uses:", 1)[0]
        self.assertRegex(checkout, r"(?m)^\s+persist-credentials: false\s*$")

    def test_both_workflows_have_only_read_permission(self):
        for name in ("forecast.yml", "forecast-runtime.yml"):
            with self.subTest(workflow=name):
                workflow = source(name)
                self.assertRegex(workflow, r"(?m)^permissions:\s*\n  contents: read\s*\n")
                self.assertEqual(len(re.findall(r"(?m)^\s*permissions:", workflow)), 1)
                self.assertNotRegex(workflow, r"(?m)^\s*[\w-]+: (?:write|write-all)\s*$")

    def test_both_workflows_use_supported_python_and_dependency_cache(self):
        for name in ("forecast.yml", "forecast-runtime.yml"):
            with self.subTest(workflow=name):
                workflow = source(name)
                self.assertRegex(workflow, r'(?m)^\s+python-version: "3\.14"\s*$')
                self.assertRegex(workflow, r"(?m)^\s+cache: pip\s*$")
                self.assertRegex(workflow, r"(?m)^\s+cache-dependency-path: jobs/requirements\.txt\s*$")

    def test_publication_runs_locked_native_preflight_before_guarded_publish(self):
        workflow = source("forecast.yml")
        self.assertEqual(commands(workflow), [OPT_IN, INSTALL, CHECK, TESTS, SMOKE, PUBLISH])
        self.assertIn("if: ${{ vars.NIRMOL_ATOMIC_PUBLISHER_ENABLED == 'true' }}", workflow)
        before, publish = workflow.split("- run: " + PUBLISH, 1)
        # Only the exact-value gate receives the actual nonsensitive variable.
        # Native verification never receives publication credentials.
        self.assertNotRegex(before, r"\bsecrets\s*\.")
        self.assertEqual(len(re.findall(r"(?m)^\s*env:", before)), 1)
        self.assertNotRegex(before, r"(?m)^\s*environment:")
        self.assertRegex(publish, r"(?m)^\s+NIRMOL_ATOMIC_PUBLISHER_ENABLED: \$\{\{ vars\.NIRMOL_ATOMIC_PUBLISHER_ENABLED \}\}\s*$")
        self.assertIn("NEXT_PUBLIC_SUPABASE_URL: ${{ secrets.NEXT_PUBLIC_SUPABASE_URL }}", publish)
        self.assertIn("SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}", publish)

    def test_publication_trigger_and_bounded_job_policy_are_preserved(self):
        workflow = source("forecast.yml")
        self.assertIn('cron: "5 * * * *"', workflow)
        self.assertRegex(workflow, r"(?m)^  workflow_dispatch:")
        self.assertNotRegex(workflow, r"(?m)^  (?:push|pull_request|pull_request_target):")
        self.assertIn("cancel-in-progress: false", workflow)
        self.assertRegex(workflow, r"(?m)^\s+timeout-minutes: \d+\s*$")


if __name__ == "__main__":
    unittest.main()
