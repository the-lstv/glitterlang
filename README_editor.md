![Editor Logo](https://cdn.extragon.cloud/file/f6ed596347380468.svg)
# LS Code Editor

LS Code editor is a modern, hardware-accelerated code/text editor for the web (in early development).

It's primarily useful when working with Glitter, because it's specifically designed for it (direct highlighting and intellisense support).

## Features
- 🚀 Super fast rendering
- 🖊️ Efficient syntax highlighting
- 🧠 Intellisense support for Glitter
- 🧩 Extensible
- 🎨 Easy theming
- 🧹 Predictable memory usage
- 📁 Handles very large files in read-only mode
- 🐜 Tiny size (~18Kb compressed)
- 🧑‍💻 Simple to use API

## The good
- Fast hardware-accelerated rendering, minimal thread work. Very fast in general.
- Very lightweight.
- More predictable memory usage than conventional editors
- Modern (2026), future growing feature set
- Easy configuration, theming and extensibility
- Simple, no regex, no DOM (for the text rendering), no layout recalculations, and no string operations
- In read-only mode, it can easily handle files of virtually any size
- In-place syntax highlighting possible
- Fast linear search
- Can also work as a hex viewer/editor or terminal thanks to the natural grid-based rendering

## The bad
- In **very** early development, not in an useable state yet (days worked on: 1 - you're early).
- Not as widely adapted and mature yet
- Currently only supports ASCII characters (other may not render correctly)
- Needs font conversion to a pre-computed msdf format, doesn't work with some font features, and has a limited character set
- Font ligatures are not supported yet (are planned)
- Worse accessibility support (since text doesn't exist in DOM), doesn't use native scrollbars
- WebGL 2.0 is required and adds initial overhead for getContext and shader compilation (but it's once only)
- In general, higher overhead per instance due to the GL context (but still smaller memory usage than other editors)
- Regex searching requires fallback/encoding of the editor buffer to a string
- Some things (that are WebGL rendered) cannot be styled with CSS

## How it compares to other editors
| Feature | LS Code Editor | Monaco Editor (VSCode) | CodeMirror 6 | Winner |
| --- | --- | --- | --- | --- |
| Rendering | WebGL, possibly WebGPU in the future | DOM-based | DOM-based |   |
| Rendering strategy | Grid-based view, no overhead for tokens, no string splitting, and layout is very cheap | DOM nodes for each token/line, causes layout (no proper use of transforms) | DOM nodes for each token/line |   |
| Overall Rendering Performance | Extremely fast. Disadvantaged by no hardware-accelerated scrolling or native text rendering, but this is overshadowed by virtually everything else. | Medium, struggles in some areas and relies a lot on webworkers | Medium (well optimized overall, rendering is not best case.) | ✔️ |
| Handling of large files | In read-only mode, virtually unlimited without slowdown up to 2³² lines (Uint32), JavaScript TypedArray handling & memory is the limit. Supports streaming. | Gives up somewhere between 200-400MB | Handles large files, but begins freaking out | ✔️ |
| Can browse zero-copy | Yes (no string ops) | No (uses strings) | No (uses strings) | ✔️ |
| Memory Usage | Usually lower and more predictable (always the same for rendering per viewport, can reuse buffers, a lot less objects & less GC pressure), and cleanup is also simpler. Has larger usage at first, but it is mostly static. | Higher (dom nodes, objects, workers, strings, etc.) | Higher | ✔️ |
| Accessibility | Limited (browser doesn't see the text content) | Better | Better | ❌ |
| Code simplicity | Simple API, one file, no dependencies apart from LS itself | Complex | Heavily abstracted | ✔️ |
| Code size | Small (one file, ~41kb *un*-compressed, ~18kb compressed)* | Gigantic (6MB compressed for just the core) | Large (1.6MB+ compressed) | ✔️ |
| Startup time/overhead | Fast (WebGL context creation is the main overhead, after that it's quite fast, and less network overhead due to smaller size) | Quite slow, heavy webworker usage, and takes long to download | Medium, significantly lighter than Monaco | ✔️ |
| Feature set | Currently very limited, but planned to outmatch Monaco | Feature-rich and mature | Feature-rich and mature, lighter than Monaco | ❌ |

\* The size is expected to grow as it's still in early development, though likely not as much as the other editors.


## API (stub, subject to change)
Import either in Akeno with `@use(ls:5.2.9[CodeEditor]);` or via the CDN script link, or as a file.
I may release it as a package at some point maybe. You will also need the font files to be acessible (JSON & png).

```js
const editor = new LS.CodeEditor();

// Optionally set theme. Nearly any color format is supported (see LS.Color).
// Unspecified colors will fall back to defaults.
editor.setTheme({
    background: '#282c34',
    text: '#abb2bf',
    keyword: '#c678dd',
    string: '#98c379',
    comment: '#5c6370',
    // ...
});

// Set the content of the editor.
// If you have it as a Uint8Array, that is preferable.
editor.setText(`function helloWorld() {
    console.log("Hello, world!");
}`);

// Optionally set the size of the editor
editor.resize(800, 600);

// Append the editor to the DOM
document.body.appendChild(editor.container);

// To cleanup, call editor.destroy();
```


### Switching states
The editor state can be saved and loaded when switching documents. It will remember the scroll position, cursor position, and other, without separate instances or extra overhead.
```js
const state = editor.state;

const newState = new LS.CodeEditor.EditorState();
newState.load(`Some different code`); // Same as editor.setText()

// Switch to the new state
editor.setState(newState);

// ...

// switch back to the previous state
editor.setState(state);
```

### Exporting content/diffs
```js
// Export the current editor data. Avoid calling this too often.
editor.getBuffer(); // builds and returns an Uint8Array
editor.getText(); // builds, encodes and returns a string

// Accesses the original buffer that was set with setText or since the last commit (without changes)
editor.state.data;

// Commits the current state to the original buffer data.
// This cleans up the internal state and frees the tempoary append buffer. Warning: clears undo history too.
editor.state.commit();

editor.generateDiff(); // Get changes since the last commit
```

### Misc
```js
// You can limit the max framerate if you want to save global resources.
// It's recommended to keep it unlimited (-1) or 60, but limiting can reduce concurrency & resource usage, esp. if you do other rendering tasks on the same thread.
// You can also manually cancel or schedule frames.
editor.frameScheduler.limitFPS(30);

// Misc; read the current screen
// Directly builds a string from the rendered grid text data (what's visible on the screen). Likely not too useful apart from maybe snapshots.
editor.getScreenText();

// The following is not very useful as it'l get overwritten on/before the next editor render.
// But if you stop the editor rendering, this can be used to display any custom text independent of the editor content.
editor.setScreenText(`Some text`); // Clears the screen and writes text in lines from the top.
editor.writeText(text, col, row, r, g, b, a); // Write text starting from a position (with line wrapping) from a string, there's also writeTextFromBuffer for Uint8Arrays
editor.setChar(col, row, char, r, g, b, a); // Write a single character (char = char code)
editor.render(); // Schedule a render
```
















































