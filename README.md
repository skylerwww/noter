# noter

A Chrome/Chromium extension for annotating UI elements. Hover to highlight, click to select, capture a screenshot of the element, write a note, then export everything as a Markdown or JSON document ready to hand to an AI agent.
<img width="348" height="324" alt="Screenshot 2026-05-16 at 6 48 11 PM" src="https://github.com/user-attachments/assets/6f14ef84-268c-4919-b6da-05a3699e91dd" />

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
| Page | Acme — Settings |
| URL  | https://example.com/settings |
| Total Annotations | 3 |

## Annotation #1
| Field | Value |
|---|---|
| Element | `button.save-btn` |
| Position | x: 640, y: 200 |
| Size | 120 × 40 px |

### Note
> Button label should say "Save changes", not "Save".

### Screenshot
![Annotation #1](data:image/png;base64,...)
```

### JSON (`.json`)
Structured data with all annotation metadata plus base64 screenshots. Ideal for programmatic agent pipelines.

```json
{
  "meta": {
    "tool": "noter v1.0",
    "page": "Acme — Settings",
    "url": "https://example.com/settings",
    "exported": "2026-05-14T12:00:00.000Z",
    "count": 3
  },
  "annotations": [
    {
      "id": 1,
      "selector": "button.save-btn",
      "tagName": "button",
      "innerText": "Save",
      "rect": { "x": 640, "y": 200, "width": 120, "height": 40 },
      "note": "Button label should say \"Save changes\", not \"Save\".",
      "screenshot": "data:image/png;base64,...",
      "timestamp": "2026-05-14T12:00:00.000Z",
      "pageUrl": "https://example.com/settings",
      "pageTitle": "Acme — Settings"
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
