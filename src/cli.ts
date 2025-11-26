#!/usr/bin/env node
import { Command } from "commander";
import fg from "fast-glob";
import fs from "fs/promises";
import chalk from "chalk";
import { parseStoryboardFile } from "./patcher/saxParser.js";
import { computePatchOpsForFile } from "./tokenizer/locator.js";
import { applyPatchOpsToFile } from "./tokenizer/injector.js";

const program = new Command();
program
	.name("parsenode")
	.description("ParseNode — text-preserving accessibility injector")
	.version("1.0.0")
	.option("--path <folder>", "Root path to search for storyboards/xibs", ".")
	.option("--file <file>", "Single storyboard/xib file to process")
	.option("--apply", "Apply changes (writes patched files & backups)", false)
	.option("--dry-run", "Do not write any files (default)", true)
	.option("--out <path>", "Custom output path for patched file (single-file mode)")
	.option("--report <path>", "Write JSON report of changes")
	.option("--prefix <prefix>", "Global identifier prefix", "")
	.option("--allowlist <csv>", "Comma-separated tags to include", "")
	.parse(process.argv);

const opts = program.opts();

async function processFile(file: string) {
	const raw = await fs.readFile(file, "utf8");
	const records = parseStoryboardFile(file);
	const ops = computePatchOpsForFile(raw, records);

	console.log(chalk.blue(`\n${file}: found ${records.length} tracked elements; planned ops: ${ops.length}`));
	if (ops.length === 0) return { file, ops: [] };

	for (const op of ops) {
		const outletInfo = op.record.outletName ? chalk.green(` [outlet: ${op.record.outletName}]`) : chalk.gray(' [no outlet]');
		console.log(chalk.yellow(` - ${op.record.tag} lines ${op.record.startLine}-${op.record.endLine}${outletInfo}`));
	}

	const res = await applyPatchOpsToFile(file, raw, ops, {
		dryRun: !opts.apply,
		backup: true,
		outPath: opts.out ?? `${file}`
	});

	return { file, ops: ops.map(o => ({ tag: o.record.tag, insertIndex: o.insertIndex, text: o.insertText.trim() })) };
}

(async () => {
	const files: string[] = [];
	if (opts.file) files.push(opts.file);
	else {
		const found = await fg(["**/*.storyboard", "**/*.xib"], { cwd: opts.path, absolute: true });
		files.push(...found);
	}

	const report: any[] = [];
	for (const file of files) {
		try {
			const r = await processFile(file);
			report.push(r);
		} catch (e) {
			console.error(chalk.red(`Error processing ${file}: ${(e as Error).message}`));
		}
	}

	if (opts.report) {
		await fs.writeFile(opts.report, JSON.stringify(report, null, 2), "utf8");
		console.log(chalk.green(`Report written to ${opts.report}`));
	}

	console.log(chalk.green("\nParseNode finished."));
})();
