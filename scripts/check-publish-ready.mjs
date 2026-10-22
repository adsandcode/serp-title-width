/**
 * Refuse to publish a package that is missing the fields a package needs.
 *
 * `homepage` and `repository` are how package directories and registries link
 * back to a project. `mcpName` in package.json is how the MCP Registry proves
 * the npm package belongs to the server entry in server.json, so the two names
 * and the two versions must agree. Publishing with any of these wrong is the
 * sort of thing nobody notices until the version is immutable.
 */
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const pkg = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));

const problems = [];
const PLACEHOLDER = /OWNER|example\.com|CHANGE_?ME|TODO/i;

for (const field of ["homepage", "repository", "author", "mcpName"]) {
  const value = pkg[field];
  if (!value) {
    problems.push(`package.json is missing "${field}"`);
    continue;
  }
  const asText = typeof value === "string" ? value : JSON.stringify(value);
  if (PLACEHOLDER.test(asText)) problems.push(`package.json "${field}" is still a placeholder: ${asText}`);
}

const serverPath = resolve(root, "server.json");
if (!existsSync(serverPath)) {
  problems.push("server.json is missing");
} else {
  let server = null;
  try {
    server = JSON.parse(readFileSync(serverPath, "utf8"));
  } catch (e) {
    problems.push(`server.json is not valid JSON: ${e.message}`);
  }
  if (server) {
    if (server.name !== pkg.mcpName)
      problems.push(`server.json name "${server.name}" differs from package.json mcpName "${pkg.mcpName}"`);
    if (server.version !== pkg.version)
      problems.push(`server.json version "${server.version}" differs from package.json version "${pkg.version}"`);
    const npm = (server.packages ?? []).filter((p) => p.registryType === "npm");
    if (!npm.length) problems.push("server.json has no npm package entry");
    for (const p of npm) {
      if (p.identifier !== pkg.name)
        problems.push(`server.json package identifier "${p.identifier}" differs from package.json name "${pkg.name}"`);
      if (p.version !== pkg.version)
        problems.push(`server.json package version "${p.version}" differs from package.json version "${pkg.version}"`);
    }
  }
}

if ((pkg.files ?? []).includes("server.json"))
  problems.push('server.json is in package.json "files"; it belongs to the registry, not the npm tarball');

for (const f of ["LICENSE", "README.md", "dist/index.js", "dist/cli.js", "dist/selftest.js"])
  if (!existsSync(resolve(root, f))) problems.push(`${f} is missing; run the build first`);

if (problems.length) {
  console.error("not ready to publish:");
  for (const p of problems) console.error("  - " + p);
  process.exit(1);
}
console.log("publish checks passed");
