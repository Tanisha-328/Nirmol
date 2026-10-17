import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import ts from "typescript";
const require = createRequire(import.meta.url);
export function typescriptLoader(overrides = {}) {
  const modules = new Map();
  async function load(url) {
    if (modules.has(url.href)) return modules.get(url.href);
    let code = ts.transpileModule(await readFile(url, "utf8"), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
    for (const match of [...code.matchAll(/from ["']([^"']+)["']/g)]) {
      const specifier = match[1]; let replacement = overrides[specifier];
      if (!replacement && specifier.startsWith(".")) replacement = await load(new URL(`${specifier}.ts`, url));
      if (!replacement && specifier.startsWith("@/")) replacement = await load(new URL(`../../src/${specifier.slice(2)}.ts`, import.meta.url));
      if (!replacement && !specifier.startsWith("node:")) replacement = pathToFileURL(require.resolve(specifier === "next/server" ? "next/server.js" : specifier)).href;
      if (replacement) code = code.replace(match[0], `from ${JSON.stringify(replacement)}`);
    }
    const result = `data:text/javascript;base64,${Buffer.from(code).toString("base64")}`; modules.set(url.href, result); return result;
  }
  return load;
}
