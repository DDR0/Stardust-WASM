# Man, I have discovered just the weirdest bug in Chrome.

To reproduce, run example_server.py. It'll print out the results of two nearly identical `postMessage`s, both of which are lists transferring the same data but in a different order. One of the lists fails to be transfered, and doesn't fire an error either.

In the main thread, you have main.mjs:
```js
const memory = new WebAssembly.Memory({ initial:1, maximum:1, shared:true })
const world = new Uint8Array(memory.buffer, 0, 5)

const worker = new Worker('sim.mjs', {type:'module'})
worker.postMessage(['world, memory', world, memory]) //does not work in Chrome, only Firefox
worker.postMessage(['memory, world', memory, world]) //works in Chrome and Firefox

worker.addEventListener('messageerror', e=>console.error(e)) //should log error in Chrome
```
and in sim.mjs you have:
```js
addEventListener('message', ({data})=>console.error(`Worker Thread: ${data}.`))

worker.addEventListener('messageerror', e=>console.error(e)) //should log error in Chrome
```
It prints out 
```
sim.mjs:1 Worker Thread: null.
sim.mjs:1 Worker Thread: memory, world,[object WebAssembly.Memory],0,0,0,0,0.
```
No message should be null, and the only thing that's different is the order of the args. I don't think order of the list should matter to postMessage. It doesn't in Firefox. Order of the postMessage calls doesn't matter. Shared memory does not matter. Both cases work with a SharedArrayBuffer vs a WebAssembly.Memory.

When I "pause on caught exceptions", I get paused on an "Unable to deserialize cloned data" error. Otherwise, no errors are reported.