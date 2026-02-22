
# Glitter.js compiler API Documentation

Skip [here](#cli-usage) for CLI usage.

## Core Functions

### `tokenize(code, options)`

Performs lexical analysis on source code.

**Parameters:**
- `code` (string | Uint8Array): Source code to tokenize
- `options` (object, optional):
    - `keepComments` (boolean): Retain comments as tokens
    - `onWarn` (function): Warning callback
    - `onError` (function): Error callback
    - `onNote` (function): Note callback
    - `fromLine` (number): Start line for filtering
    - `toLine` (number): End line for filtering

**Returns:** `Token[]` - Array of tokens

**Example:**
```javascript
const tokens = Glitter.tokenize("let x = 42;");
```

It is possible to pass an `Uint8Array` (or Buffer / ArrayBuffer), which may be slightly faster especially if you already have a buffer.

### `parse(tokens, options)`

Converts tokens into an Abstract Syntax Tree (AST).

**Parameters:**
- `tokens` (Token[]): Token array from `tokenize()`
- `options` (object, optional): Parser options

**Returns:** `object` - AST representation

**Example:**
```javascript
const ast = Glitter.parse(tokens);
```

### `compile(ast, options)`

Compiles AST to target language code.

**Parameters:**
- `ast` (object): AST from `parse()`
- `options` (object, optional):
    - `compiler` (class): Target compiler (default: `Compiler_JavaScript`)
    - `excludeBuiltins` (string[]): Exclude certain built-in functions

**Returns:** `string` - Compiled code

**Example:**
```javascript
const js = Glitter.compile(ast);
```

### `build(code, options, extensions)`

A helper that does a complete compilation pipeline in one call (all of the above steps in sequence).<br>
Effectively takes a Glitter source code string and returns it's compiled code, and also allows applying AST transformations.

**Parameters:**
- `code` (string): Source code
- `options` (object, optional): Compiler options
- `extensions` (function[]): AST transformers to apply

**Returns:** `string` - Compiled code

**Example:**
```javascript
const js = Glitter.build("let x = 5; print(x);");
```

**Example with extensions:**
```javascript
const extensions = [
    {
        // Simple replace all identifiers named "x" with "y" and initialize them to "Hello"
        [Glitter.lang.DECLARATION](node) {
            if(node.name === "x") {
                node.name = "y";
                node.init = Glitter.util.constructValue("Hello");
            }
        },

        [Glitter.lang.IDENTIFIER](node) {
            if(node.name === "x") node.name = "y";
        }
    }
];

const js = Glitter.build("let x = 5; print(x);", {}, extensions);
// Example output: "let y = "Hello"; print(y);"
```

## Classes

### `Token`

Represents a lexical token.

**Constructor:** `new Token(type, value, start, end)`

**Methods:**
- `matches(type, value)` - Check token type and value

### `LexerState`

Maintains lexer state during tokenization.

### `ParserState`

Maintains parser state during AST construction.

### `Compiler_JavaScript`

JavaScript backend compiler.

## CLI Usage
You can also use this library from the command line.

### File extension
Glitter does not have a standardized extension as of now; but it is recommended to use either `.gl` or `.glitter`. This is not enforced by the compiler.

### Command line

To compile a Glitter source file to JavaScript:
```bash
node glitter input.gl -o output.js
```

In this case the compiler is guessed from the output file extension.

Options:
- `-o, --output <file>`: Specify output file
- `-O, --optimize`: Optimization level (0-3, eg. `-O3` for maximum optimization, `-O0` to disable optimizations)
- `--exclude-builtins <names>`: Comma-separated list of builtin names to exclude from the output (eg. if the environment already provides them)
- `--keep-comments`: Retain comments in the output (note that this is not guaranteed)

Optimization levels:
- `0`: No optimizations (code is left mostly as-written) *- recommended for debugging only*
- `1`: Basic optimizations (constant folding, dead code elimination, etc.) *- default*
- `2`: Advanced optimizations (function inlining, loop unrolling, etc.) *- recommended*
- `3`: Maximum optimizations (more advanced transformations that may affect the structure of the code) *- recommended for whole-program compilation where exact semantics are not critical*