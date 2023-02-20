# DDR's __Stardust__

A nacent falling sand game.

## Stardust Options

- `localStorage.devMode = true`: Expose `world` in the global context, for debugging. (May affect other dev-y options too.)
- `localStorage.coreOverride = N`: Set the number of processing cores used to N, where N >= 0. If N is 0, processing cores are calculated automatically based on `navigator.hardwareConcurrency`.