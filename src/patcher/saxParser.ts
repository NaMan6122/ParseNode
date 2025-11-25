// src/tokenizer/saxParser.ts
import { readFileSync } from "fs";
import { SaxesParser, SaxesTag } from "saxes";

/**
 * Minimal record describing a UI element in the storyboard that we care about.
 */
export type ElementRecord = {
  tag: string;
  attrs: Record<string, string>;
  startIndex: number;    // byte index in original text where the open tag starts
  startOffset: number;   // same as startIndex (alias)
  openTagEndIndex: number; // index right after the open tag ends (so children start after this)
  closeTagStartIndex?: number; // index where the closing tag starts (</tag>)
  endIndex?: number;     // index right after the closing tag ends
  startLine?: number;
  endLine?: number;
  hasAccessibility: boolean;
  accessibilityAttrs?: Record<string, string>;
};

/**
 * Tags we want to track as UI elements (common Xcode storyboard element names).
 * You can extend this list from config.
 */
const TRACK_TAGS = new Set([
  "button","label","textField","textView","imageView","switch","slider","stepper",
  "segmentedControl","tableViewCell","collectionViewCell","view","barButtonItem",
  "navigationItem","navigationBar","stackView","tableView","collectionView"
]);

/**
 * Parse a storyboard/xib file and return ElementRecords.
 *
 * Important: We parse the raw text and use the parser's position indices to map back to the text.
 */
export function parseStoryboardFile(filepath: string): ElementRecord[] {
  const raw = readFileSync(filepath, "utf8");
  const parser = new SaxesParser({ xmlns: false, position: true });

  // We'll track a stack of open elements with their start indices and attrs
  type StackEntry = {
    tag: string;
    attrs: Record<string, string>;
    startIndex: number;
    openTagEndIndex?: number;
    // temporary flags
    hasAccessibility?: boolean;
    accessibilityAttrs?: Record<string, string>;
    startLine?: number;
  };

  const stack: StackEntry[] = [];
  const results: ElementRecord[] = [];

  // Helper: convert index->line number by counting '\n'
  function indexToLine(idx: number) {
    // lines are 1-based line numbers
    const prefix = raw.slice(0, Math.max(0, idx));
    return prefix.split(/\r\n|\r|\n/).length;
  }

  // Saxes gives tag info in onopentag with parser.position available.
  parser.on("error", (err) => {
    // rethrow with file context
    throw new Error(`XML parse error in ${filepath}: ${err.message}`);
  });

  parser.on("opentag", (tag: SaxesTag) => {
    const tagName = tag.name;
    const lower = tagName;
    const attrs: Record<string, string> = {};
    for (const [k, v] of Object.entries(tag.attributes || {})) {
      if (v && typeof v === "object" && "value" in (v as any)) {
        attrs[k] = (v as any).value;
      } else {
        attrs[k] = String(v);
      }
    }

    const parserPos = (parser as any).position ?? (parser as any).pos ?? 0;
    const ltIndex = raw.lastIndexOf("<", Math.max(0, parserPos - 1));
    const startIndex = ltIndex >= 0 ? ltIndex : 0;

    const gtIndex = raw.indexOf("/>", parserPos - 1);
    const openTagEndIndex = gtIndex >= 0 ? gtIndex + 1 : parserPos;

    const stackEntry: StackEntry = {
      tag: lower,
      attrs,
      startIndex,
      openTagEndIndex,
      hasAccessibility: false,
      accessibilityAttrs: undefined,
      startLine: indexToLine(startIndex),
    };

    stack.push(stackEntry);

    if (lower === "accessibility") {
      if (stack.length >= 2) {
        const parent = stack[stack.length - 2];
        parent.hasAccessibility = true;
        parent.accessibilityAttrs = attrs;
      }
    }
  });

  parser.on("closetag", (tag) => {
    const tagName = tag.name;
    const parserPos = (parser as any).position ?? (parser as any).pos ?? 0;
    const closeLt = raw.lastIndexOf("</" + tagName, Math.max(0, parserPos - 1));
    const closeGt = raw.indexOf(">", closeLt >= 0 ? closeLt : parserPos - 1);
    const closeStartIndex = closeLt >= 0 ? closeLt : Math.max(0, parserPos - 1);
    const endIndex = closeGt >= 0 ? closeGt + 1 : parserPos;

    const entry = stack.pop();
    if (!entry) return;

    if (TRACK_TAGS.has(entry.tag)) {
      const rec: ElementRecord = {
        tag: entry.tag,
        attrs: entry.attrs,
        startIndex: entry.startIndex,
        startOffset: entry.startIndex,
        openTagEndIndex: entry.openTagEndIndex ?? entry.startIndex,
        closeTagStartIndex: closeStartIndex,
        endIndex: endIndex,
        startLine: entry.startLine,
        endLine: indexToLine(endIndex),
        hasAccessibility: !!entry.hasAccessibility,
        accessibilityAttrs: entry.accessibilityAttrs,
      };
      results.push(rec);
    } else {
    }
  });

  parser.write(raw).close();

  results.sort((a, b) => (a.startIndex - b.startIndex));
  return results;
}
