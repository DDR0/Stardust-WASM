# DDR's __Stardust__

A nacent falling sand game.

Outcome

This branch represents a bit of a dead-end, as while we seem to be able to pass the world shared memory into our Web-worker WASM executor, we can't actually, uh, read it there. The issue is that this is not a value which is represented in linear memory. That thing which Rust and C++ are based around. So it's kind of a new concept for them, and they just... don't support it, according to [this GitHub issue from 2019](https://github.com/rust-lang/rust/issues/60825#issuecomment-566273568).

Specifically, I can't figure out how to access `workerID` and `world`, defined in [sim.mjs](worker/sim.mjs), from [sim.rs](worker/sim.rs).

## Stardust Options

- `localStorage.devMode = true`: Expose `world` in the global context, for debugging. (May affect other dev-y options too.)
- `localStorage.coreOverride = N`: Set the number of processing cores used to N, where N >= 0. If N is 0, processing cores are calculated automatically based on `navigator.hardwareConcurrency`.