// src/patcher/generator.ts
export function sanitizeIdPart(idpart: string) {
  if (!idpart) return "noid";
  return idpart.replace(/\s+/g, "_").replace(/[^A-Za-z0-9_\-:.]/g, "_");
}

const PREFIX_MAP: Record<string,string> = {
  button: "btn", label: "lbl", textField: "txt", textView: "txtv",
  imageView: "img", switch: "swi", slider: "sld", stepper: "stp",
  segmentedControl: "seg", tableViewCell: "cell", collectionViewCell: "ccell",
  view: "view", barButtonItem: "barbtn", navigationItem: "navitem",
  navigationBar: "navbar", stackView: "stack", tableView: "table",
  collectionView: "collection"
};

export function makeIdentifier(tag: string, idAttr?: string): string {
  const prefix = PREFIX_MAP[tag] || "el";
  const idpart = sanitizeIdPart(idAttr || "");
  return `${prefix}_${idpart}`;
}

/**
 * Build a single-line or multi-line <accessibility .../> string.
 * We choose a compact single-line insertion to keep diffs small, but keep indentation.
 */
export function buildAccessibilityLine(indent: string, identifier: string) {
  const acc = `${indent}<accessibility key="accessibilityConfiguration" identifier="${identifier}" label="${identifier}"/>\n`;
  return acc;
}
