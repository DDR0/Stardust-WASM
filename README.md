DDR's __Stardust__
==================

A nacent falling sand game.


How to Run
----------

Run `./example_server.py` on the command line. This will serve the website, setting a few headers required to enable shared memory for the simulation.

Optionally, to rebuild the simulation core with Rust, you'll also need to:
1. [Install `rustup`](https://rustup.rs/). 
	1. Optionally, install [`entr`](https://github.com/eradman/entr) for automatic recompilation. (`entr` is often in your package manager.)
2. In the worker directory, run `./compile.sh init`. This will set up "nightly" Rust, which we need to build our WASM with imported shared memory.
3. Run `./compile.sh`.

## Stardust Options

- `localStorage.devMode = true`: Expose `world` in the global context, for debugging. (May affect other dev-y options too.)
- `localStorage.coreOverride = N`: Set the number of processing cores used to N, where N >= 0. If N is 0, processing cores are calculated automatically based on `navigator.hardwareConcurrency`.