DDR's __Stardust__
==================

A nacent falling sand game. This project has been closed due to extreme technical difficulty getting multithreaded Rust to work - for the most recent work, please see the [multithreading-issue-reproduction-3](https://github.com/DDR0/Stardust/edit/multithreading-issue-reproduction-3) branch.

Some next steps to go on, should anyone feel like chasing them down:
> All workers using the same section of linear memory for their stack could result in that bug.
>
> I believe if you use wasm-bindgen, each worker is allocated and told to use a unique section of stack.
>
> As you're not using wasm-bindgen you might have to do it manually yourself?
>
> • https://rustwasm.github.io/2018/10/24/multithreading-rust-and-wasm.html - high level descriptions about what wasm-bindgen does for thread setup
>
> • https://blog.stackblitz.com/posts/thread-destroyer/ - some low level details about $start, $stack_pointer, etc. in WAT (despite focusing on destruction)
>
> (in an optimized build n might be a wasm local, but in an unoptimized debug build I would expect n to spill out to linear memory)
—@MaulingMonkey from the Game Development In Rust Discord

[A question](https://stackoverflow.com/questions/76452839/how-to-compile-rust-for-use-with-wasms-shared-memory) has also been posted to SO, but it remains open at time of writing.

I have made [a blog post](https://ddr0.ca/blog-posts/19.Negative_Results) on my personal site, summing development up.

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
