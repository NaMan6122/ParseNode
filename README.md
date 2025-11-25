# ParseNode

A text-preserving accessibility injector for Xcode Storyboards and XIB files.

## Features

- 🎯 Automatically adds accessibility identifiers to UI elements in Storyboard/XIB files
- 🔒 Preserves exact formatting and indentation
- ⚡ Fast SAX-based parsing with minimal memory footprint
- 🛠️ Works as both CLI tool and programmatic API
- ✨ Handles self-closing tags correctly
- 📝 Generates consistent, predictable identifiers

## Installation

### Global Installation (CLI)

```bash
npm install -g parsenode
```

### Project Installation

```bash
npm install parsenode --save-dev
```

## Usage

### CLI

Process a single file:
```bash
parsenode --file path/to/YourView.storyboard --apply
```

Process multiple files with glob patterns:
```bash
parsenode --glob "Views/**/*.storyboard" --apply
```

Dry run (preview changes without applying):
```bash
parsenode --file path/to/YourView.storyboard
```

### Programmatic API

```javascript
import { parseStoryboardFile } from 'parsenode';
import { computePatchOpsForFile } from 'parsenode';
import { applyPatchOpsToFile } from 'parsenode';
import { readFileSync } from 'fs';

// Parse storyboard and get UI elements
const elements = parseStoryboardFile('./path/to/View.storyboard');

// Compute what changes to make
const rawText = readFileSync('./path/to/View.storyboard', 'utf8');
const ops = computePatchOpsForFile(rawText, elements);

// Apply changes
await applyPatchOpsToFile(
  './path/to/View.storyboard',
  rawText,
  ops,
  { dryRun: false, backup: true }
);
```

## How It Works

ParseNode scans your Storyboard/XIB files for UI elements (buttons, labels, text fields, etc.) that don't have accessibility identifiers. It then generates and injects `<accessibility>` tags with identifiers based on the element type and existing ID attributes.

### Example

**Before:**
```xml
<button opaque="NO" contentMode="scaleToFill" id="abc-123">
    <rect key="frame" x="0" y="0" width="100" height="44"/>
</button>
```

**After:**
```xml
<button opaque="NO" contentMode="scaleToFill" id="abc-123">
    <rect key="frame" x="0" y="0" width="100" height="44"/>
    <accessibility key="accessibilityConfiguration" identifier="btn_abc-123" label="btn_abc-123"/>
</button>
```

## Supported UI Elements

- button
- label
- textField
- textView
- imageView
- switch
- slider
- stepper
- segmentedControl
- tableViewCell
- collectionViewCell
- view
- barButtonItem
- navigationItem
- navigationBar
- stackView
- tableView
- collectionView

## Options

### CLI Options

- `--file <path>` - Process a single file
- `--glob <pattern>` - Process files matching glob pattern
- `--apply` - Apply changes (omit for dry run)

## License

MIT

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.
