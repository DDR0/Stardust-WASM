//Must be a shared WebAssembly.Memory.
const memory = new WebAssembly.Memory({
	initial: Math.ceil(1),
	maximum: Math.ceil(1),
	shared: true,
})

//Object must have two typed arrays backed by the same buffer.
const world = {
	a: new Int32Array(memory.buffer, 0, 0),
	b: new Int32Array(memory.buffer, 0, 0),
}

const worker = new Worker('sim.mjs', {type:'module'})

//Object must be posted after Memory
worker.postMessage([world, memory]) //works
worker.postMessage([memory, world]) //doesn't work
worker.postMessage([world, memory]) //still works
worker.postMessage([memory, world]) //still doesn't