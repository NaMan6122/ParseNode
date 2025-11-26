# ParseNode Architecture

## Overview

ParseNode is a text-preserving accessibility injector for Xcode Storyboard and XIB files. It uses SAX-based XML parsing to identify UI elements and inject accessibility tags while maintaining exact formatting, indentation, and whitespace.

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                          CLI Entry Point                             │
│                           (cli.ts)                                   │
│  - Parses command-line arguments                                     │
│  - Handles file/glob patterns                                        │
│  - Orchestrates the entire process                                   │
└────────────────┬────────────────────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────────────────────┐
│                     File Discovery & Reading                         │
│  - Uses fast-glob for pattern matching                               │
│  - Reads storyboard/XIB files as UTF-8 text                         │
└────────────────┬────────────────────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    PHASE 1: PARSING PHASE                            │
│                     (saxParser.ts)                                   │
│                                                                       │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  1. SAX Parser Initialization                                │   │
│  │     - Creates saxes parser with position tracking            │   │
│  │     - Reads raw file content                                 │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                           │                                          │
│                           ▼                                          │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  2. Stream-based XML Parsing                                 │   │
│  │     Event-driven parsing with 3 main handlers:               │   │
│  │                                                               │   │
│  │     A) opentag event:                                        │   │
│  │        - Captures tag name, attributes                       │   │
│  │        - Records byte position (startIndex)                  │   │
│  │        - Detects self-closing tags (/>)                      │   │
│  │        - Pushes to stack for tracking hierarchy              │   │
│  │        - Special handling for <outlet> tags                  │   │
│  │                                                               │   │
│  │     B) closetag event:                                       │   │
│  │        - Pops element from stack                             │   │
│  │        - Determines if self-closing or regular               │   │
│  │        - Records closeTagStartIndex and endIndex             │   │
│  │        - Creates ElementRecord for tracked tags              │   │
│  │                                                               │   │
│  │     C) Outlet tracking:                                      │   │
│  │        - When <outlet> tag detected                          │   │
│  │        - Extracts property="..." and destination="..."       │   │
│  │        - Stores in outletMap: ID → Property Name             │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                           │                                          │
│                           ▼                                          │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  3. Post-Parse Processing                                    │   │
│  │     - Iterate through all ElementRecords                     │   │
│  │     - Look up each element's ID in outletMap                 │   │
│  │     - Assign outletName if mapping exists                    │   │
│  │     - Sort records by startIndex                             │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                           │                                          │
│                           ▼                                          │
│              Returns: Array<ElementRecord>                           │
└────────────────┬────────────────────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────────────────────┐
│                   PHASE 2: PATCH COMPUTATION                         │
│                      (locator.ts)                                    │
│                                                                       │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  1. Filter Elements                                          │   │
│  │     - Skip elements that already have accessibility tags     │   │
│  │     - Process only elements needing injection                │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                           │                                          │
│                           ▼                                          │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  2. Determine Insertion Point                                │   │
│  │     For each element:                                        │   │
│  │     - Use closeTagStartIndex (or endIndex/openTagEndIndex)   │   │
│  │     - Detect if self-closing tag                             │   │
│  │     - Find last newline before insertion point               │   │
│  │     - Extract indentation from that line                     │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                           │                                          │
│                           ▼                                          │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  3. Generate Identifier (Priority Order)                     │   │
│  │                                                               │   │
│  │     1st Priority: Custom idCallback (if provided)            │   │
│  │            ↓ (not used by default)                           │   │
│  │                                                               │   │
│  │     2nd Priority: Outlet Name                                │   │
│  │            ↓                                                  │   │
│  │            if (record.outletName) {                          │   │
│  │              identifier = record.outletName                  │   │
│  │              // e.g., "AddviaSearchTableView"                │   │
│  │            }                                                  │   │
│  │                                                               │   │
│  │     3rd Priority: Generated Identifier                       │   │
│  │            ↓                                                  │   │
│  │            makeIdentifier(tag, id)                           │   │
│  │            // e.g., "btn_abc-123" or "lbl_myLabel"           │   │
│  │                                                               │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                           │                                          │
│                           ▼                                          │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  4. Build Accessibility XML                                  │   │
│  │     - Use generator.ts to create XML string                  │   │
│  │     - Format: <accessibility key="..." identifier="..."      │   │
│  │                label="..."/>                                 │   │
│  │     - Add newline prefix for self-closing tags               │   │
│  │     - Preserve exact indentation                             │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                           │                                          │
│                           ▼                                          │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  5. Create PatchOp                                           │   │
│  │     {                                                         │   │
│  │       insertIndex: byte position to insert                   │   │
│  │       insertText: complete XML string to insert              │   │
│  │       record: reference to ElementRecord                     │   │
│  │     }                                                         │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                           │                                          │
│                           ▼                                          │
│              Returns: Array<PatchOp> (sorted by index)               │
└────────────────┬────────────────────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────────────────────┐
│                   PHASE 3: PATCH APPLICATION                         │
│                      (injector.ts)                                   │
│                                                                       │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  1. Backup Original File (if backup=true)                    │   │
│  │     - Write to <filename>.bak                                │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                           │                                          │
│                           ▼                                          │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  2. Apply Patches in Reverse Order                           │   │
│  │     Why reverse? To maintain correct byte positions          │   │
│  │                                                               │   │
│  │     for (i = ops.length - 1; i >= 0; i--) {                  │   │
│  │       const op = ops[i];                                     │   │
│  │       output = output.slice(0, op.insertIndex)               │   │
│  │              + op.insertText                                 │   │
│  │              + output.slice(op.insertIndex);                 │   │
│  │     }                                                         │   │
│  │                                                               │   │
│  │     This ensures earlier insertions don't affect             │   │
│  │     positions of later insertions                            │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                           │                                          │
│                           ▼                                          │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  3. Write Output File                                        │   │
│  │     - Original file (in-place update)                        │   │
│  │     - Or custom outPath if specified                         │   │
│  │     - Skip if dryRun=true                                    │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                           │                                          │
│                           ▼                                          │
│              Returns: InjectorResult with stats                      │
└────────────────┬────────────────────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────────────────────┐
│                        CLI Output & Reporting                        │
│  - Display statistics (elements found, ops performed)                │
│  - Show element details with outlet information                      │
│  - Optional JSON report generation                                   │
└─────────────────────────────────────────────────────────────────────┘
```

## Detailed Component Breakdown

### 1. saxParser.ts - XML Parsing Engine

**Purpose**: Parse storyboard XML and extract UI element metadata

**Key Data Structures**:

```typescript
// Outlet mapping built during parsing
outletMap: Map<string, string>
// Maps element ID → outlet property name
// Example: "o2c-QK-XGT" → "AddviaSearchTableView"

// Stack for tracking element hierarchy
stack: Array<StackEntry>
// Tracks open tags and their positions

// Final output
results: Array<ElementRecord>
```

**ElementRecord Structure**:
```typescript
{
  tag: string;                    // e.g., "button", "label"
  attrs: Record<string, string>;  // All XML attributes
  startIndex: number;             // Byte position of "<tag"
  openTagEndIndex: number;        // Byte position after ">" or "/>"
  closeTagStartIndex?: number;    // Byte position of "</tag" (or same as openTagEndIndex for self-closing)
  endIndex?: number;              // Byte position after closing ">"
  startLine?: number;             // Line number (1-based)
  endLine?: number;               // Line number (1-based)
  hasAccessibility: boolean;      // Already has <accessibility> child
  outletName?: string;            // IBOutlet property name if connected
}
```

**Parsing Flow**:

1. **Initialization**:
   - Create SAX parser with `position: true` for byte-level tracking
   - Initialize empty `outletMap` and `stack`

2. **opentag Event Handler**:
   ```typescript
   - Extract tag name and attributes
   - Calculate startIndex using parser.position
   - Detect self-closing tags by searching for "/>" 
   - Push StackEntry to stack
   - Special case: If tag === "outlet":
       * Extract property and destination attributes
       * Store in outletMap: destination → property
   ```

3. **closetag Event Handler**:
   ```typescript
   - Pop StackEntry from stack
   - Determine if self-closing:
       * Check if openTagEndIndex ends with "/>"
   - For self-closing tags:
       * closeTagStartIndex = openTagEndIndex
       * endIndex = openTagEndIndex
   - For regular tags:
       * Search for "</tagname>" 
       * Calculate closeTagStartIndex and endIndex
   - If tag is tracked (button, label, etc.):
       * Create ElementRecord
       * Add to results (outlet name set later)
   ```

4. **Post-Parse Processing**:
   ```typescript
   After parser.close():
   - For each ElementRecord in results:
       * Look up record.attrs.id in outletMap
       * If found: record.outletName = outletMap.get(id)
   - Sort results by startIndex
   ```

**Why Two-Phase Outlet Mapping?**

Outlets appear **after** the elements they reference in XML:

```xml
<tableView id="o2c-QK-XGT">...</tableView>   <!-- Parsed first -->
<connections>
  <outlet property="AddviaSearchTableView"    <!-- Parsed later -->
          destination="o2c-QK-XGT"/>
</connections>
```

So we must:
1. Parse entire file and collect outlets
2. Apply outlet names to elements after parsing completes

### 2. locator.ts - Patch Planning Engine

**Purpose**: Determine where and what to inject

**Algorithm**:

```typescript
For each ElementRecord:
  
  1. SKIP if hasAccessibility === true
  
  2. DETERMINE INSERTION POINT:
     closeStart = closeTagStartIndex ?? endIndex ?? openTagEndIndex
     
  3. DETECT SELF-CLOSING:
     isSelfClosing = (closeTagStartIndex === openTagEndIndex)
     
  4. CALCULATE INDENTATION:
     - Find last '\n' before closeStart
     - Extract whitespace from start of that line
     - This becomes the indent for accessibility tag
     
  5. GENERATE IDENTIFIER:
     Priority order:
     a) Custom callback (if provided)
     b) Outlet name (if exists): record.outletName
     c) Generated: makeIdentifier(tag, id)
     
  6. BUILD XML STRING:
     - If self-closing: prepend "\n"
     - Use buildAccessibilityLine(indent, identifier)
     - Result: "\n    <accessibility .../>\n" or "    <accessibility .../>\n"
     
  7. CREATE PATCHOP:
     {
       insertIndex: closeStart,
       insertText: xmlString,
       record: reference
     }
```

**Self-Closing Tag Handling**:

```xml
Before:
<barButtonItem key="..." id="abc"/>

After insertion at position after "/>":
<barButtonItem key="..." id="abc"/>
<accessibility key="..." identifier="..."/>

The "\n" prefix ensures it starts on new line.
```

**Regular Tag Handling**:

```xml
Before:
<button id="xyz">
    <rect key="frame" .../>
</button>

After insertion at position before "</button>":
<button id="xyz">
    <rect key="frame" .../>
    <accessibility key="..." identifier="..."/>
</button>
```

### 3. generator.ts - XML Generation

**Purpose**: Create properly formatted accessibility XML

**Functions**:

```typescript
makeIdentifier(tag: string, idAttr?: string): string
  - Generates fallback identifiers
  - Uses prefix map: button → "btn", label → "lbl", etc.
  - Format: prefix_sanitizedId
  - Example: "btn_abc-123", "lbl_myLabel"

buildAccessibilityLine(indent: string, identifier: string): string
  - Creates XML: "<accessibility key=\"accessibilityConfiguration\" 
                   identifier=\"{id}\" label=\"{id}\"/>\n"
  - Preserves exact indentation
  - Single-line format for minimal diff
```

### 4. injector.ts - File Modification Engine

**Purpose**: Apply patches to file content

**Why Reverse Order?**

Consider two insertions:
- Position 100: Insert "AAA"
- Position 200: Insert "BBB"

If we apply forward:
1. Insert "AAA" at 100 → text grows, position 200 is now at 203
2. Insert "BBB" at 200 → WRONG! Should be 203

If we apply reverse:
1. Insert "BBB" at 200 → text grows, but position 100 unchanged
2. Insert "AAA" at 100 → correct!

**Code**:
```typescript
let output = originalText;
for (let i = ops.length - 1; i >= 0; i--) {
  const op = ops[i];
  output = output.slice(0, op.insertIndex) 
         + op.insertText 
         + output.slice(op.insertIndex);
}
```

## IBOutlet Integration - Deep Dive

### How Xcode Storyboards Store Outlets

When you create an `@IBOutlet` in Xcode and connect it:

```objective-c
// ViewController.h
@property (nonatomic, weak) IBOutlet UITableView *addviaSearchTableView;
```

Xcode stores this in the storyboard XML:

```xml
<!-- The UI element with an ID -->
<tableView id="o2c-QK-XGT" ... >
  ...
</tableView>

<!-- Later in the XML, inside <connections> section -->
<connections>
  <outlet property="addviaSearchTableView" 
          destination="o2c-QK-XGT" 
          id="pRW-YQ-H5U"/>
</connections>
```

**Key Attributes**:
- `property`: The `@IBOutlet` property name from code
- `destination`: The `id` of the UI element it connects to
- `id`: Unique ID for the outlet connection itself (not used by us)

### ParseNode's Outlet Detection Strategy

**Step 1: Build the Mapping**

During SAX parsing, when we encounter `<outlet>` tags:

```typescript
if (tagName === "outlet") {
  const propertyName = attrs.property;    // "addviaSearchTableView"
  const destinationId = attrs.destination; // "o2c-QK-XGT"
  
  outletMap.set(destinationId, propertyName);
  // Now: Map["o2c-QK-XGT"] = "addviaSearchTableView"
}
```

**Step 2: Apply to Elements**

After parsing completes:

```typescript
for (const record of results) {
  const elementId = record.attrs.id;  // "o2c-QK-XGT"
  if (outletMap.has(elementId)) {
    record.outletName = outletMap.get(elementId); // "addviaSearchTableView"
  }
}
```

**Step 3: Use in Identifier Generation**

In `locator.ts`:

```typescript
if (record.outletName) {
  identifier = record.outletName;  // Use "addviaSearchTableView"
} else {
  identifier = makeIdentifier(tag, id); // Fallback: "table_o2c-QK-XGT"
}
```

### Complete Example Flow

**Input Storyboard**:
```xml
<viewController id="vc-123">
  <view id="view-456">
    <tableView id="o2c-QK-XGT">
      <rect key="frame" x="0" y="0" width="375" height="667"/>
    </tableView>
  </view>
  <connections>
    <outlet property="addviaSearchTableView" destination="o2c-QK-XGT" id="outlet-789"/>
  </connections>
</viewController>
```

**Parsing Sequence**:

1. Parse `<tableView id="o2c-QK-XGT">`:
   - Create ElementRecord with id="o2c-QK-XGT"
   - outletName = undefined (will be set later)

2. Parse `<outlet property="addviaSearchTableView" destination="o2c-QK-XGT">`:
   - Add to outletMap: "o2c-QK-XGT" → "addviaSearchTableView"

3. Post-processing:
   - Find ElementRecord with id="o2c-QK-XGT"
   - Lookup in outletMap: found "addviaSearchTableView"
   - Set record.outletName = "addviaSearchTableView"

4. Generate patch:
   - identifier = "addviaSearchTableView" (from outlet)
   - Create: `<accessibility identifier="addviaSearchTableView" label="addviaSearchTableView"/>`

**Output Storyboard**:
```xml
<tableView id="o2c-QK-XGT">
  <rect key="frame" x="0" y="0" width="375" height="667"/>
  <accessibility key="accessibilityConfiguration" 
                 identifier="addviaSearchTableView" 
                 label="addviaSearchTableView"/>
</tableView>
```

## Edge Cases & Special Handling

### 1. Self-Closing Tags

**Challenge**: Where to insert accessibility tag?

```xml
<barButtonItem key="..." id="abc"/>
```

**Solution**:
- Detect by checking if `openTagEndIndex` points to "/>"
- Insert **after** the "/>" with newline prefix
- Result:
  ```xml
  <barButtonItem key="..." id="abc"/>
  <accessibility .../>
  ```

### 2. Elements Without IDs

**Challenge**: How to map outlet when element has no ID?

```xml
<label text="Hello"/>  <!-- No id attribute -->
```

**Solution**:
- Can't map outlet (requires id)
- Fall back to generated identifier
- Uses tag type and other attributes if available

### 3. Duplicate Outlet Names

**Challenge**: Multiple elements with same outlet name (shouldn't happen but...)

**Solution**:
- Last one wins in the map
- Xcode wouldn't allow this normally
- Not explicitly handled (assumed valid storyboard)

### 4. Nested Elements

**Challenge**: Parent and child both tracked

```xml
<view id="parent">
  <button id="child"/>
</view>
```

**Solution**:
- Both get accessibility tags independently
- Stack-based tracking maintains hierarchy
- Each gets correct insertion point

### 5. Already Has Accessibility

**Challenge**: Element already has accessibility tag

```xml
<button id="abc">
  <accessibility key="..." identifier="existing"/>
</button>
```

**Solution**:
- Detect during parsing when `<accessibility>` is child
- Set `hasAccessibility = true` on parent
- Skip in locator.ts filtering phase

## Performance Characteristics

### Time Complexity
- **Parsing**: O(n) where n = file size in bytes
- **Outlet Mapping**: O(m) where m = number of elements
- **Patch Computation**: O(m)
- **Patch Application**: O(m × k) where k = average patch size
- **Overall**: O(n + m × k) ≈ O(n) for typical files

### Space Complexity
- **Outlet Map**: O(o) where o = number of outlets
- **Element Records**: O(m)
- **Stack**: O(d) where d = max XML depth
- **Output Buffer**: O(n + m × k)
- **Overall**: O(n) for typical files

### Scalability
- ✅ Handles large storyboards (1000+ elements)
- ✅ Streaming parser (doesn't load entire DOM)
- ✅ Single-pass parsing
- ✅ Efficient string operations

## File Format Preservation

### What We Preserve
1. ✅ Exact indentation (spaces/tabs)
2. ✅ Line endings (CRLF/LF)
3. ✅ Whitespace in attributes
4. ✅ Comment placement
5. ✅ XML declaration
6. ✅ Attribute order
7. ✅ Entity encoding

### How We Preserve
- **Byte-level positions**: Track exact positions in original file
- **No reformatting**: Never parse/reserialize entire XML
- **Surgical insertion**: Only insert at calculated positions
- **Context-aware indenting**: Extract indent from surrounding code

## Testing Considerations

### Unit Test Areas
1. Self-closing tag detection
2. Outlet mapping correctness
3. Identifier generation fallback
4. Indentation extraction
5. Patch order (reverse application)

### Integration Test Areas
1. Complete file processing
2. Backup creation
3. Multiple file glob patterns
4. Edge case storyboards

### Manual Test Checklist
- [ ] Large storyboard (500+ elements)
- [ ] All outlet names used correctly
- [ ] No outlets → fallback IDs work
- [ ] Self-closing and regular tags mixed
- [ ] Nested elements
- [ ] Already has accessibility (skip)
- [ ] Different indentation styles (2 space, 4 space, tabs)

## Extension Points

### Adding New Tag Types
Edit `TRACK_TAGS` in `saxParser.ts`:
```typescript
const TRACK_TAGS = new Set([
  "button", "label", 
  "customView", // Add new type
]);
```

### Custom Identifier Generation
Pass `idCallback` to `computePatchOpsForFile`:
```typescript
computePatchOpsForFile(raw, records, {
  idCallback: (r) => {
    // Custom logic
    return `custom_${r.tag}_${r.attrs.id}`;
  }
});
```

### Pre/Post Processing Hooks
Extend `applyPatchOpsToFile` to accept:
```typescript
{
  beforeWrite?: (content: string) => string,
  afterWrite?: (path: string) => void
}
```

## Troubleshooting Guide

### Issue: Outlet names not being used

**Symptoms**: All elements show `[no outlet]`

**Causes**:
1. Outlets defined in different file
2. Connection broken in Xcode
3. Parsing error in outlet extraction

**Debug**:
```bash
# Check if outlets exist
grep 'outlet property' YourFile.storyboard

# Check outlet count
grep -c 'outlet property' YourFile.storyboard
```

### Issue: Wrong insertion point

**Symptoms**: Malformed XML after insertion

**Causes**:
1. Self-closing tag detection failed
2. Position calculation off-by-one
3. Unusual XML formatting

**Debug**: Add logging in `saxParser.ts` closetag handler

### Issue: Indentation wrong

**Symptoms**: Accessibility tag has wrong indent

**Causes**:
1. Mixed tabs/spaces
2. Line ending issues (CRLF vs LF)
3. Empty lines before closing tag

**Fix**: Check `lastIndexOf("\n")` logic in `locator.ts`

## Future Enhancements

### Potential Features
1. **Batch mode**: Process multiple files in parallel
2. **Diff preview**: Show before/after without applying
3. **Undo support**: Automatic rollback on error
4. **Config file**: `.parsenoderc` for project settings
5. **VS Code extension**: Integrate into IDE
6. **CI/CD integration**: Pre-commit hooks
7. **Outlet validation**: Warn about missing outlets
8. **Custom templates**: User-defined accessibility format

### Performance Optimizations
1. **Parallel file processing**: Worker threads
2. **Incremental updates**: Only process changed files
3. **Caching**: Store parsed results
4. **Streaming output**: Don't buffer entire result

## Conclusion

ParseNode achieves its goals through:

1. **Precision**: Byte-level position tracking
2. **Preservation**: No XML reformatting
3. **Intelligence**: Outlet name integration
4. **Efficiency**: Single-pass streaming parser
5. **Reliability**: Reverse-order patch application

The architecture balances simplicity with power, making it maintainable while handling complex edge cases in Xcode's storyboard format.
