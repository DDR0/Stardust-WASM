DDR's __Stardust__
==================

An issue reproduction where web workers with shared memory seem to be sharing stack as well.

We have three web workers to count to 300. Each takes ⅓ of the task; 0-100, 100-200, 200-300. Running any individual worker, it'll log its numbers just fine. When running all workers, they act as if they're sharing thread-local variables, such as the for loop counter n in worker/sim.rs.

We would expect to see all numbers, if jumbled together as we have three threads doing console.log. But we see most numbers simply being skipped.

How to Run
----------

Run `./example_server.py` on the command line. This will serve the website, setting a few headers required to enable shared memory for the simulation.

Optionally, to rebuild the simulation core with Rust, you'll also need to:
1. [Install `rustup`](https://rustup.rs/). 
	1. Optionally, install [`entr`](https://github.com/eradman/entr) for automatic recompilation. (`entr` is often in your package manager.)
2. In the worker directory, run `./compile.sh init`. This will set up "nightly" Rust, which we need to build our WASM with imported shared memory.
3. Run `./compile.sh`.
