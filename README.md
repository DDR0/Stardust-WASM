# DDR's __Stardust__

A nacent falling sand game.

Note: We may need to recompile std with `-Zbuild-std` somehow, based on [Rust issue 77839](https://github.com/rust-lang/rust/issues/77839) from 2020. However, this may be obsoleted by [the apparent removal of `__wbindgen_export_0`](https://github.com/rustwasm/wasm-bindgen/issues/2225#issuecomment-1344353224), which may indicate some changes in that neighbourhood as of 2022.

## Outcome

I am having trouble finding or triggering the mechanism with which to pass an array reference to a function via rustc's emitted code. When I do so in [worker/sim.mjs:24](worker/sim.mjs#L24), the resulting pointer in Rust is simply null and no memory is shared. We really need a mechanism to read and write shared memory from a WASM global, or be able to provide the backing memory our WASM will use from which we could return an index, but [that doesn't seem to exist](https://users.rust-lang.org/t/how-should-env-memory-be-provided-to-wasm-programs/80184).

Of further note, it doesn't seem like we have access to all the atomic functions from Rust - [the wasm32 module](https://doc.rust-lang.org/beta/core/arch/wasm32/index.html) only has a few to wait on values.

## Stardust Options

- `localStorage.devMode = true`: Expose `world` in the global context, for debugging. (May affect other dev-y options too.)
- `localStorage.coreOverride = N`: Set the number of processing cores used to N, where N >= 0. If N is 0, processing cores are calculated automatically based on `navigator.hardwareConcurrency`.
