const wasmSource = fetch("sim.wasm") //kick off the request now, we're going to need it

//See message sending code for why we use multiple messages.
let messageArgQueue = [];
addEventListener("message", ({data}) => {
	messageArgQueue.push(data)
	if (messageArgQueue.length === 4) {
		self[messageArgQueue[0]].apply(0, messageArgQueue.slice(1))
	}
})

self.start = async (workerID, worldBackingBuffer, world) => {
	const wasm = await WebAssembly.instantiateStreaming(wasmSource, {
		env: { memory: worldBackingBuffer },
		imports: {
			abort: (messagePtr, locationPtr, row, column) => {
				throw new Error(`? (?:${row}:${column}, thread ${workerID})`)
			},
			_log_num: num => console.log(`thread ${workerID}: n is ${num}`),
		},
	})
	
	//Initialise thread-local storage, so we get separate stacks for our local variables.
	wasm.instance.exports.__wasm_init_tls(workerID-1)
	
	//Loop, running the Rust logging loop when the "tick" advances.
	let lastProcessedTick = 0
	while (1) {
		Atomics.wait(world.globalTick, 0, lastProcessedTick)
		lastProcessedTick = world.globalTick[0]
		wasm.instance.exports.run(workerID)
	}
}