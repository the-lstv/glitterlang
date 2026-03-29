![Glitter Logo](icon.svg)
# Glitter lang

Glitter is an (in theory) modern backend-agnostic programming language, as of now primarily compiling to JavaScript.
It is inspired by C++, Rust and ECMAScript and aims at combining their strengths, fixing their weaknesses and adding useful features that are common but missing in other languages.

It can be used for web development (client and server side), game development, and more (it is still experimental, but there's a lot more to come).

In this repository is an *experimental* implementation of a Glitter tokenizer, parser and compiler written in JavaScript.<br>
In the future it is planned to make a proper compiler in C++.

All the code is in `glitter.js`, and there are 0 dependencies (you can just use it right away).<br>
It works in Node.js and in the browser out of the box.

## Playground
Inside the `demo` folder you can find an interactive web playground.<br>
It comes with various language tools (code editor, AST explorer, compilation viewer, etc.) and examples.

**You can try it [here](https://glitter-demo.lstv.space/) (beta)**


## Compiler API
See [the compiler documentation](docs/api.md) for details about this compiler API.

## Language Features
Comming soon.

## Language Specification
~~You can find the latest draft [here](docs/specification.md).~~ Work in progress.

## Contributing
Feel free to open issues or submit pull requests. Any help is appreciated!

## License
This project is licensed under the GNU General Public License v3.0. See the [LICENSE](LICENSE) file for details.
