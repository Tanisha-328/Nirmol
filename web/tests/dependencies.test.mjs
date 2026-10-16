import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const require = createRequire(join(root, "package.json"));
const manifest = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const lock = JSON.parse(readFileSync(join(root, "package-lock.json"), "utf8"));
const nextRequire = createRequire(require.resolve("next/package.json"));
const postcss = nextRequire("postcss");

test("npm lockfile root dependency declarations match the package manifest", () => {
  assert.equal(lock.lockfileVersion, 3);
  for (const field of ["dependencies", "devDependencies"]) {
    assert.deepEqual(lock.packages[""][field], manifest[field]);
  }
});

test("forecast workflows parse as YAML and retain runnable locked-install commands", () => {
  const yaml = require("js-yaml"); // Already supplied by the ESLint tooling.
  const install = "python -m pip install --require-hashes --only-binary=:all: -r jobs/requirements.txt";
  for (const name of ["forecast.yml", "forecast-runtime.yml"]) {
    const workflow = yaml.load(readFileSync(join(root, "..", ".github", "workflows", name), "utf8"));
    const jobs = Object.values(workflow.jobs);
    assert.equal(jobs.length, 1);
    const commands = jobs[0].steps.filter((step) => "run" in step).map((step) => step.run);
    if (name === "forecast.yml") {
      assert.equal(commands.shift(), 'python -c "import os, sys; sys.exit(os.environ.get(\'NIRMOL_ATOMIC_PUBLISHER_ENABLED\') != \'true\')"');
      const gate = jobs[0].steps.find((step) => step.run?.startsWith("python -c "));
      assert.deepEqual(gate.env, { NIRMOL_ATOMIC_PUBLISHER_ENABLED: "${{ vars.NIRMOL_ATOMIC_PUBLISHER_ENABLED }}" });
      assert.equal(gate["continue-on-error"], undefined);
    }
    assert.equal(commands[0], install, `${name}: installation must parse as a command string`);
    assert.ok(commands.every((command) => typeof command === "string"));
  }
});

test("all locked and Next-resolved PostCSS versions include the known security fixes", () => {
  const entries = Object.entries(lock.packages).filter(([path]) => /(?:^|\/)node_modules\/postcss$/.test(path));
  assert.ok(entries.length > 0);
  for (const [path, entry] of entries) {
    const [major, minor, patch] = entry.version.split(".").map(Number);
    assert.ok(major === 8 && (minor > 5 || (minor === 5 && patch >= 23)), `${path}: vulnerable or unreviewed PostCSS ${entry.version}`);
    assert.match(entry.integrity, /^sha512-/);
  }
  const version = nextRequire("postcss/package.json").version;
  assert.ok(entries.some(([, entry]) => entry.version === version), "Next must resolve a reviewed locked PostCSS version");
  const [major, minor, patch] = version.split(".").map(Number);
  assert.ok(major === 8 && (minor > 5 || (minor === 5 && patch >= 23)), `Next resolves vulnerable PostCSS ${version}`);
});

test("Next-resolved PostCSS cannot close an HTML style element through CSS stringify", () => {
  const css = 'a { content: "</style><script>window.__dependency_marker=1</script><style>" }';
  assert.doesNotMatch(postcss.parse(css).toString(), /<\/style/i);
});

for (const withFrom of [false, true]) {
  test(`Next-resolved PostCSS rejects external previous-map disclosure (${withFrom ? "with" : "without"} from)`, async () => {
    const directory = mkdtempSync(join(tmpdir(), "nirmol-postcss-"));
    try {
      const source = join(directory, "styles");
      mkdirSync(source);
      const marker = "NIRMOL_CONTROLLED_SOURCE_MAP_MARKER";
      const mapPath = join(directory, "private.map");
      writeFileSync(mapPath, JSON.stringify({ version: 3, sources: ["private.js"], sourcesContent: [marker], names: [], mappings: "AAAA" }));
      const annotation = withFrom ? "../private.map" : mapPath.replaceAll("\\", "/");
      const options = { map: { inline: false }, from: withFrom ? join(source, "input.css") : undefined };
      const result = await postcss([{ postcssPlugin: "controlled-map-regression", Once() {} }]).process(`a { color: red }\n/*# sourceMappingURL=${annotation} */`, options);
      assert.ok(!result.map?.toString().includes(marker), "external source-map content must not be disclosed");
    } finally {
      assert.equal(dirname(resolve(directory)), resolve(tmpdir()), "cleanup must stay in the temporary directory");
      rmSync(directory, { recursive: true, force: true });
    }
  });
}

test("Tailwind/PostCSS still generates accessible utility CSS", async () => {
  const tailwind = require("@tailwindcss/postcss");
  const result = await require("postcss")([tailwind()]).process(
    '@import "tailwindcss" source(none); @source inline("sr-only outline-2");',
    { from: join(root, "src", "app", "dependency-smoke.css") },
  );
  assert.match(result.css, /\.sr-only\s*\{/);
  assert.match(result.css, /\.outline-2\s*\{/);
  assert.match(result.css, /outline-width:\s*2px/);
});
