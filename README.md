# noter

A Chrome/Chromium extension for annotating UI elements. Hover to highlight, click to select, capture a screenshot of the element, write a note, then export everything as a Markdown or JSON document ready to hand to an AI agent.

---

## Install

1. Open Chrome and go to `chrome://extensions`
2. Enable **Developer mode** (top-right toggle)
3. Click **Load unpacked**
4. Select this folder: the **noter** project root (this repository)

The extension icon will appear in your toolbar.

---

## How to use

| Step | Action |
|------|--------|
| 1 | Click the extension icon in the toolbar |
| 2 | Turn **Noting** on (toggle in the popup) |
| 3 | Hover over the page — elements highlight in orange |
| 4 | Click an element to capture a screenshot and open the note dialog |
| 5 | Write your note, then press **Save Note** (or `⌘↵` / `Ctrl↵`) |
| 6 | A numbered orange badge appears on the annotated element |
| 7 | Repeat for as many elements as needed |
| 8 | Open the popup → copy or download Markdown for a saved session |

Press **Esc** at any time to stop noting without losing saved notes.

---

## Export formats

### Markdown (`.md`)
Human-readable document with embedded base64 screenshots. Best for pasting directly into a chat with an AI agent.

```
# UI Annotations

| | |
|---|---|
| Page | OCEAN - Pool Statistics |
| URL  | http://localhost:3002/dashboard |
| Total Annotations | 3 |

## Annotation #1
| Field | Value |
|---|---|
| Element | `.stats-card:nth-of-type(2)` |
| Position | x: 640, y: 200 |
| Size | 300 × 150 px |

### Note
> The hashrate shows GH/s but should show TH/s.

### Screenshot
![Annotation #1](data:image/png;base64,...)
```

### JSON (`.json`)
Structured data with all annotation metadata plus base64 screenshots. Ideal for programmatic agent pipelines.

```json
{
  "meta": {
    "tool": "noter v1.0",
    "page": "OCEAN - Pool Statistics",
    "url": "http://localhost:3002/dashboard",
    "exported": "2026-05-14T12:00:00.000Z",
    "count": 3
  },
  "annotations": [
    {
      "id": 1,
      "selector": ".stats-card:nth-of-type(2)",
      "tagName": "div",
      "innerText": "450.2 GH/s Total Hashrate",
      "rect": { "x": 640, "y": 200, "width": 300, "height": 150 },
      "note": "The hashrate shows GH/s but should show TH/s.",
      "screenshot": "data:image/png;base64,...",
      "timestamp": "2026-05-14T12:00:00.000Z",
      "pageUrl": "http://localhost:3002/dashboard",
      "pageTitle": "OCEAN - Pool Statistics"
    }
  ]
}
```

---

## Notes

- Screenshots capture only the **visible viewport** at the time of click. Scroll the element into view before annotating for best results.
- Annotations are stored **in-page memory** only — refreshing the page clears them. Export before refreshing.
- The extension does not work on `chrome://` or `edge://` internal pages (browser restriction).
- Device pixel ratio is accounted for on Retina/HiDPI displays.
