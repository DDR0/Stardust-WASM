DDR's __Stardust__
==================

Currently, we are trying to count to 3 in a multi-threaded way and failing.

With one thread, it works fine. All our counters get to 3.
![image](https://user-images.githubusercontent.com/862627/229414883-8e31a874-373c-45c9-aed0-0b02744e0e8d.png)

With two or three threads, our counters go every which way.
![image](https://user-images.githubusercontent.com/862627/229414808-07061267-bfca-4cf4-9052-1aeddbba645f.png)


Analysis
--------

Theoretical Root Cause: Our Rust web worker is getting miscompiled, and is doing allocations to shared memory without the proper locks in place when it tries to iterate at [`worker/sim.rs:54`](https://github.com/DDR0/Stardust/blob/de6020d072ef058337f228d1f39d23379f8069a2/worker/sim.rs#L54).

Possible Fix: I've bungled the compilation flags in [worker/.cargo/config.toml](https://github.com/DDR0/Stardust/blob/multithreading-issue-reproduction/worker/.cargo/config.toml). Some of the tutorials for this I found were recommending adding `--enable-threads` to the link args, but this does not work because rust-lld has no idea what this arg means. (`rust-lld: error: unknown argument: --enable-threads`)


Code Walkthrough
----------------

To count to 3, we allocate some shared memory and iterate on it, incrementing each cell three times. We use three web workers, because computers have many cores and we would like to use them.

The jumping-off point is [main.mjs](main.mjs). First, it loads the `world` data structure from [world.mjs](world.mjs). The world is some `TypedArray` views into the `SharedArrayBuffer` of a `WebAssembly.Memory` object.

[main.mjs](main.mjs) then starts some workers on line 9-17, passing the world and the world's backing memory to each web worker. For the minimal reproduction, we just wait some time and then assume the workers are loaded because sychronisation is complicated. Then we log our memory, advance the simulation by a tick, log our memory again, and repeat.

The web workers are (hopefully) monitoring the shared memory we are modifying, by waiting for it to change on [line 56 of worker/sim.mjs](https://github.com/DDR0/Stardust/blob/de6020d072ef058337f228d1f39d23379f8069a2/worker/sim.mjs#L56). When the wait is over, the worker will call [the `run` function of worker/sim.rs](https://github.com/DDR0/Stardust/blob/multithreading-issue-reproduction/worker/sim.rs#L36).

[The `run` function](https://github.com/DDR0/Stardust/blob/multithreading-issue-reproduction/worker/sim.rs#L36) takes the worker ID, which ranges between 1-3 in our case, and increments each value in its third of the scratch array. The scratch array is now defined by the Rust `World` class, which mirrors the world defined in Javascript in [world.mjs](world.mjs). It's referencing the same underlying shared memory, which we passed in on [line 40 of sim.mjs](https://github.com/DDR0/Stardust/blob/multithreading-issue-reproduction/worker/sim.mjs#L40), so we see the values update back in [main.mjs:37](main.mjs) where we log them.

The suspicious part of [the `run` function](https://github.com/DDR0/Stardust/blob/multithreading-issue-reproduction/worker/sim.rs#L36) is currently

```rust
for n in chunk_start as usize..chunk_end as usize {
    world.scratch_a[n] += 1;
}
```

because something is here isn't working. I think it's the for loop iterating over the range specifically, since sometimes I will see values bigger than 3 in the output array. eg, `[3n, 4n, 6n, 6n, 4n, 6n, 5n, 4n, 2n, ...]`. I don't think the `+= 1` construct is at fault, because the array indexes it's working on should never overlap with another worker's array indexes. The memory is "committed" after the final call to `store()`, since as I understand it that's how shared memory in web workers works — all atomic writes should always appear after any prior writes on that thread, atomic or not. Each worker also has its own third of the array, which can be verified by uncommenting [the logging statements on lines 51 and 52](https://github.com/DDR0/Stardust/blob/multithreading-issue-reproduction/worker/sim.rs#L51-L52). (Note that these occasionally get corrupted too, but not always.) I think the core allocator isn't locking its memory allocations correctly.

---

Sometimes something in the Rust code also causes a panic. The best I've been able to get out is something like this:

```
sim.mjs:62 core 2 Error: unknown panic (src/main.rs:55:9, thread 2)
    at abort (sim.mjs:46:11)
    at rust_begin_unwind (sim.wasm:0xec3)
    at _ZN4core9panicking9panic_fmt17h14d5df70dacbd6c9E (sim.wasm:0x8687)
    at _ZN4core9panicking18panic_bounds_check17he157b7da0f8255b6E (sim.wasm:0x8778)
    at run (sim.wasm:0xd10)
    at self.start (sim.mjs:60:8)
```

I don't think it would panic if memory were not getting corrupted.

How to Run
----------

Run `./example_server.py` on the command line. This will serve the website, setting a few headers required to enable shared memory for the simulation.

Optionally, to rebuild the simulation core with Rust, you'll also need to:
1. [Install `rustup`](https://rustup.rs/). 
	1. Optionally, install [`entr`](https://github.com/eradman/entr) for automatic recompilation. (`entr` is often in your package manager.)
2. In the worker directory, run `./compile.sh init`. This will set up "nightly" Rust, which we need to build our WASM with imported shared memory.
3. Run `./compile.sh`.
