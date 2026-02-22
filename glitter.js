/**
 * Experimental Glitter compiler implementation in vanilla JavaScript (as a proof of concept)
 * Later to be properly rewritten in C++
 * 
 * Pipeline: Tokenization (lexer) -> Parsing -> AST Transformations (optional transformers) -> Code Generation (compiler)
 * 
 * Glitter is a target-agnostic programming language, meaning it can be compiled to multiple backends and how it compiles can be heavily customized.
 * Included is a JavaScript backend as a demonstration.
 * 
 * Copyright (c) 2026 lstv.space
 * Licensed under the GNU General Public License v3.0
 */

const isNode = typeof process !== "undefined" && process.versions != null && process.versions.node != null;

/**
 * Language definitions and helpers
 */
const lang = {
    // --- Checks for the tokenizer ---

    isStringDelimiter(char) {
        return char === 34 || char === 39 || char === 96; // " ' `
    },

    isWhitespace(char) {
        return char === 32 || char === 9 || char === 10 || char === 13; // space, tab, LF, CR
    },

    isIdentStart(char) {
        // $ or _
        if (char === 36 || char === 95) return true;

        // A-Z a-z
        if ((char >= 65 && char <= 90) || (char >= 97 && char <= 122)) return true;

        // Non-ASCII: Unicode ID_Start
        if (char <= 0x7F) return false;
        return // TODO: Implement Unicode ID_Start check
            false;
    },

    isIdentPart(char) {
        // $ or _
        if (char === 36 || char === 95) return true;

        // 0-9 A-Z a-z
        if ((char >= 48 && char <= 57) ||
            (char >= 65 && char <= 90) ||
            (char >= 97 && char <= 122)) return true;

        // ZWNJ / ZWJ allowed in identifier parts in ECMAScript
        if (char === 0x200C || char === 0x200D) return true;

        if (char <= 0x7F) return false;
        return // TODO: Implement Unicode ID_Continue check
            false;
    },

    isDigit(char) {
        return char >= 48 && char <= 57; // 0-9
    },

    isHexDigit(char) {
        return (char >= 48 && char <= 57) || // 0-9
               (char >= 65 && char <= 70) || // A-F
               (char >= 97 && char <= 102);  // a-f
    },

    isSLCommentStart(char1, char2) {
        return (char1 === 47 && char2 === 47) || char1 === 35; // // or #
    },

    isMLCommentStart(char1, char2) {
        return char1 === 47 && char2 === 42; // /*
    },

    // We use indexOf for comments because it's faster in JS
    SLCommentEnd: "\n",
    // MLCommentEnd: "*/",

    SLCommentEndCharCode: 10, // \n

    // But for multiline comments we have to keep line and column count, so no optimization :(
    isMLCommentEnd(char1, char2) {
        return char1 === 42 && char2 === 47; // */
    },


    // --- Language definitions ---

    declares: new Set([
        "var",
        "let",
        "const",
        "global",
        "local",

        "function",
        "fn",
        "class",
        "import",
        "interface",
        "type",
        "enum",
        "struct",
        "union",
        "module",
        "namespace",
        "using"
    ]),

    keywords: new Set([
        "if", "else",
        "while", "do", "for",
        "switch", "case", "default",
        "break", "continue", "return", "exclude",
        "try", "catch", "finally",
        "throw",
        "async", "await", "inline", "comptime",
        "new", "extends", "private", "public", "protected", "static", "destructible",
        "this",
        "in",
        "void",
        "super",
        "yield",
        "export"
    ]),

    specials: new Set([
        "intern",
        "extern",
        "macro",
        "arrayStruct",
        "raw",
        "char"
    ]),

    // Spec defined global constants and functions, every backend may implement these differently, but accurately
    constants: new Map([
        ["π", "3.141592653589793"],
        ["Π", "3.141592653589793"],
        ["PI", "3.141592653589793"],
        ["E", "2.718281828459045"],
        ["τ", "6.283185307179586"],
        ["TAU", "6.283185307179586"],
        ["SQRT2", "1.4142135623730951"],
        ["LOG2E", "1.4426950408889634"],
        ["EPSILON", "2.220446049250313e-16"],

        /**
         * Clamps a number between min and max
         */
        ["clamp", { ns: "Math", global: true }],

        /**
         * Deep clones an object or array
         */
        ["deepClone", { ns: "Value", global: true }],

        /**
         * Deeply compares two values for equality
        */
        ["deepEqual", { ns: "Value", global: true }],

        /**
         * Prints to console or stdout
        */
        ["print", { ns: "Console", global: true }],

        /**
         * Sleeps for a given number of milliseconds (in JS this is either via setTimeout or await)
        */
        ["sleep", { ns: "Time", global: true }]
    ]),

    // Literals can have units (e.g. 5ms, 10s, 3h, 2d), which maps to their base value (eg. milliseconds)
    // These must be used explicitly (eg. fn (duration: Duration) {})
    units: new Map([
        ["ms", { ns: "Duration", multiplier: 1, base: true }],
        ["s",  { ns: "Duration", multiplier: 1000 }],
        ["m",  { ns: "Duration", multiplier: 60000 }],
        ["h",  { ns: "Duration", multiplier: 3600000 }],
        ["d",  { ns: "Duration", multiplier: 86400000 }],
        ["w",  { ns: "Duration", multiplier: 604800000 }],

        // Percentages have some extra restrictions/special handling.
        // Eg. 1 * 50% = 0.5, 50% + 25% = 75%, but you cannot do 50% + 0.5
        ["%", { ns: "Percentage", multiplier: 0.01, percentage: true }],

        ["B", { ns: "DataSize", multiplier: 1, base: true }],
        ["KiB", { ns: "DataSize", multiplier: 1024 }],
        ["KiB", { ns: "DataSize", multiplier: 1024 }],
        ["MiB", { ns: "DataSize", multiplier: 1048576 }],
        ["GiB", { ns: "DataSize", multiplier: 1073741824 }],
        ["TiB", { ns: "DataSize", multiplier: 1099511627776 }],
        ["PiB", { ns: "DataSize", multiplier: 1125899906842624 }],
        ["KB", { ns: "DataSize", multiplier: 1000 }],
        ["MB", { ns: "DataSize", multiplier: 1000000 }],
        ["GB", { ns: "DataSize", multiplier: 1000000000 }],
        ["TB", { ns: "DataSize", multiplier: 1000000000000 }],
        ["PB", { ns: "DataSize", multiplier: 1000000000000000 }],

        ["Hz", { ns: "Frequency", multiplier: 1, base: true, invertsOf: "s" }],
        ["kHz", { ns: "Frequency", multiplier: 1000 }],
        ["MHz", { ns: "Frequency", multiplier: 1000000 }],
        ["GHz", { ns: "Frequency", multiplier: 1000000000 }],
        ["THz", { ns: "Frequency", multiplier: 1000000000000 }],
        ["PPM", { ns: "Frequency", multiplier: 0.000001 }],
        ["PPB", { ns: "Frequency", multiplier: 0.000000001 }],

        ["k", { ns: "Number", multiplier: 1000 }],
        ["m", { ns: "Number", multiplier: 1000000 }],
        ["g", { ns: "Number", multiplier: 1000000000 }],
        ["t", { ns: "Number", multiplier: 1000000000000 }],
        ["p", { ns: "Number", multiplier: 1000000000000000 }],
    ]),

    // Operator tokens
    operators: new Set([
        // Arithmetic
        "+", "-", "*", "/", "%", "++", "--", "**",

        // Equality / relational
        "==", "!=", "===", "!==", "<", ">", "<=", ">=",

        // Logical / nullish
        "&&", "||", "!", "??",
        "&&=", "||=", "??=",

        // Assignment
        "=", "+=", "-=", "*=", "/=", "%=", "**=",
        "&=", "|=", "^=", "<<=", ">>=", ">>>=",

        // Bitwise / shifts
        "&", "|", "^", "~", "<<", ">>", ">>>",

        // Member / punctuation
        ".", ",", ":", "...", "?.", "?.[", "?.(",

        // Misc
        "=>", "?", "::",

        // Memory
        "<-", "->", "<->", "*",

        // Type operators
        "instanceof", "typeof",

        // Other (delete is an operator in JS for some reason)
        "delete", "void",

        // Loops / iteration
        "@", "@@", "@@@", "@->", "@@->",

        // Pipeline operators
        "|>", "<|",

        "~>", "<~"
    ]),

    // Operator precedence table (higher is tighter binding)
    PRECEDENCE: {
        "=": 1, "+=": 1, "-=": 1, "*=": 1, "/=": 1, "%=": 1,
        "||": 2, "??": 2,
        "&&": 3,
        "|": 4,
        "^": 5,
        "&": 6,
        "==": 7, "!=": 7, "===": 7, "!==": 7,
        "<": 8, ">": 8, "<=": 8, ">=": 8,
        "<<": 9, ">>": 9, ">>>": 9,
        "+": 10, "-": 10,
        "*": 11, "/": 11, "%": 11,
        "**": 12
    },

    BRACKETS: {
        OPENING: new Set([40, 91, 123, 60]),
        CLOSING: new Set([41, 93, 125, 62]),
    },


    // --- Enums ---

    // Lexer states
    STATE_DEFAULT: 0,
    STATE_IDENTIFIER: 1,
    STATE_NUMBER: 2,

    // Lexer Token Types
    TOKEN_IDENTIFIER: "identifier",
    TOKEN_NUMBER: "number",
    TOKEN_STRING: "string",
    TOKEN_COMMENT: "comment",
    TOKEN_OPERATOR: "operator",
    TOKEN_KEYWORD: "keyword",
    TOKEN_DECLARATION: "declaration",
    TOKEN_LITERAL: "literal",
    TOKEN_OPENING_BRACE: "opening_brace",
    TOKEN_CLOSING_BRACE: "closing_brace",
    TOKEN_SEMICOLON: "semicolon",
    TOKEN_NL: "newline",
    TOKEN_UNIT: "unit",
    // TOKEN_IDENTIFIER: 0,
    // TOKEN_NUMBER: 1,
    // TOKEN_STRING: 2,
    // TOKEN_COMMENT: 3,
    // TOKEN_OPERATOR: 4,
    // TOKEN_KEYWORD: 5,
    // TOKEN_DECLARATION: 6,
    // TOKEN_LITERAL: 7,
    // TOKEN_OPENING_BRACE: 8,
    // TOKEN_CLOSING_BRACE: 9,
    // TOKEN_SEMICOLON: 10,
    // TOKEN_NL: 11,
    // TOKEN_UNIT: 12,

    // AST Node Types
    TYPE_DECLARATION: "DECLARATION",
    TYPE_FUNCTION: "FUNCTION",
    TYPE_IDENTIFIER: "IDENTIFIER",
    TYPE_LITERAL: "LITERAL",
    TYPE_EXPRESSION: "EXPRESSION",
    TYPE_EXPRESSION_STATEMENT: "EXPRESSION_STATEMENT",
    TYPE_STATEMENT: "STATEMENT",
    TYPE_UNARY_OP: "UNARY_OP",
    TYPE_BINARY_OP: "BINARY_OP",
    TYPE_BLOCK_STATEMENT: "BLOCK_STATEMENT",
    TYPE_PROGRAM: "PROGRAM",
    TYPE_ENUM_DECLARATION: "ENUM_DECLARATION",
    TYPE_CLASS_DECLARATION: "CLASS_DECLARATION",
    TYPE_CALL_EXPRESSION: "CALL_EXPRESSION",

    // Primitive value types (not the same as regular types)
    TYPE_VALUE: "VALUE",
    TYPE_NUMBER: "NUMBER",
    TYPE_STRING: "STRING",
    TYPE_BOOLEAN: "BOOLEAN",
    TYPE_NULL: "NULL",
    TYPE_UNDEFINED: "UNDEFINED",
}

const util = {
    constructValue(value) {
        switch(typeof value) {
            case "string": return { type: lang.TYPE_LITERAL, value, typeOf: "string" };
            case "number": return { type: lang.TYPE_LITERAL, value, typeOf: "number" };
            case "boolean": return { type: lang.TYPE_LITERAL, value, typeOf: "boolean" };
            case "object": {
                if(value === null) return { type: lang.TYPE_LITERAL, value, typeOf: "null" };
                // if(Array.isArray(value)) {}
            }
        }
        if(value === undefined) return { type: lang.TYPE_LITERAL, value, typeOf: "undefined" };
        throw new Error(`Unsupported literal type: ${typeof value}`);
    }
};

lang._OPCHARS = new Set([...lang.operators].map(op => op.charCodeAt(0)));
lang._UNITCHARS = new Set([...lang.units.keys()].map(unit => unit.charCodeAt(0)));

/**
 * Token class representing a lexical token
 */
class Token {
    constructor(type, value, start, end) {
        this.type = type?.toString();
        this.value = value?.toString();
        this.start = start;
        this.end = end;
    }

    matches(type, value = null) {
        if(this.type !== type) return false;
        if(value !== null && this.value !== value) return false;
        return true;
    }
}

/**helper*/ class StringView {
    isView = true;

    constructor(buffer) {
        this.u8 = (buffer instanceof Uint8Array || (typeof Buffer !== "undefined" && Buffer.isBuffer(buffer))) ? buffer : new Uint8Array(buffer);
    }

    charCodeAt(index) {
        return this.u8[index];
    }

    get length() {
        return this.u8.length;
    }

    substring(start, end) {
        return new StringView(this.u8.subarray(start, end));
    }

    toString() {
        return new TextDecoder().decode(this.u8);
    }

    indexOf(searchValue, fromIndex = 0) {
        return this.u8.indexOf(searchValue, fromIndex);
    }

    static fromString(str) {
        const encoder = new TextEncoder();
        return new StringView(encoder.encode(str));
    }
}

/**
 * Base state class for Lexer and Parser
 */
class State {
    constructor(options = {}) {
        this.position = 0;
        if(options.onWarn) this.onWarn = options.onWarn;
        if(options.onError) this.onError = options.onError;
        if(options.onNote) this.onNote = options.onNote;
        this.options = options;
    }

    note(message) {
        const loc = this.getLocationInfo();
        const locationStr = loc.line || loc.column ? ` at line ${loc.line}:${loc.column}` : "";
        const tokenInfo = this._tokenInfo(loc.token);
        (typeof this.onNote === "function" ? this.onNote : console.log)(`${message}${locationStr}${tokenInfo}`);
    }

    warn(message) {
        const loc = this.getLocationInfo();
        const locationStr = loc.line || loc.column ? ` at line ${loc.line}:${loc.column}` : "";
        const tokenInfo = this._tokenInfo(loc.token);
        (typeof this.onWarn === "function" ? this.onWarn : console.warn)(`${message}${locationStr}${tokenInfo}`);
    }

    error(message, type, hard = true) {
        const loc = this.getLocationInfo();
        const locationStr = loc.line || loc.column ? ` at line ${loc.line}:${loc.column}` : "";
        const tokenInfo = this._tokenInfo(loc.token);
        const full = `${message}${locationStr}${tokenInfo}`;
        const error = new (type || Error)(full);
        if(typeof this.onError === "function") this.onError(error);
        if(hard) throw error;
    }

    getLocationInfo() {
        let line = this.line || 0;
        let column = this.column || 0;
        let token = null;

        if (Array.isArray(this.tokens) && typeof this.position === lang.TOKEN_NUMBER) {
            const t = this.tokens[this.position];
            if (t) {
                token = t;
                if (typeof t.line === lang.TOKEN_NUMBER) line = t.line;
                if (typeof t.column === lang.TOKEN_NUMBER) column = t.column;
            }
        }

        return { line, column, token };
    }

    _cutValue(value, maxLength = 20) {
        if(typeof value !== "string") return value;
        if (value && value.length > maxLength) {
            return value.substring(0, maxLength - 3) + "...";
        }
        return value;
    }

    _describeToken(token) {
        if(!token) return "end of input";

        if(token.type === lang.TOKEN_OPENING_BRACE || token.type === lang.TOKEN_CLOSING_BRACE) {
            return "'" + token.value + "'";
        }

        if(token.type === lang.TOKEN_SEMICOLON) {
            return "';'";
        }

        if(token.type === lang.TOKEN_NL) {
            return "newline";
        }

        /**precomp*/const name = {
            [lang.TOKEN_OPERATOR]: "operator",
            [lang.TOKEN_IDENTIFIER]: "identifier",
            [lang.TOKEN_NUMBER]: "number",
            [lang.TOKEN_STRING]: "string",
            [lang.TOKEN_LITERAL]: "literal",
            [lang.TOKEN_COMMENT]: "comment",
            [lang.TOKEN_DECLARATION]: "declarator",
            [lang.TOKEN_KEYWORD]: "keyword",
        }

        if(name[token.type]) {
            return `${name[token.type]} '${this._cutValue(token.value)}'`;
        }

        if(!token.value) {
            return `type '${token.type}'`;
        }

        return `type '${token.type}' with value '${token.value}'`;
    }

    _tokenInfo(token) {
        if (!token) return "";
        return `\n - near ${this._describeToken(token)} (start=${token.start}, end=${token.end})`;
    }
}

class Span {
    constructor({ start, end, line, column } = {}) {
        this.start = start;
        this.end = end;
        this.line = line;
        this.column = column;
    }

    /**
     * Return a new Span that is a copy of this one
     * @returns {Span} The copied Span
     */
    copy() {
        return new Span({
            start: this.start,
            end: this.end,
            line: this.line,
            column: this.column
        });
    }

    /**
     * Set the end of this span to the end of the given token
     * @param {Token} token The token to set the end to
     * @returns {Span} Self
     */
    to(token) {
        this.end = token.end;
        return this;
    }

    /**
     * Create a Span from a set of tokens
     * @param {...Token} tokens The tokens (or Span) to create the span from (takes first and last)
     * @returns {Span} The created Span
     */
    static from() {
        if(arguments.length === 0) {
            return new Span();
        }

        const startToken = arguments[0];
        const endToken = arguments[arguments.length - 1] || arguments[0];

        return new Span({
            start: startToken.start,
            end: endToken.end,
            line: startToken.line,
            column: startToken.column
        });
    }
}

class LexerState extends State {
    constructor(source = "", options = {}) {
        super(options);

        this.line = 1;
        this.column = 1;
        this.source = source;
        this.sourceView = typeof source === "string"? source: new StringView(source);
        this.inString = false;
        this.inTemplateString = false;
        this.stringDelimiter = null;

        this.set_state(lang.STATE_DEFAULT);

        this.valueStart = 0;

        this.tokens = [];
    }

    isEnd() {
        return this.position >= this.sourceView.length - 1;
    }

    push(token) {
        if(!(token instanceof Token)) {
            this.error("Lexer attempted to push non-Token object to tokens list");
        }

        token.start = token.start || this.valueStart;
        token.end = token.end || this.position;
        token.line = token.line || this.line;
        token.column = token.column || this.column;
        this.tokens.push(token);
    }

    set_state(newState) {
        this.prevCode = this.code;
        this.code = newState;
    }

    reset() {
        this.set_state(lang.STATE_DEFAULT);
        this.position = 0;
        this.line = 1;
        this.column = 1;
        this.inString = false;
        this.stringDelimiter = null;
        this.valueStart = 0;
    }

    val_start(offset = 0) {
        this.valueStart = this.position + offset;
    }

    get_value(offset = 0) {
        return this.sourceView.substring(this.valueStart, this.position + offset);
    }

    start_string(delim) {
        this.inString = true;
        this.stringDelimiter = delim;
        this.inTemplateString = (delim === 96);
        this.val_start(1);
    }
}
/**
 * Lexical analysis: Tokenizes the input code
 * @param {LexerState} state The LexerState to continue lexing
 * @returns {object} The AST 
 */
function continueLexing(state) {
    if(!state || !(state instanceof LexerState)) {
        throw new Error("Invalid LexerState provided to continueLexing");
    }

    for(; state.position < state.sourceView.length; state.position++) {
        const isEnd = state.isEnd();
        let char = state.sourceView.charCodeAt(state.position);

        if(char === 10) {
            state.line++;
            state.column = 1;

            if(!state.inString && state.tokens.length > 0 && state.tokens[state.tokens.length - 1].type !== lang.TOKEN_NL) {
                state.push(new Token(lang.TOKEN_NL, null, state.position, state.position + 1));
            }

            // Line range filtering
            if(state.options.fromLine && state.line < state.options.fromLine) continue;
            if(state.options.toLine === state.line + 1) break;
        } else {
            state.column++;
        }

        if(state.inString) {
            if(char === state.stringDelimiter) {
                state.inString = false;
                state.stringDelimiter = null;
                let value = state.get_value();
                state.push(new Token(lang.TOKEN_STRING, value));
                state.set_state(lang.STATE_DEFAULT);
                continue;
            }

            if(isEnd) {
                state.error("Unterminated string literal");
            }
            continue;
        }

        if(state.code === lang.STATE_DEFAULT) {
            if(lang.isWhitespace(char)) {
                continue;
            }

            // String start
            if(lang.isStringDelimiter(char)) {
                state.start_string(char);

                if(isEnd) {
                    state.error("Unterminated string literal");
                }
                continue;
            }

            // Single-line comments
            if(lang.isSLCommentStart(char, state.sourceView.charCodeAt(state.position + 1))) {
                let endIdx = state.sourceView.indexOf(state.sourceView.isView? lang.SLCommentEndCharCode: lang.SLCommentEnd, state.position + 2);
                if(endIdx === -1) {
                    endIdx = state.sourceView.length;
                }

                if(state.options.keepComments) {
                    let comment = state.sourceView.substring(state.position, endIdx);
                    state.push(new Token(lang.TOKEN_COMMENT, comment, state.position, endIdx));
                }

                state.position = endIdx - 1;
                continue;
            }

            // Multi-line comments
            if(lang.isMLCommentStart(char, state.sourceView.charCodeAt(state.position + 1))) {
                const ogPosition = state.position;

                let idx = state.position + 2;
                let endFound = false;
                while(idx < state.sourceView.length) {
                    let c1 = state.sourceView.charCodeAt(idx);
                    let c2 = state.sourceView.charCodeAt(idx + 1);
                    if(lang.isMLCommentEnd(c1, c2)) {
                        endFound = true;
                        break;
                    }

                    if(c1 === 10) {
                        state.line++;
                        state.column = 1;
                    }

                    idx++;
                }

                if(!endFound) {
                    return state.error("Unterminated multiline comment");
                }

                state.position = idx + 1;

                if(state.options.keepComments) {
                    let comment = state.sourceView.substring(state.position + 2, idx);
                    state.push(new Token(lang.TOKEN_COMMENT, comment, ogPosition));
                }
                continue;
            }

            if(lang.isIdentStart(char)) {
                state.set_state(lang.STATE_IDENTIFIER);

                if(isEnd) {
                    state.push(new Token(lang.TOKEN_IDENTIFIER, String.fromCharCode(char)));
                    break;
                }

                state.val_start();
                continue;
            }

            if(lang.isDigit(char)) {
                if(isEnd) {
                    state.push(new Token(lang.TOKEN_NUMBER, String.fromCharCode(char)) );
                    break;
                }

                state.dotSeen = false;
                state.set_state(lang.STATE_NUMBER);
                state.val_start();
                continue;
            }

            // Number starting with dot
            if(char === 46) { // .
                let nextChar = state.sourceView.charCodeAt(state.position + 1);
                if(lang.isDigit(nextChar)) {
                    state.dotSeen = true;
                    state.set_state(lang.STATE_NUMBER);
                    state.val_start();
                    continue;
                }
            }

            // Opening braces
            if(lang.BRACKETS.OPENING.has(char)) {
                state.push(new Token(lang.TOKEN_OPENING_BRACE, String.fromCharCode(char)));
                continue;
            }

            // Closing braces
            if(lang.BRACKETS.CLOSING.has(char)) {
                state.push(new Token(lang.TOKEN_CLOSING_BRACE, String.fromCharCode(char)));
                continue;
            }

            // Semicolon
            if(char === 59) { // ;
                state.push(new Token(lang.TOKEN_SEMICOLON));
                continue;
            }

            // Operators
            if(lang._OPCHARS.has(char)) {
                let startPos = state.position;
                let opStr = String.fromCharCode(char);
                let nextChar = state.sourceView.charCodeAt(state.position + 1);
                while(!isEnd) {
                    let potentialOp = opStr + String.fromCharCode(nextChar);
                    if(lang.operators.has(potentialOp)) {
                        opStr = potentialOp;
                        state.position++;
                        nextChar = state.sourceView.charCodeAt(state.position + 1);
                    } else {
                        break;
                    }
                }
                state.push(new Token(lang.TOKEN_OPERATOR, opStr, startPos, state.position + 1));
                continue;
            }

            // Unknown character
            state.error(`Unexpected character: '${String.fromCharCode(char)}' (code ${char})`);

            continue;
        }

        if(state.code === lang.STATE_IDENTIFIER) {
            const isIdent = lang.isIdentPart(char);
            
            if(!isEnd && isIdent) {
                continue;
            }

            if(!isIdent) state.position--;
            let value = state.get_value(1);

            if(lang.declares.has(value)) {
                state.push(new Token(lang.TOKEN_DECLARATION, value));
            } else if(lang.keywords.has(value)) {
                state.push(new Token(lang.TOKEN_KEYWORD, value));
            } else if (value === "true" || value === "false" || value === "null" || value === "undefined") {
                state.push(new Token(lang.TOKEN_LITERAL, value));
            } else {
                state.push(new Token(lang.TOKEN_IDENTIFIER, value));
            }

            state.val_start();
            state.set_state(lang.STATE_DEFAULT);

            continue;
        }

        if(state.code === lang.STATE_NUMBER) {
            if(char === 120 || char === 88) { // x or X
                // Hexadecimal
                if(state.position === state.valueStart + 1 && state.sourceView.charCodeAt(state.valueStart) === 48) {
                    state.position++;
                    while(!state.isEnd()) {
                        char = state.sourceView.charCodeAt(state.position);
                        if(!lang.isHexDigit(char)) {
                            break;
                        }
                        state.position++;
                    }

                    let value = state.get_value(isEnd? 1 : 0);
                    state.push(new Token(lang.TOKEN_NUMBER, value));
                    state.val_start();
                    state.set_state(lang.STATE_DEFAULT);
                    if(!isEnd) {
                        state.position--;
                    }
                    continue;
                } else {
                    return state.error("Invalid number format: unexpected 'x' in number");
                }
            }

            if(char === 46) { // .
                if(state.dotSeen) {
                    return state.error("Invalid number format: multiple decimal points");
                }

                state.dotSeen = true;
            }

            const isDigit = lang.isDigit(char);

            if(!isEnd && (isDigit || char === 46)) { // .
                continue;
            }

            if(!isDigit && char !== 46) state.position--;
            let value = state.get_value(1);

            state.push(new Token(lang.TOKEN_NUMBER, value));
            state.val_start();
            state.set_state(lang.STATE_DEFAULT);
            continue;
        }
    }

    return state.tokens;
}

/**
 * Internal representation of a symbol in the symbol table
 */
class Symbol {
    constructor(name, info = {}) {
        this.name = name;
        this.info = info;

        this.seen = false; // For dead code elimination and unused variable warnings
    }
}

class ParserState extends State {
    /**
     * Creates a new ParserState with the given tokens and options
     * @param {*} tokens Tokens to parse
     * @param {*} options Parser options
     * @param {int} options.optimize Optimization level (0-3)
     * @param {function} options.onWarn Warning callback
     * @param {function} options.onError Error callback
     * @param {function} options.onNote Note callback
     */
    constructor(tokens = [], options = {}) {
        super(options);
        this.tokens = tokens;

        this.symbolTable = new Map();
        this.scopeStack = [];
        this.nsStack = [];

        this.topLevel = false;

        options.optimize ??= 3;
        this.optimize = options.optimize;
    }

    isEnd() {
        return this.position >= this.tokens.length;
    }

    /**
     * Peeks at the next token without consuming it
     * @param {int} offset How many tokens to look ahead (default 0, which is the next token)
     * @returns {Token|null} The token at the given offset, or null if out of bounds
     */
    peek(offset = 0) {
        if(this.position + offset >= this.tokens.length) {
            return null;
        }
        return this.tokens[this.position + offset];
    }

    /**
     * @returns {Token} The consumed token
     */
    consume() {
        const token = this.tokens[this.position];
        this.position++;
        return token;
    }

    /**
     * If the next token matches the given type and value, consume it and return it. Otherwise, return false.
     * @param {string} type The expected token type
     * @param {string|null} value The expected token value (optional)
     * @returns {Token|false} The consumed token if it matches, or false if it doesn't
     */
    match(type, value = null) {
        const token = this.peek();
        if(!token) return false;
        if(token.type !== type) return false;
        if(value !== null && token.value !== value) return false;
        this.position++;
        return token;
    }

    /**
     * Expects the next token to match the given type and value, and consumes it. If it doesn't match, throws an error.
     * @param {string} type The expected token type
     * @param {string|null} value The expected token value (optional)
     * @param {string|null} customMessage Custom error message to use instead of the default (optional)
     * @returns {Token} The consumed token if it matches
     */
    expect(type, value = null, customMessage = null) {
        const token = this.peek();
        const message = customMessage || `Expected token of type '${type}'${value !== null ? ` with value '${value}'` : ""}`;

        if(!token || token.type !== type || (value !== null && token.value !== value)) {
            this.error(`${message}, but ${token ? "got" : "reached"} ${this._describeToken(token)}`);
        }

        this.position++;
        return token;
    }

    skipExtras() {
        let peek;
        while(!this.isEnd() && (peek = this.peek().type) && (peek === lang.TOKEN_COMMENT || peek === lang.TOKEN_NL)) {
            this.consume();
        }

        return this.isEnd();
    }

    // TODO: Uh, scope management
}

/**
 * Parsing: Converts tokens into an Abstract Syntax Tree (AST)
 * @param {ParserState} state The ParserState to continue parsing
 * @returns {object} The AST 
 */
function continueParsing(state) {
    if(!(state instanceof ParserState)) {
        throw new Error("Invalid ParserState provided to continueParsing");
    }

    // Top-level program
    return parseBlock(state, true);
}

/** * Parses a block of statements (enclosed in braces) from the token stream
 * @param {ParserState} state The ParserState to parse from
 * @param {boolean} topLevel Whether this block is the top-level program (if true, no braces are expected)
 * @returns {object} The parsed block AST node
 */
function parseBlock(state, topLevel = false) {
    const open = topLevel? null: state.expect(lang.TOKEN_OPENING_BRACE, "{");
    const body = [];

    const MAX = 100 + state.tokens.length;
    let it = 0;

    if(topLevel) {
        // Skip shebang if present
        if(state.peek()?.type === lang.TOKEN_COMMENT && state.peek().value.startsWith("#!")) {
            state.consume();
        }
    }

    // TODO: Check # statements at the top of the block

    while(
        !state.isEnd()
        && (topLevel || !state.peek()?.matches(lang.TOKEN_CLOSING_BRACE, "}"))
    ) {
        // Safety check against infinite loops, just in case (should never happen)
        if(it++ > MAX) state.error("Parsing block exceeded maximum iteration count (possible infinite loop)");

        // Ensure the topLevel flag is set correctly for nested blocks
        state.topLevel = topLevel;

        // Ignore comments, newlines, extra semicolons
        if(state.skipExtras()) break;
        if(state.peek()?.matches(lang.TOKEN_CLOSING_BRACE, "}")) {
            break;
        }

        const statement = parseStatement(state);
        body.push(statement);

        if(statement.type !== lang.TYPE_BLOCK_STATEMENT && statement.type !== lang.TYPE_FUNCTION) {
            // For now semicolons are reuqired :(
            state.expect(lang.TOKEN_SEMICOLON, null, "Expected ';' after statement");
        } else {
            state.match(lang.TOKEN_SEMICOLON, null);
        }
    }

    if (!topLevel) state.expect(lang.TOKEN_CLOSING_BRACE, "}");
    return { type: topLevel? lang.TYPE_PROGRAM : lang.TYPE_BLOCK_STATEMENT, body, span: topLevel? null: Span.from(open, state.peek(-1)) };
}

/** * Parses a single statement from the token stream
 * @param {ParserState} state The ParserState to parse from
 * @returns {object} The parsed statement AST node
 */
function parseStatement(state) {
    const token = state.peek();

    if(token.type === lang.TOKEN_DECLARATION) {
        state.consume();

        const nameTok = state.expect(lang.TOKEN_IDENTIFIER, null, `Expected name after '${token.value}' statement`);
        let init = null, type = lang.TYPE_DECLARATION;

        if(state.isEnd()) {
            state.error("Unexpected end of input in declaration statement");
        }

        if(token.value === "var" || token.value === "let" || token.value === "global" || token.value === "const") {
            if (state.match(lang.TOKEN_OPERATOR, "=")) {
                init = parseExpression(state);
            } else if (token.value === "const") {
                state.error(`Constant declaration '${nameTok.value}' must be initialized`);
            }
        } else if(token.value === "function" || token.value === "fn") {
            type = lang.TYPE_FUNCTION;
            state.expect(lang.TOKEN_OPENING_BRACE, "(");

            init ??= { params: [], body: null };

            while(!state.peek()?.matches(lang.TOKEN_CLOSING_BRACE, ")")) {
                const paramName = state.expect(lang.TOKEN_IDENTIFIER, null, "Expected parameter name in function declaration");
                let paramType = null;

                // if(state.match(lang.TOKEN_OPERATOR, ":")) {
                //     paramType = parseExpression(state);
                // }

                // TODO: Handle default parameter values

                init.params.push({ name: paramName.value, type: paramType, span: Span.from(paramName) });

                if(!state.peek()?.matches(lang.TOKEN_CLOSING_BRACE, ")")) {
                    state.expect(lang.TOKEN_OPERATOR, ",", "Expected ',' between function parameters");
                }
            }

            state.expect(lang.TOKEN_CLOSING_BRACE, ")");

            // if(state.match(lang.TOKEN_OPERATOR, "->")) {
            //     init.returnType = parseExpression(state);
            // }

            init.body = parseBlock(state);
        } else if (token.value === "enum") {
            type = lang.TYPE_ENUM_DECLARATION;
            init = { members: [] };

            state.expect(lang.TOKEN_OPENING_BRACE, "{");

            // TODO: Inline enums
            while(!state.peek()?.matches(lang.TOKEN_CLOSING_BRACE, "}")) {
                const memberName = state.expect(lang.TOKEN_IDENTIFIER, null, "Expected member name in enum declaration");
                let memberValue = null;

                if(state.match(lang.TOKEN_OPERATOR, "=")) {
                    memberValue = parseExpression(state);
                }

                init.members.push({ name: memberName.value, value: memberValue, span: Span.from(memberName) });

                if(!state.peek()?.matches(lang.TOKEN_CLOSING_BRACE, "}")) {
                    state.expect(lang.TOKEN_OPERATOR, ",", "Expected ',' between enum members");
                }
            }

            state.expect(lang.TOKEN_CLOSING_BRACE, "}");
        } else if (token.value === "class") {
            type = lang.TYPE_CLASS_DECLARATION;
        }

        else { state.error(`Unsupported declaration type: '${token.value}'`) }

        return {
            name: nameTok.value,
            kind: token.value,
            type,
            init,
            span: Span.from(token, init ?? nameTok)
        };
    }

    // Fallback: expression statement
    const expr = parseExpression(state);
    return { type: lang.TYPE_EXPRESSION_STATEMENT, expr, span: expr.span };
}

/** * Parses an expression using the Shunting Yard algorithm for operator precedence
 * @param {ParserState} state The ParserState to parse from
 * @param {number} minPrec The minimum precedence level to consider (used for recursion)
 * @returns {object} The parsed expression AST node
 */
function parseExpression(state, minPrec = 0) {
    let left = parseAtom(state);

    while (!state.isEnd()) {
        if(state.skipExtras()) break;

        const token = state.peek();

        if(token.type === lang.TOKEN_SEMICOLON || token.type === lang.TOKEN_CLOSING_BRACE) {
            break;
        }

        if(token.type === lang.TOKEN_OPENING_BRACE) {
            // Function call or member access
            if(token.value === "(") {
                // Function call
                state.consume();
                const args = [];

                while(!state.peek()?.matches(lang.TOKEN_CLOSING_BRACE, ")")) {
                    const arg = parseExpression(state);
                    args.push(arg);

                    if(!state.peek()?.matches(lang.TOKEN_CLOSING_BRACE, ")")) {
                        state.expect(lang.TOKEN_OPERATOR, ",", "Expected ',' between function arguments");
                    }
                }

                state.expect(lang.TOKEN_CLOSING_BRACE, ")");

                left = {
                    type: lang.TYPE_CALL_EXPRESSION,
                    callee: left,
                    arguments: args,
                    span: Span.from(left.span ?? token, state.peek(-1)?.span ?? token)
                };
                continue;
            }
        }

        // No more operators to process
        if (token.type !== lang.TOKEN_OPERATOR) break;

        const opDiff = lang.PRECEDENCE[token.value] || 0;
        if (opDiff < minPrec) break;

        // Consume operator (yummy)
        state.consume();

        // if(token.value === ".") {
        //     // Member access
        //     state.consume();
        //     const property = state.expect(lang.TOKEN_IDENTIFIER, null, "Expected identifier after '.' for member access");

        //     left = {
        //         type: lang.TYPE_MEMBER_EXPRESSION,
        //         object: left,
        //         property: { type: lang.TYPE_IDENTIFIER, name: property.value, span: Span.from(property) },
        //         span: Span.from(left.span ?? token, property.span)
        //     };
        //     continue;
        // }

        // = is right-associative
        // TODO: Later handle both *var and var*
        const right = parseExpression(state, (token.value === "=") ? opDiff : opDiff + 1);

        if(state.optimize > 1) {
            // Constant folding for simple binary operations with literals
            if(left.type === lang.TYPE_LITERAL && right?.type === lang.TYPE_LITERAL) {
                const folded = foldConstants(token.value, toJsValue(left), toJsValue(right));
                if(folded !== null) {
                    left = {
                        type: lang.TYPE_LITERAL,
                        typeOf: typeof folded === "string" ? lang.TOKEN_STRING : lang.TOKEN_NUMBER,
                        value: folded,
                        span: Span.from(left.span ?? token, right.span ?? token)
                    };
                    continue;
                }
            }
        }

        left = {
            type: lang.TYPE_BINARY_OP,
            operator: token.value,
            left: left,
            right: right,
            span: Span.from(left.span ?? token, right?.span ?? token) // simplified span logic
        };
    }

    return left;
}

// TODO:
// Some constants can be resolved at compiletime and folded down the line.
function resolveConstant(node) {}

function foldConstants(operator, leftVal, rightVal) {
    try {
        switch(operator) {
            case "+": return leftVal + rightVal;
            case "-": return leftVal - rightVal;
            case "*": return leftVal * rightVal;
            case "/": return rightVal !== 0 ? leftVal / rightVal : null;
            case "%": return rightVal !== 0 ? leftVal % rightVal : null;
            case "**": return leftVal ** rightVal;
            case "&&": return leftVal && rightVal;
            case "||": return leftVal || rightVal;
            case "??": return leftVal ?? rightVal;
            case "==": return leftVal == rightVal;
            case "!=": return leftVal != rightVal;
            case "===": return leftVal === rightVal;
            case "!==": return leftVal !== rightVal;
            case "<": return leftVal < rightVal;
            case ">": return leftVal > rightVal;
            case "<=": return leftVal <= rightVal;
            case ">=": return leftVal >= rightVal;
            case "&": return leftVal & rightVal;
            case "|": return leftVal | rightVal;
            case "^": return leftVal ^ rightVal;
            case "<<": return leftVal << rightVal;
            case ">>": return leftVal >> rightVal;
            case ">>>": return leftVal >>> rightVal;
            default: return null; // Unsupported operator for folding
        }
    } catch {
        return null;
    }
}

function toJsValue(value) {
    switch(value.typeOf) {
        case lang.TOKEN_STRING:
            return String(value.value);
        case lang.TOKEN_NUMBER:
            return Number(value.value);
        case lang.TOKEN_LITERAL:
            if(value.value === "true" || value.value === "false") {
                return value.value === "true";
            }
            if(value.value === "null") {
                return null;
            }
            if(value.value === "undefined") {
                return undefined;
            }
            // For other literals, return the raw value (eg. unit literals)
            return value.value;
        default:
            throw new Error(`Unsupported literal type: ${value.typeOf}`);
    }
}

function parseAtom(state) {
    const token = state.peek();

    if(!token) {
        return;
    }

    // Unary operators
    if (token.type === lang.TOKEN_OPERATOR && ["+", "*", "-", "!", "~", "typeof", "void", "delete", "++", "--"].includes(token.value)) {
        state.consume();

        const argument = parseAtom(state); // Recursively parse atoms
        if(token.value === "*") {
            argument.pointerDeref = true;
            return argument;
        }

        return {
            type: lang.TYPE_UNARY_OP,
            operator: token.value,
            argument: argument,
            span: Span.from(token, argument)
        };
    }

    state.consume();

    if(token.type === lang.TOKEN_NUMBER || token.type === lang.TOKEN_STRING || token.type === lang.TOKEN_LITERAL) {
        return {
            type: lang.TYPE_LITERAL,
            typeOf: token.type,
            value: token.value,
            span: Span.from(token)
        };
    }

    if(token.type === lang.TOKEN_IDENTIFIER) {
        return {
            type: lang.TYPE_IDENTIFIER,
            name: token.value,
            span: Span.from(token)
        };
    }

    if(token.type === lang.TOKEN_OPENING_BRACE && token.value === "(") {
        const expr = parseExpression(state);
        state.expect(lang.TOKEN_CLOSING_BRACE, ")", "Expected ')' after expression");
        return expr;
    }

    if(token.type === lang.TOKEN_NL) {
        return;
    }

    state.error(`Unexpected token in expression: ${state._describeToken(token)}`);
}

class Compiler extends State {
    constructor(options = {}) {
        super(options);
        this.language = "unknown";
        this.build = [];
    }
}

class Compiler_JavaScript extends Compiler {
    #interns;

    // Builtin helpers
    static builtins = new Map([
        ["__try_destroy", ""],

        // UTF-8 encoding/decoding (Support for binary strings)
        ["__u82s", "var __td;function __u82s(d){__td??=new TextDecoder(\"utf-8\");return __td.decode(Array.isArray(d)?new Uint8Array(d):d)};"],
        ["__s2u8", "var __te;function __s2u8(s){__te??=new TextEncoder();return __te.encode(s)};"],

        ["GDN", ""]
    ]);

    // Global inline functions to map to
    // TODO: Disallow overwriting/allow overwriting with a flag
    static inline_globals = new Map([
        ["print", (args) => `console.log(${args.join(", ")})`],
        ["len", (args) => {
            if(args.length !== 1) {
                throw new Error(`'len' function expects exactly 1 argument, got ${args.length}`);
            }

            // TODO: Check invalid values, such as numbers
            // TODO: Inline size for literal/const strings and arrays

            if(typeof args[0] !== "string") {
                // For non-string literals, we can inline length access directly
                return `${args[0]}.length`;
            }

            if(args[0].startsWith("__u82s(")) {}

            return `${args[0]}.length`
        }]
    ]);

    /**
     * Creates a new Compiler_JavaScript instance with the given AST and options.
     * This compiler compiles the AST into JavaScript code.
     * @param {*} ast The AST to be compiled
     * @param {*} options Compilation options
     * @param {string[]} options.excludeBuiltins List of builtin names to exclude from the output (eg. if the environment already provides them)
     * @param {function} options.onWarn Warning callback
     * @param {function} options.onError Error callback
     * @param {function} options.onNote Note callback
     */
    constructor(ast, options = {}) {
        super(options);

        this.ast = ast;
        this.options = options;
        this.#interns = new Set();

        // Skip including certain builtins (eg. shared)
        if(options.excludeBuiltins && Array.isArray(options.excludeBuiltins)) {
            for(const name of options.excludeBuiltins) {
                this.#interns.set(name, true);
            }
        }

        this.language = "JavaScript";
        this.build = [];
    }

    compile() {
        this.compileBlock(this.ast);
        return this.build.join("");
    }

    compileBlock(block) {
        if(!block) {
            this.error("Cannot compile null/undefined AST block");
        }

        for(const node of block.body) {
            if(node.type === lang.TYPE_DECLARATION) {
                let line = `${node.kind === "global" ? "" : node.kind} ${node.name}`;
                if(node.init) {
                    console.log(node.init);
                    
                    line += ` = ${this.compileExpression(node.init)}`;
                }

                line += ";";

                if(node.kind === "global") {
                    this.note(`'global' declaration of variable '${node.name}'`);
                    this.build.unshift(`var ${node.name};`); // Declare at top level
                    this.build.push(line); // Initialize or set in place
                } else {
                    this.build.push(line);
                }
                continue;
            }

            if(node.type === lang.TYPE_FUNCTION) {
                this.build.push(`function ${node.name}(${node.init.params.map(p => p.name).join(", ")}) {`);
                this.compileBlock(node.init.body);
                this.build.push("}");
                continue;
            }

            if(node.type === lang.TYPE_EXPRESSION_STATEMENT) {
                const exprCode = this.compileExpression(node.expr);
                this.build.push(`${exprCode};`);
                continue;
            }

            if(node.type === lang.TYPE_ENUM_DECLARATION) {
                this.build.push(`const ${node.name} = {`);
                for(const member of node.init.members) {
                    const valueCode = member.value ? this.compileExpression(member.value) : `"${member.name}"`;
                    this.build.push(`  ${member.name}: ${valueCode},`);
                }
                this.build.push("};");
                continue;
            }

            this.error(`Unsupported AST node type at top level: ${node.type}`);
        }
    }

    compileExpression(node) {
        if(!node) {
            this.error("Cannot compile null/undefined expression node");
        }

        if(node.type === lang.TYPE_LITERAL) {
            if(node.typeOf === lang.TOKEN_STRING) {
                return JSON.stringify(node.value);
            } else {
                return node.value;
            }
        }

        if(node.type === lang.TYPE_IDENTIFIER) {
            return node.name;
        }

        if(node.type === lang.TYPE_BINARY_OP) {
            return `(${this.compileExpression(node.left)} ${node.operator} ${this.compileExpression(node.right)})`;
        }

        if(node.type === lang.TYPE_UNARY_OP) {
            // TODO: Add postfix support
            return `(${node.operator}${this.compileExpression(node.argument)})`;
        }

        if(node.type === lang.TYPE_CALL_EXPRESSION) {
            const calleeCode = this.compileExpression(node.callee);
            const argsCode = node.arguments.map(arg => this.compileExpression(arg)).join(", ");

            if(Compiler_JavaScript.inline_globals.has(calleeCode)) {
                return Compiler_JavaScript.inline_globals.get(calleeCode)(node.arguments.map(arg => this.compileExpression(arg)));
            }

            return `${calleeCode}(${argsCode})`;
        }

        this.error(`Unsupported expression node type: ${node.type}`);
    }

    #useBuiltin(name) {
        const block = Compiler_JavaScript.builtins.get(name);
        if(block) {
            this.#intern(name, block);
        } else {
            this.error(`Compiler used unknown builtin "${name}"`);
        }
    }

    #intern(hash, block) {
        if(!this.#interns.has(hash)) {
            this.build.unshift(block);
            this.#interns.add(hash);
        }
    }
}

/**
 * Lexical analysis: Tokenizes the input code
 * @param {string} code The source code to tokenize
 * @param {object} options Options for the lexer
 * @param {boolean} options.keepComments Whether to keep comments as tokens (otherwise discarded)
 * @param {function} options.onWarn Warning callback
 * @param {function} options.onError Error callback
 * @param {function} options.onNote Note callback
 * @param {number} options.fromLine Start line for line range filtering
 * @param {number} options.toLine End line for line range filtering
 * @returns {Token[]} List of tokens
 */
function tokenize(code, options = {}) {
    const state = new LexerState(code, options);
    return continueLexing(state);
}

/**
 * Parsing: Converts tokens into an Abstract Syntax Tree (AST)
 * @param {Token[]} tokens List of tokens to parse
 * @param {object} options Options for the parser
 * @param {function} options.onWarn Warning callback
 * @param {function} options.onError Error callback
 * @param {function} options.onNote Note callback
 * @param {number} options.optimize Optimization level (0-3) for parsing (affects AST structure)
 * @returns {object} The AST
 */
function parse(tokens, options = {}) {
    const state = new ParserState(tokens, options);
    return continueParsing(state);
}

/**
 * Compilation: Converts AST into target code
 * @param {*} ast 
 * @param {*} options 
 * @returns 
 */
function compile(ast, options = {}) {
    const compiler = options.compiler || Compiler_JavaScript;
    const compilerInstance = new compiler(ast, options);
    return compilerInstance.compile();
}

// Helper function combining all steps
function build(code, options = {}, extensions = []) {
    const tokens = tokenize(code, options);
    const ast = parse(tokens, options);

    // Apply extensions / AST transformations before compilation
    for(const ext of extensions) {
        if(typeof ext === "function") {
            ext(ast);
        }
    }

    const compiled = compile(ast, options);
    return compiled;
}

const GlitterExports = {
    lang,
    util,
    Token,

    LexerState,
    tokenize,

    ParserState,
    parse,

    Compiler_JavaScript,
    // Compiler_CPP,
    compile,
    build
}

window.Glitter = GlitterExports;