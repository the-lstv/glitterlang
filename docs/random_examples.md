<!-- Note: "js" is used here as a language due to similarity, but the actual language is glitter. There just expectedly isn't a glitter highlighter yet. -->

Hello world with delay
```ts glitter
#async // Async at root

sleep(1s);
print("Hello world");
```

Pipeline operator
```ts glitter
let result = 5
    |> (x) => x * 2
    |> (x) => x + 3;
    |> . - 4
print(result); // Outputs 9

// Whatever the last expression returned is the next input.

// With function calls:
fn transform(s:string) => s.toUpperCase().trim();
fn emphasize(s:string) => `*** ${s} ***`;

let text = "  Glitter Lang  "
    |> transform
    |> emphasize
    |> . + " is awesome!"; // "." is also a shorthand refering to the previous value
```

Continuation/reuse arrow syntax
```ts glitter
// This is similar to the pipeline operator, with some major differences:
// - It does not automatically evaluate functions
// - It always passes the first value in the chain, not the previous value
// - Returning is optional, but ends the chain and returns that value.

let something = dom.createElement("div")
    -> .id = "my-div"
    -> .className = "container"
    -> someFunction(.)
    -> .append("Hello, Glitter!");

// NOTE: Unlike the pipeline operator, "->" does not pass the previous value; "." will always refer to the first value in the chain.

document.body.appendChild(something);

// (We can return:)
let another = dom.createElement("span")
    -> .append("This is a span")
    -> return dom.outerHTML;
```

Numbers
```ts glitter
const decimal = 12345;          // Decimal
const hex = 0x1A3F;             // Hexadecimal
const binary = 0b110101;        // Binary
const octal = 0o7654;           // Octal
const floatNum = 3.14159;       // Floating-point
const sciNum = 1.23e4;          // Scientific notation
const underscores = 1_000_000;  // Underscores for readability (they are ignored)

// Special cases: .1 (0.1) and 1. (1.0) are also valid

// Numeric variables can have type suffixes/prefixes:
// (their use depends on context; you may or may not need them)
const intNum:u8 = 42;          // Integer (signed i8/i16/32/64/128, unsigned u8/16/32/64/128)
const floatNum2:f32 = 3.14;    // Float (or 3.14f)
const doubleNum:f64 = 2.71828; // Double
const longNum = 1234567890n;   // BigInt/Long
```

```ts glitter
// There are also units:
const duration = 5s;           // Duration (ms, s, m, h, d, w), returns milliseconds
const size = 10MB;             // DataSize (B, KB, MB, GB, TB, PB), returns bytes
const frequency = 60Hz;        // Frequency (Hz, kHz, MHz, GHz), returns hertz
const percentage = 75%;        // Percentage, returns a float (0.75)

// Units resolve into numbers at compile time.

// Note that they have to be explicitly typed when passed anywhere else, even if the target accepts numbers:
// That is so (1) the function knows what it expects (eg. ms vs seconds), and (2) to avoid something like "setTimeout(fn, 5MB)".

// Wrong example:
fn wrong(number) print(`Duration: ${duration}ms`);
wrong(5s); // Error: cannot infer unit type

// Correct example:
fn correct(duration:Duration) print(`Duration: ${duration}ms`);
correct(5s);

1m + 30s; // ok
2GB - 500MB; // ok
50% * 1GB; // ok (512MB)
1MB + 5s; // Error: incompatible types

// Careful: Units are only resolved at compile time - at runtime, they are just numbers.
// 10s === 10000 === 1000000% === 10000B
const rawDuration = 10s; // Equal to 10000

// You can check for units with a branch, but only at compile time.
// If false, the branch is removed.
// unit_match<T, UnitType> is a special compile-time function
if constexpr (unit_match<rawDuration, Duration>) {
    print("It's a duration!");
}
```

Strings
```ts glitter
// There are your typical strings:
const name = "Glitter"; // Normal string
const greeting = `Hello, ${name}!`; // Template string
const greeting2 = $"Hello, {name}!"; // Alternative template string


// A JavaScript specific feature:

// Glitter supports "real" mutable strings in JS (as a wrapper around Uint8Array), that behave closer to proper strings in lower-level languages:

const stringBuffer = b"Hello!"; // Or BinaryString.from("Hello!")
print(stringBuffer.length); // 6
print(stringBuffer[0]); // 72 (ASCII code for 'H')

stringBuffer[0] === char<'H'> === 72; // true (char<''> translates to the ASCII code; don't use "b''" to represent a single character)
stringBuffer[1] = char<'a'>; // Change 'e' to 'a'
stringBuffer.charAt(1); // "a" (creates a regular string)

print(stringBuffer.toString()); // "Hallo!"

// Zero-copy string slicing:
stringBuffer.subarray(0, 3); // Points to the original buffer; like a StringView

// Copy slicing:
stringBuffer.slice(0, 3); // New BinaryString with "Hal"

// You can also create binary strings from String/Uint8Array/ArrayBuffer/Buffer:
BinaryString.from(new Uint8Array([87, 111, 114, 108, 100]));

// Concatenation:
BinaryString.concat([stringBuffer, BinaryString.from(" World")]).toString(); // "Hallo World"

// Compare:
stringBuffer.equals(BinaryString.from("Hello")); // false
// (Since there is no standard way to do this, under the hood this may do different things based on the environment (Node/Browser) and string size (results should be consistent, but performance may vary)).

// Don't overuse these; they add creation and allocation overhead and behave differently from normal strings.
// Only use them when you know they benefit you (otherwise default to regular strings).
// They are useful for performance-critical code, on servers, for memory efficiency, encoding predictability, large strings, frequent character mutations, or working with existing buffers.
```

Try-catch-finally
```ts glitter
// There's the typical try-catch-finally format you probably already know:
try {
    let result = riskyOperation();
    print("Operation succeeded with result:", result);
} catch (error) {
    print("Operation failed with error:", error);
} finally {
    print("Operation attempt finished.");
}

// But also a shorthand for single statements:
try print("Trying something risky...");
catch(error) print("Caught an error!", error);
finally print("Done trying.");
// Whatever the last expression in each block returns is returned.

// Even in expressions:
let value = try riskyOperation() catch 0;

// Or applied to a function itself:
fn try safeFunction() {
    // Function body

    throw "An error occurred!";

    catch (error) {
        print("Error in safeFunction:", error);
        return null; // or some default value
    }

    finally {
        print("safeFunction execution completed.");
    }
}

let result = safeFunction(); // null
```

Loops & array iteration
```ts glitter
// Standard while loop
for (let i = 0; i < 5; i++) {
    print("Iteration:", i);
}

// Syntax sugar version
@(5) (i) print("Iteration:", i);

// While loop
while (true) {
    print("This will run forever unless broken.");
    break;
}

// Do-while loop
do {
    print("This will run at least once");
} while (false);

// Itarating over arrays
let arr = [10, 20, 30];

// Excluding shorthand in loops
for (const value of arr) {
    // Skip values 10 and 20; same as "if (value == 10 || value == 20) continue;"
    exclude 10, 20;
    print("Value:", value);
}

// There is a "@" shorthand for iterating/mapping/filtering iterables.
// (And @@ for flattened iterables, @@@ for recursively flattened)

// We can use "for...of" or the shorthand "@"
@arr (value, index) {
    print(`Index: ${index}, Value: ${value}`);
}

// There is also @@ (flattened) for nested arrays
let nestedArr = [[1, 2], [3, 4], [5]];
@@arr (value, index) {
    print(`Index: ${index}, Value: ${value}`);
}

// And mapping
let doubled = @arr |> . * 2;

// Filtering
let evens = @arr |? . % 2 == 0;

// Yielding
fn* generateNumbers(count) {
    for (let i = 0; i < count; i++) {
        yield i * 10;
    }
}

const gen = @generateNumbers(5); // @ expands it into a full array
```

Ranges
```ts glitter
const range = [1..5];
print(range); // [1, 2, 3, 4, 5]

const range2 = [5..1:-1];
print(range2); // [5, 4, 3, 2, 1]

// Can also be used in loops (this does not create an array)
for (let i in 10..15) {
    print(i); // 10, 11, 12, 13, 14, 15
}

// Shorthand
@5..10 (i) print(i); // 5, 6, 7, 8, 9, 10

// Can also be used in slicing
const arr = [10, 20, 30, 40, 50];
const subarr = arr[1..3]; // [20, 30, 40]
print(subarr);

// Ranges can also be open
const openStart = [..3]; // From start to 3
print(openStart); // [0, 1, 2, 3]
```

## Memory features
### Destructors, ownership model and automatic cleanup
> [!WARNING]
> When compiling to JavaScript, destructors and destroy state are manual, aka if your object goes out of scope, it will not be called. JS sadly does not support this and has no way to implement it currently. A good model is: assume the destructor won't be called unless you do, and clean everything you can inside.
> In general, destructors in JS are useful, but only implement them if you know what you're doing and know how they behave in this implementation to avoid surprises. While Glitter tries to make it as clean and predictable as possible, sadly there is no perfect solution here due to the language limitations.

```ts glitter
// Destructible classes and ownership
// The "destructible" keyword enables automatic cleanup features in JavaScript, this will:
// - Clean up timeouts, intervals, animations/rAF, event listeners, and other registered resources when .destroy
// - Clear member variables
// - Remove all DOM nodes created by this object
// - Call the destructor
// - Propagates to superclass destructors
// - Marks the object as destroyed to prevent further use
// - If possible, removes references elsewhere (this is not guaranteed, esp. with mixed code)

// Othwise, destructors work as expected in other targets.

destructible class MyClass {
    constructor() {
        // You can enable automatic tracking, which will automatically track these when created inside this object scope (in the constructor or methods):
        #auto track <dom, timeout, interval, animation, event_listener>;
        // or #auto track <*>; - be careful with this as it may track more than you want
        // auto tracking "dom" will track all dom operations (events, creations, etc.)

        // The timeout will be cleaned up automatically when the object is destroyed
        // (see what is supported for automatic cleanup)
        track(timeout (1s) {
            print("This will only print if the object is still 'alive' within 1 second.");
        });

        // Use track() to explicitly track values. (Note that it is not magic; it needs some context. See what is supported.)
        const div = track(document.createElement("div"));
        document.body -> .on("click", => .appendChild(div));

        // And custom destructors
        track(() => print("Custom resource cleaned up!"));

        // If we got something externally that we want to cleanup too, we can track it
        const externalResource = document.createElement("div");
        track(externalResource); // "externalResource" will be removed from the DOM when this object is destroyed

        // Not tracked! The reference will be cleared, but the element will stay if something else uses it or if it's connected. Track it explicitly if needed.
        this.anotherElement = document.querySelector("span"); // or track this.anotherElement = someotherexternalsource;

        // Note; tracking won't do much on primitives (number/string, etc.), but they will work on references:
        this.someNumber = 42*;

        // Release resources manually if needed
        // release(externalResource);

        // At the end of destruction, all class properties (including non-tracked ones) are cleared automatically (and so their references) - this does not guarantee cleanup if something else holds references to them.
    }

    // Destructor
    // WARNING: When compiling to JavaScript, destructors are only called manually via .destroy()!
    // WARNING: This automatically propagates to superclass destructors!
    // NOTE: destroy() is also supported without the destructible keyword, but automatic cleanup features won't apply.
    destroy() {
        print("Destructor called for " + this.name);
        // Do cleanup here
    }
}

const obj = new MyClass();
obj.name = "Test Object";
obj.destroy();

obj.name // Error
obj.destroyed // true; shouldn't be accessed again
```
```ts glitter
// Pointer-like references
let a = 10*;

// c dereferences a
let [b, c] = [a, *a];

a // = 10
b // = 10 - Reference
c // = 10 - Copy

a = 20;

a // = 20
b // = 20 - Reference kept
c // = 10 - Copy unchanged (default for primitives)

// Warning: use carefully if compiling to JS
```

Class features and syntax sugar
```ts glitter
class Example {
    // Constructor shorthand; we can omit "constructor"
    (value) {
        this.value = value;
    }

    // A nested class
    static class SubClass {
        // A further self-assignment shorthand (equivalent to this.subValue = subValue)
        (=subValue);
    }

    readonly static staticValue = 100;
}

let ex = new Example(Example.staticValue);
print(ex.value); // 100

try Example.staticValue = 200; // Error: cannot modify readonly property

let sub = new Example.SubClass("Hello");
print(sub.subValue); // Hello

abstract class Base {
    (=name);
    greet() { print("Hello, " + this.name); }
}

class Derived extends Base { }

try new Base(); // Error: cannot instantiate abstract class

let d = new Derived("Glitter");
d.greet(); // Hello, Glitter

// Getters, defaults and types work as expected;
class Point extends Base {
    (=x:number = 0, =y:number = 0) super("Point");

    get magnitude() {
        return Math.sqrt(this.x * this.x + this.y * this.y);
    }
}

new Point(); // Point{0, 0}
new Point(3, 4) -> print("Magnitude:", .magnitude);
try new Point("a", "b"); // Error: type mismatch


// Object/array deconstruction/defaults
class Window {
    (=options = {
        width: 100,
        height: 100
    }, =[a, b, c = 5]);

    printInfo() {
        print ->
            .("Title:", String.safeWrap(this.options.title), "with size:", this.options.width + "x" + this.options.height) ->
            .("Array values:", this.a, this.b, this.c);
    }
}

let obj = new Window({
    title: "My Window"
}, [1, 2]);

obj.printInfo();
// Expected output:
// Title: "My Window" with size: 100x100
// Array values: 1 2 5
```

### Comptime features
```ts glitter
// Sometimes you want something decided at compile time rather than runtime.
// Glitter provides several features for this:
// Compile-time constants, conditional compilation, and compile-time functions.

// Compile-time constants
const 2PI = constexpr<3.14159 * 2>;

// Conditional compilation
if constexpr (2PI > 3) {
    // This branch is included at compile time and inlined (so the result code only has the print statement)
    print("2 PI is greater than 3");
} else {
    // This branch is completely removed at compile time
    print("2 PI is not greater than 3");
}

// Compile-time functions
comptime fn comptimeSquare(x:number) => x * x;
let squaredValue = comptimeSquare(5); // Turns to a static "25"
print("Squared value:", squaredValue);
// At runtime, comptimeSquare does not exist.

// What is probably more useful is external constants:
if constexpr (#env.mode == "production") {
    print("Production mode");
} else {
    print("Development mode");
}

// Available external constants:
// #env - Environment variables
// #build - Build configuration (eg. version, date, etc.)
// #compiler - Compiler configuration (eg. version, options, etc.)
// #data - Custom data passed to the compiler (eg. build-time metadata)
```

### Sandboxed scopes
```ts glitter
// You usually don't just run your own code at the root level; you may run all sorts of code from various places and you may want to ensure it doesn't leak into your root scope. Or simply want to modularize things better.
// Glitter provides a way to isolate the root scope easily.

// Sandboxes exist as separate root scope.
// You can also auto sandbox an entire module by placing #sandbox at the top.

global x = 5;

const x = sandbox {
    try x; // Error: x is not defined

    // This code runs in a separate root scope.
    global x = 10; // This x is local to the sandbox
    print("Sandbox x:", x);

    export x; // Export x to the outside world
}

// WARNING: This does not provide any magic execution security/VM/isolate; it only boxes resource access.
// For complete isolation, use proper VMs/isolates provided by the target environment.
// Bad code can still do bad things.

// You can selectively provide values to the sandbox:
sandbox (x = x) {
    print("Sandbox with provided x:", x); // 5
    x = 20; // Modifies local x only
}

// Example: getter access
sandbox ({ get secret() => "Top Secret" }) {
    print("Accessing secret:", secret);
    secret = ""; // Error: cannot modify readonly property
}

// Example safe eval (JavaScript only)
import glitter as Glitter, SandboxFrame;

const compiled = Glitter.compile("unsafe code");
const frame = new SandboxFrame();

frame.catch((error) => {
    print("Sandbox error:", error);
});

const result = frame.run(compiled); // Runs in a sandboxed environment
frame.destroy(); // Clean up

print("Sandbox result:", result);
```

### JS Interop

Glitter often compiles to JavaScript, so you can interoperate with JS code directly (at runtime they are the same, so any library or tool will be compatible, except for Glitter-only compiletime features).
```ts glitter
if(!available<JavaScript>) {
    throw "JavaScript interop is only available when compiling to JavaScript.";
}

const fn = JavaScript.eval(`
    function add(a, b) {
        return a + b;
    }
`);

print("2 + 3 =", fn(2, 3)); // Outputs: 2 + 3 = 5

// By default, the JavaScript namespace is scoped behind "JavaScript" to make things explicit and clean.
// You can also access global JS objects directly and expose globally as "window" if you want:
global window = JavaScript.global;
print("Current URL:", window.location.href);

// Or enter the global scope entirely (careful):
using JavaScript.global;
print("User Agent:", navigator.userAgent);

// But be aware that the parent runtime decides what is available (unless executing directly).

// You can also use exports to be accessible from other JS code:
JavaScript.export({
    greet: (name) => `Hello, ${name}!`
});
```
```js
// In JS, you can also access Glitter code.
const Glitter = require('./glitter.js');
const fn = Glitter.eval("fn add(x, y) x + y;");
console.log("4 + 5 =", fn(4, 5)); // Outputs: 4 + 5 = 9
```

### Runtime eval and language patching (JavaScript only)
```ts glitter
// You probably shouldn't, but you can eval Glitter code at runtime by including the compiler in your build.
import glitter;

const code = `
    fn multiply(a, b) => a * b;
    multiply(6, 7);
`;

print("6 * 7 =", Glitter.eval(code)); // Outputs: 6 * 7 = 42
```

### DOM manipulation
```ts glitter
import glitter:dom;

// The API is the same as a typical DOM API, with some small differences and optimizations.

// Get the document object
global document = dom.getDocument() || throw "No document object available";

// Create and manipulate DOM elements
let div = document.createElement("div", {
    id: "my-div",
    className: "container"
});

div.style.backgroundColor = "lightblue";
div.style.padding = "10px";
div.append("Hello, Glitter DOM!");
document.body.append(div);
```