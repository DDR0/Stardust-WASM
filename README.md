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


How To Debug
------------

JS is as usual. We don't do anything fancy there.

For Rust, install the [C/C++ DevTools Support (DWARF) plugin](https://chromewebstore.google.com/detail/cc++-devtools-support-dwa/pdcpmagijalfljmkmjngeonclgbbannb) for Chrome. Firefox does not support WASM debugging, only telling you the entry and exit points into the binary.


Client-Side Options
-------------------

- `localStorage.devMode = true`: Expose `world` in the global context, for debugging. (May affect other dev-y options too.)
- `localStorage.coreOverride = N`: Set the number of processing cores used to N, where N >= 0. If N is 0, processing cores are calculated automatically based on `navigator.hardwareConcurrency`.

Bugs & Support Links
--------------------

- Closed https://bugzilla.mozilla.org/show_bug.cgi?id=1613424 after 6 years.
- Closed https://stackoverflow.com/questions/76452839/how-to-compile-rust-for-use-with-wasms-shared-memory/79984357#79984357 after 3 years.
- A blog post, [Negative Results](https://ddr0.ca/blog-posts/19.Negative_Results), on my personal site. It sums up where we got stuck the first time.
- A follow-up, [Resolution](http://localhost:8300/blog-posts/24.Resolution), on how we got unstuck.