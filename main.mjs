const memory = new WebAssembly.Memory({
	initial: Math.ceil(1),
	maximum: Math.ceil(1),
	shared: true,
})

const world = {
	a: new Int32Array(memory.buffer, 0, 0),
	b: new Int32Array(memory.buffer, 0, 0),
}

const worker = new Worker('sim.mjs', {type:'module'})

worker.postMessage([world, memory])
worker.postMessage([memory, world])
worker.postMessage([world, memory])
worker.postMessage([memory, world])