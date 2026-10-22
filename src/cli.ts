#!/usr/bin/env node
/**
 * serp-title-width CLI.
 *
 *   serp-title-width <file|dir> ...          check <title> in .html/.htm files
 *   serp-title-width --titles "t1" "t2" ...  check strings
 *   serp-title-width ... --json              machine-readable output
 *   serp-title-width --selftest              run the ruler's controls only
 *
 * Exit codes: 0 all titles pass, 1 at least one title must be fixed,
 * 2 the ruler failed its own controls or the arguments were bad.
 *
 * The selftest runs before every verdict. If it fails, no verdict is given.
 */

import { measureTitles, EDGE, HARD, SAFE, MODEL, type Report, type TitleInput } from "./rules.js";
import { collectTitles, MAX_FILES } from "./files.js";
import { run as runSelftest } from "./selftest.js";

const USAGE = `Usage:
  serp-title-width <file|dir> ...           check <title> in .html/.htm files (directories are recursive,
                                            skipping node_modules and dot folders, at most ${MAX_FILES} files)
  serp-title-width --titles "t1" "t2" ...   check title strings
  serp-title-width ... --json               machine-readable output
  serp-title-width --selftest               run the ruler's positive and negative controls (use alone)

Model: Google results on google.com zh-TW, Arial 22px, measured ${MODEL.measured_on}.
Exit codes: 0 pass, 1 a title must be fixed, 2 ruler failed or bad arguments.`;

type Out = (s: string) => void;

export function main(argv: string[], out: Out, err: Out): number {
  if (argv.includes("--selftest")) {
    if (argv.length > 1) {
      err("--selftest must be used on its own. Mixed with other arguments it would check the ruler and no titles.");
      return 2;
    }
    out("Ruler controls:");
    return runSelftest(out) ? 0 : 2;
  }
  if (argv.includes("--help") || argv.includes("-h")) {
    out(USAGE);
    return 0;
  }

  const asJson = argv.includes("--json");
  const args = argv.filter((a) => a !== "--json");

  let items: TitleInput[];
  let missing: string[] = [];
  let skipped: { path: string; reason: string }[] = [];

  const ti = args.indexOf("--titles");
  if (ti >= 0) {
    if (ti > 0) {
      err(`--titles cannot be combined with file paths (got: ${args.slice(0, ti).join(" ")}).`);
      return 2;
    }
    items = args.slice(ti + 1).map((title, i) => ({ src: `(input ${i + 1})`, title }));
    if (!items.length) {
      err("--titles needs at least one title.\n\n" + USAGE);
      return 2;
    }
  } else {
    const unknown = args.filter((a) => a.startsWith("-"));
    if (unknown.length) {
      err(`Unknown option: ${unknown.join(" ")}\n\n${USAGE}`);
      return 2;
    }
    if (!args.length) {
      err(USAGE);
      return 2;
    }
    const found = collectTitles(args);
    ({ items, missing, skipped } = found);
    if (found.tooMany) {
      err(`More than ${found.tooMany.limit} HTML files under ${found.tooMany.path}. ` +
        "Point at a site's build output folder instead.");
      return 2;
    }
    if (missing.length) {
      err(`Path not found: ${missing.join(", ")}`);
      return 2;
    }
    if (found.unreadable.length) {
      err("Cannot read: " + found.unreadable.map((u) => `${u.path} (${u.reason})`).join(", "));
      return 2;
    }
    if (!items.length) {
      err(`No <title> found in: ${args.join(", ")}`);
      return 2;
    }
  }

  // The ruler is checked before every verdict, not only when asked.
  const lines: string[] = [];
  if (!runSelftest((s) => lines.push(s))) {
    err("The ruler failed its own controls. No verdict is given.\n" + lines.join("\n"));
    return 2;
  }

  const report = measureTitles(items);
  if (asJson) {
    out(JSON.stringify({ ...report, skipped_files: skipped }, null, 2));
  } else {
    printHuman(report, skipped, ti >= 0, out);
  }
  return report.failed ? 1 : 0;
}

function printHuman(r: Report, skipped: { path: string; reason: string }[], showAll: boolean, out: Out): void {
  const rule = "-".repeat(78);
  out(`Checked ${r.total} title(s). Safe <= ${SAFE}px / edge > ${EDGE}px / cut > ${HARD}px (Arial 22px, measured ${MODEL.measured_on}).`);
  if (r.boilerplate_tails.length) {
    out("Boilerplate tails: " + r.boilerplate_tails.map((b) => `"${b.tail}" x${b.count}`).join(", "));
  }
  out(rule);
  for (const x of [...r.results].sort((a, b) => b.px - a.px)) {
    if (!showAll && !x.fails.length && !x.warns.length) continue;
    const status = x.fails.length ? "FAIL" : x.warns.length ? "warn" : "ok";
    out(`[${status}] ${x.src}`);
    out(`   ${x.title}`);
    out(`   ${x.px.toFixed(1)}px / ${x.full_width_units.toFixed(1)} full-width characters / ${x.tier}`);
    for (const f of x.fails) out(`   [FAIL] ${f.message}`);
    for (const w of x.warns) out(`   [warn] ${w.message}`);
    out("");
  }
  if (skipped.length) out(`Skipped ${skipped.length} file(s) with no readable <title>.`);
  out(rule);
  out(`Passed ${r.total - r.failed} / must fix ${r.failed}`);
}

const write = (stream: NodeJS.WriteStream) => (s: string) => { stream.write(s + "\n"); };
process.exitCode = main(process.argv.slice(2), write(process.stdout), write(process.stderr));
