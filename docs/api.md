
# Glitter.js compiler API Documentation

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

It is possible to pass an `Uint8Array` (or ArrayBuffer), which may be slightly faster especially if you already have a buffer.

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
    function(ast) {
        ast.findMatch({ type: [Glitter.lang.DECLARATION, Glitter.lang.IDENTIFIER], name: "x" })
           .forEach(node => { node.name = "y"; if(node.type === Glitter.lang.DECLARATION) node.init = Glitter.util.constructLiteral("string", "Hello") });
        return ast;
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