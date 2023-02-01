# DDR's __Stardust__

A nacent falling sand game, based off `rust-wasm-worker-template`. Thank you Victor Gavrish, without whom we never would have got this running in the first place.

## Outcome

This experiment is closed, as I could not wring the performance I wanted out of the proof-of-concept. The main issue seems to be that the way I architected the processing core requires *any* memory allocation at all, and the secondary issue seems to be that this workload heavily reads to and writes from values held by the Javascript side of things in a shared array buffer. These reads and writes seem more expensive than we can afford.

In total, the render thread takes 128ms on Chrome and 59ms on Firefox to render out a 300x150 playfield. Aiming for a 120hz framerate, that gives us a budget of 8.3ms/frame, which is not particularly in the neighbourhood we need. Effectively all the time is spent creating and destroying our internal representation of a particle, which consists of world, thread_id, x, y, and maybe w/h if it references a real particle. The allocation and deallocation of one of these data structures takes about 30% of the processing time, and we usually end up creating a few of them as they're what we use to work with other particles as well. Another 20% of the time was spent reading data from the JS side of things, since we can't map the data we're working with in from the shared array buffer passed to the web-worker.

Rust interop with JS in this case has also proved rather awkward; while I'm sure it would work for other projects, for the sort of high-performance access we're looking at it's not suitable. Right now, WASM is more suited to the sort of workload where a little data is passed in to do a lot of work on, rather than a lot of data passed in to do a little work on.

One alternative might be to copy the raw memory in to the WASM process in the worker thread, thus avoiding the lookups. More sensibly, I think the best solution is just to avoid using WASM for this at all, and use Javascript or Typescript in the worker.

A minor aside: It seems you can't paint shared array buffers directly to canvas - you need to copy them into a `new ImageData()` first, because ImageData will only accept non-shared array buffers.

-----


> **Kickstart your Rust, WebAssembly, Webpack and Web Worker project!**

This template is designed for creating monorepo-style Web applications with
Rust-generated WebAssembly running inside a Web Worker and Webpack without
publishing your wasm to NPM.

## Batteries Included

This template comes pre-configured with all the boilerplate for compiling Rust
to WebAssembly and hooking into a Webpack build pipeline.

- In `~/www`, `npm run start` -- Serve the project locally for development at
  `http://localhost:8080`.

- In `~/www`, `npm run build` -- Bundle the project (in production mode).

## Using This Template

- In the project base directory, `~`, run `cargo build`.
- In `~/www`, run `npm install`.

## Stardust Options

- `localStorage.coreOverride = N`: Set the number of processing cores used to N, where N >= 0. If N is 0, processing cores are calculated automatically based on `navigator.hardwareConcurrency`.