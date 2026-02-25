const events = new LS.EventEmitter();

window.b = s => new TextEncoder().encode(s); // b`string`
window.s = b => new TextDecoder().decode(b);

class EditorView extends View {
    constructor() {
        super({
            name: "EditorView",
            title: "Editor",
            container: LS.Create({
                class: "editor-panel"
            })
        });

        this.editor = window.editorInstance = new CodeEditor({ init: false });

        const defaultCode = `// Welcome to the Glitter Lang demo!\n// Type some code here and click "Compile" to see the output.\n// Then you can click "Run" to execute it.\n\nprint("Hello, World!");`;
        this.editor.setText(defaultCode);

        this.editor.init().then(() => {
            // Observe resize to adjust editor dimensions
            const resizeObserver = new ResizeObserver(() => {
                this.editor.resize(this.container.clientWidth, this.container.clientHeight);
                this.editor.render();
            });
    
            resizeObserver.observe(this.container);

            this.editor.resize(this.container.clientWidth, this.container.clientHeight);
            this.editor.render();
        });

        this.container.append(LS.Create([
            { tag: "ls-box", class: "row elevated", style: "position: absolute; left: 50%; transform: translateX(-50%); bottom: 20px;", inner: [
                (this.compileBtn = LS.Create({ tag: "button", tooltip: "Compile the current code <kbd>Ctrl+Enter</kbd>", inner: [ { tag: "i", class: "bi-hammer" }, " Compile" ] })),
                (this.runBtn = LS.Create({ tag: "button", tooltip: "Run the compiled code <kbd>Ctrl+Space</kbd>", inner: [ { tag: "i", class: "bi-play-fill" }, " Run" ], attributes: { disabled: "true" } }))
            ] },

            this.editor.container,

            // (this.input = LS.Create({ tag: "textarea", name: "input", style: "width: 100%; resize: vertical;", attributes: { spellcheck: "false" }, text: "var x = 10 + 10;" }))
        ]));

        this.compiled = null;

        this.handleCompile = this.compile.bind(this);
        this.handleRun = this.run.bind(this);
        this.handleSetCode = (data) => { this.editor.setText(data.code).render(); };

        this.compileBtn.addEventListener("click", this.handleCompile);
        this.runBtn.addEventListener("click", this.handleRun);
        events.on("glitter:set-code", this.handleSetCode);
    }

    destroy() {
        this.compileBtn.removeEventListener("click", this.handleCompile);
        this.runBtn.removeEventListener("click", this.handleRun);
        events.off("glitter:set-code", this.handleSetCode);
        super.destroy();
    }

    async compile() {
        this.compileBtn.setAttribute("state", "loading");
        
        // Wait two frames to ensure the loading animation is playing
        for(let i = 0; i < 2; i++) await new Promise((resolve) => requestAnimationFrame(() => resolve()));

        events.quickEmit("glitter:logs-clear");
        events.quickEmit("glitter:metrics-clear");
        events.quickEmit("glitter:ast-update", { ast: null });
        events.quickEmit("glitter:output-update", { text: "" });

        const stageLogger = (stage, level) => (message) => {
             events.quickEmit("glitter:log", { level, message: `[${stage}] ${message}` });
        };

        try {
            const t0 = performance.now();
            const tokens = Glitter.tokenize(this.editor.getText(), {
                onWarn: stageLogger("lex", "warn"),
                onNote: stageLogger("lex", "note")
            });
            const t1 = performance.now();
            const ast = Glitter.parse(tokens, {
                onWarn: stageLogger("parse", "warn"),
                onNote: stageLogger("parse", "note")
            });
            const t2 = performance.now();
            this.compiled = Glitter.compile(ast, {
                onWarn: stageLogger("compile", "warn"),
                onNote: stageLogger("compile", "note")
            });
            const t3 = performance.now();

            console.log(tokens);
            console.log(ast);
            console.log(this.compiled);

            events.quickEmit("glitter:ast-update", { ast, tokensCount: tokens.length });
            events.quickEmit("glitter:output-update", { text: this.compiled });

            const t4 = performance.now();

            stageLogger("performance", "info")(`Lexing: ${(t1 - t0).toFixed(2)} ms (${tokens.length} tokens), parsing: ${(t2 - t1).toFixed(2)} ms, compiling: ${(t3 - t2).toFixed(2)} ms`);
            stageLogger("performance", "info")(`Total time taken: ${(t3 - t0).toFixed(2)} ms`);
            stageLogger("performance", "debug")(`Other (ui & unrelated) time: ${(t4 - t3).toFixed(2)} ms`);
        } catch (err) {
            events.quickEmit("glitter:log", { level: "error", message: err?.message || String(err) });
            console.error(err);
            events.quickEmit("glitter:output-update", { text: "" });
            this.compiled = undefined;
        } finally {
            this.compileBtn.removeAttribute("state");
            this.runBtn.disabled = !this.compiled;
        }
    }

    run() {
        if (!this.compiled) {
            console.warn("Nothing has been compiled yet.");
            return;
        }

        try {
            const func = new Function(this.compiled);
            func();
        } catch (error) {
            events.quickEmit("glitter:log", { level: "error", message: `[runtime] ${error?.message || error}` });
        }
    }
}

class LogsView extends View {
    constructor() {
        super({
            name: "LogsView",
            title: "Compilation logs",
            container: LS.Create({
                class: "logs-panel",
                inner: [
                    { tag: "div", id: "log-output", class: "log-console" },
                    { tag: "div", id: "metrics", class: "metrics" }
                ]
            })
        });

        this.logOutput = this.container.querySelector("#log-output");
        this.metricsBox = this.container.querySelector("#metrics");

        this.handleLog = (data) => this.pushLog(data.level, data.message);
        this.handleClear = () => this.clearLogs();
        this.handleMetricsClear = () => { this.metricsBox.textContent = ""; };

        events.on("glitter:log", this.handleLog);
        events.on("glitter:logs-clear", this.handleClear);
        events.on("glitter:metrics-clear", this.handleMetricsClear);
    }

    destroy() {
        events.off("glitter:log", this.handleLog);
        events.off("glitter:logs-clear", this.handleClear);
        events.off("glitter:metrics-clear", this.handleMetricsClear);
        super.destroy();
    }

    clearLogs() {
        this.logOutput.replaceChildren();
    }

    pushLog(level, message) {
        const row = document.createElement("div");
        row.className = `log-entry ${level}`;
        const label = document.createElement("i");
        label.className = `bi-${level === "error" ? "exclamation-circle" : level === "warn" ? "exclamation-triangle" : "info-circle"}`;
        const text = document.createElement("span");
        text.textContent = message;
        row.appendChild(label);
        row.appendChild(text);
        this.logOutput.appendChild(row);
    }
}

class ASTView extends View {
    constructor() {
        let astTree;
        super({
            name: "ASTView",
            title: "AST Explorer",
            container: LS.Create({
                class: "ast-panel",
                inner: [
                    (astTree = LS.Create({ tag: "div" }))
                ]
            })
        });

        this.astTree = astTree;

        this.handleUpdate = (data) => {
            if(!this.isVisible) return;

            const { ast, tokensCount } = data;
            if(!ast) {
                this.renderAST(null);
                return;
            }
            if(tokensCount && tokensCount > 50000) {
                 events.quickEmit("glitter:log", { level: "warn", message: "AST rendering skipped due to large token count." });
                 return;
            }
            this.renderAST(ast);
        };

        events.on("glitter:ast-update", this.handleUpdate);
    }

    destroy() {
        events.off("glitter:ast-update", this.handleUpdate);
        super.destroy();
    }

    renderAST(ast) {
        this.astTree.replaceChildren();
        if (!ast) return;
        this.astTree.appendChild(this.createTreeNode(ast, "AST"));
    }

    literalClassFor(literalNode) {
        if (!literalNode) return "literal-unknown";
        if (literalNode.typeOf === Glitter.lang.TOKEN_NUMBER) return "literal-number";
        if (literalNode.typeOf === Glitter.lang.TOKEN_STRING) return "literal-string";
        if (literalNode.typeOf === Glitter.lang.TOKEN_LITERAL) {
            if (literalNode.value === "true" || literalNode.value === "false") return "literal-boolean";
            if (literalNode.value === "null" || literalNode.value === "undefined") return "literal-nullish";
        }
        return "literal-unknown";
    }

    truncateValue(val, limit = 20) {
        const str = String(val);
        if (str.length <= limit) return str;
        return `${str.slice(0, limit - 1)}...`;
    }

    createLeaf(value, label = "") {
        if(label === "type") {
            return;
        }

        const leaf = document.createElement("div");
        leaf.className = "tree-leaf";
        const formatted = typeof value === "string" ? `"${value}"` : String(value);
        leaf.textContent = label ? `${label}: ${formatted}` : formatted;
        return leaf;
    }

    createLiteralNode(node, label) {
        const branch = document.createElement("details");
        branch.open = false;
        branch.className = "tree-branch";

        const summary = document.createElement("summary");
        const descriptor = label ? `${label}: ` : "";
        summary.textContent = descriptor;

        const chip = document.createElement("span");
        chip.className = `literal-chip ${this.literalClassFor(node)}`;
        let literalValue = node.value;
        if (node.typeOf === Glitter.lang.TOKEN_STRING) {
            literalValue = `"${this.truncateValue(node.value)}"`;
        } else {
            literalValue = this.truncateValue(String(node.value ?? ""));
        }
        chip.textContent = literalValue;
        summary.append(" ");
        summary.appendChild(chip);
        branch.appendChild(summary);

        Object.keys(node).forEach((key) => {
            const child = this.createTreeNode(node[key], key);
            if(!child) return;
            branch.appendChild(child);
        });

        return branch;
    }

    createBranch(value, label, summaryText) {
        const branch = document.createElement("details");
        branch.open = (label === "span") ? false : true;
        branch.className = "tree-branch";
        const summary = document.createElement("summary");
        summary.textContent = label === "span" ? "span" : summaryText;
        branch.appendChild(summary);
        return branch;
    }

    createTreeNode(value, label = "") {
        if(label === "span") {
            return; // Temporary
        }

        if (value === null || typeof value !== "object") {
            return this.createLeaf(value, label);
        }

        if (Array.isArray(value)) {
            const branch = this.createBranch(value, label, label ? `${label}: Array(${value.length})` : `Array(${value.length})`);
            value.forEach((item, index) => {
                branch.appendChild(this.createTreeNode(item, `[${index}]`));
            });
            return branch;
        }

        if (value.type === Glitter.lang.TYPE_LITERAL) {
            return this.createLiteralNode(value, label);
        }

        const descriptor = value.type || "Object";
        const branch = this.createBranch(value, label, label ? `${label}: ${descriptor}` : descriptor);

        Object.keys(value).forEach((key) => {
            const child = this.createTreeNode(value[key], key);
            if(!child) return;
            branch.appendChild(child);
        });

        return branch;
    }
}

class OutputView extends View {
    constructor() {
        super({
            name: "OutputView",
            title: "Compiled Output",
            container: LS.Create({
                class: "output-panel",
                inner: [
                    { tag: "pre", id: "output", class: "output-console" }
                ]
            })
        });

        this.output = this.container.querySelector("#output");

        this.handleUpdate = async (data) => {
            if(!this.isVisible) return;

            if (window.prettier && window.prettierPlugins) {
                try {
                    if(!data._prettier) data.text = await prettier.format(data.text, {
                        parser: "babel",
                        plugins: prettierPlugins,
                        semi: true,
                        singleQuote: false,
                        tabWidth: 4,
                    });
                } catch (err) {
                    console.error(err);
                    events.quickEmit("glitter:log", { level: "error", message: err.message || err });
                }

                // If there are multiple outputviews, prevent re-formatting
                data._prettier = true;
            }

            const text = data.text;
            this.output.textContent = text.length > 10000 ? text.slice(0, 10000) + "..." : text;
        };

        events.on("glitter:output-update", this.handleUpdate);
    }

    destroy() {
        events.off("glitter:output-update", this.handleUpdate);
        super.destroy();
    }
}

class TerminalView extends View {
    constructor() {
        super({
            name: "TerminalView",
            title: "Terminal",
            container: LS.Create({
                class: "terminal-panel"
            })
        });

        this.terminal = window.terminalInstance = new AcceleratedTextGridRenderer({ init: false, welcomeMsg: "Welcome to Glitter Lang\nSee one of the examples to get started! " });

        this.terminal.welcome(); // Render a welcome message
        this.container.append(this.terminal.container);

        this.terminal.init().then(() => {
            // Observe resize to adjust terminal dimensions
            const resizeObserver = new ResizeObserver(() => {
                this.terminal.resize(this.container.clientWidth, this.container.clientHeight);
            });
    
            resizeObserver.observe(this.container);
            this.terminal.resize(this.container.clientWidth, this.container.clientHeight);
        });
    }
}


const layoutContainer = document.querySelector("#layout-container");
const headerContainer = document.querySelector("#editor-header");

const app = {
    layoutManager: new LayoutManager(layoutContainer, {
        layout: localStorage.getItem("default-layout") || "default",
    }),

    shortcutManager: new LS.ShortcutManager()
}

const menus = {
    // file: [
    //     { text: "New Project", action() { app.shortcutManager.triggerMapping("GLOBAL_NEW_PROJECT"); } },
    //     { text: "Open Project...", action() { app.shortcutManager.triggerMapping("GLOBAL_OPEN"); } },
    //     { text: "Save Project", action() { app.shortcutManager.triggerMapping("GLOBAL_SAVE"); } },
    //     { type: "separator" },
    //     { text: "Export Video...", action() {
    //         // ... Open export dialog
    //     } },

    //     ...isNode? [{ type: "separator" }, { text: "Exit", action() {
    //         window.close();
    //     } }] : [],
    // ],

    examples: [
        { text: "Hello World", action() {
            const code = `print("Hello, World!");`;
            events.quickEmit("glitter:set-code", { code });
        } },
    ],

    options: [
    ],

    layout: [
        { text: "Change Layout", items: app.layoutManager.getAvailableLayouts().map(layout => ({
            text: layout.title,
            action() {
                app.layoutManager.setSchema(layout.schema);
                localStorage.setItem("default-layout", layout.name);
            }
        })) }
    ],

    help: [
        { text: "Report bug", action() {
            window.open("https://github.com/the-lstv/glitterlang/issues?q=state%3Aopen%20label%3Abug");
        } },

        { text: "Request feature", action() {
            window.open("https://github.com/the-lstv/glitterlang/issues?q=state%3Aopen%20label%3Aenhancement");
        } },

        { type: "separator" },

        { text: "About", icon: "bi-stars", action() {
            LS.Modal.buildEphemeral({
                content: [
                    { tag: 'img', src: '/~/icon.svg', style: 'height: 8em; width: 100%; margin: auto;object-fit: contain' },
                    { tag: 'h2', inner: 'Glitter Language Demo', style: 'text-align: center; margin-bottom: 8px' },
                    { tag: 'p', inner: `Version 0.1 (Alpha)` },
                    { tag: 'p', inner: ['Created with love and hard work by Lukas (', { tag: 'a', href: 'https://lstv.space', target: '_blank', inner: 'https://lstv.space' }, ')'] },
                    { tag: 'p', inner: ['Source code available on ', { tag: 'a', href: 'https://github.com/the-lstv/glitterlang', target: '_blank', inner: 'GitHub' }] },
                ],
                buttons: [ { label: "Close" } ]
            });
        } },
    ],
};

for(const menuCategoryElement of headerContainer.querySelectorAll(".header-menu-category")) {
    const menuTitle = menuCategoryElement.innerText.toLowerCase();
    const menuItems = menus[menuTitle] || [];

    if(menuItems.length > 0) {
        new LS.Menu({
            adjacentElement: menuCategoryElement,
            items: menuItems,
            group: "ls-editor-header-menu"
        })
    }
}

const EditorViewInstance = new EditorView();
const LogsViewInstance = new LogsView();
const ASTViewInstance = new ASTView();
const OutputViewInstance = new OutputView();
const TerminalViewInstance = new TerminalView();
app.layoutManager.add(EditorViewInstance, LogsViewInstance, ASTViewInstance, OutputViewInstance, TerminalViewInstance);

app.shortcutManager.map({
    "GLOBAL_COMPILE": ["ctrl+enter", "ctrl+s"],
});

app.shortcutManager.assign("GLOBAL_COMPILE", () => {
    EditorViewInstance.compile();
});