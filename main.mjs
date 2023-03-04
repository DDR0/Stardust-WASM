const memory = new WebAssembly.Memory({ initial:1, maximum:1, shared:true })
const world = new Uint8Array(memory.buffer, 0, 5)

const worker = new Worker('sim.mjs', {type:'module'})
worker.postMessage(['world, memory', world, memory]) //does not work in Chrome, only Firefox
worker.postMessage(['memory, world', memory, world]) //works in Chrome and Firefox

worker.addEventListener('messageerror', e=>console.error(e)) //should log error in Chrome