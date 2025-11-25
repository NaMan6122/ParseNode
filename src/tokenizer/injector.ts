// src/patcher/injector.ts
import fs from "fs/promises";
import { PatchOp } from "./locator.js";

export type InjectorResult = {
  applied: number;
  ops: PatchOp[];
  backupPath?: string;
  outPath?: string;
};

export async function applyPatchOpsToFile(filepath: string, rawText: string, ops: PatchOp[], options?: {
  dryRun?: boolean;
  backup?: boolean;
  outPath?: string;
}): Promise<InjectorResult> {
  const cfg = { dryRun: true, backup: true, outPath: filepath + ".patched.storyboard", ...options };
  if (ops.length === 0) {
    return { applied: 0, ops };
  }

  // Create backup if requested
  let backupPath: string | undefined;
  if (!cfg.dryRun && cfg.backup) {
    backupPath = filepath + ".bak";
    await fs.writeFile(backupPath, rawText, "utf8");
  }

  // Apply ops in reverse by byte index
  let out = rawText;
  for (let i = ops.length - 1; i >= 0; --i) {
    const op = ops[i];
    const idx = op.insertIndex;
    out = out.slice(0, idx) + op.insertText + out.slice(idx);
  }

  if (!cfg.dryRun) {
    await fs.writeFile(cfg.outPath!, out, "utf8");
  }

  return { applied: ops.length, ops, backupPath, outPath: cfg.dryRun ? undefined : cfg.outPath };
}
