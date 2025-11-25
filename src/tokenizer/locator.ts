// src/patcher/locator.ts
import type { ElementRecord } from "../patcher/saxParser.js";
import { makeIdentifier, buildAccessibilityLine } from "./generator.js";

export type PatchOp = {
  insertIndex: number;
  insertText: string;
  record: ElementRecord;
};

/**
 * Compute patch operations (where and what to insert)
 * with PERFECT formatting preservation.
 */
export function computePatchOpsForFile(
  rawText: string,
  records: ElementRecord[],
  options?: {
    idCallback?: (r: ElementRecord) => string;
  }
): PatchOp[] {
  const ops: PatchOp[] = [];

  for (const r of records) {
    if (r.hasAccessibility) continue;

    // Prefer the exact start of the closing tag
    const closeStart = r.closeTagStartIndex ?? r.endIndex ?? r.openTagEndIndex;
    if (typeof closeStart !== "number") continue;

    const lastNewlineBeforeClose = rawText.lastIndexOf("\n", closeStart);
    const closingTagLine =
      rawText.slice(lastNewlineBeforeClose + 1, closeStart) || "";

    const indentMatch = closingTagLine.match(/^(\s*)/);
    const indent = indentMatch ? indentMatch[1] : "";

    const idsrc = options?.idCallback
      ? options.idCallback(r)
      : makeIdentifier(
          r.tag,
          r.attrs.id ?? r.attrs.userLabel ?? r.attrs.accessibilityIdentifier
        );

    const insertText = buildAccessibilityLine(indent, idsrc);

    ops.push({
      insertIndex: closeStart,
      insertText,
      record: r,
    });
  }

  ops.sort((a, b) => a.insertIndex - b.insertIndex);

  return ops;
}
