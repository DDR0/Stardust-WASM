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
	
	//Each worker runs on its own thread but shares ONE linear memory. The wasm module's
	//shadow stack (where debug locals like the loop counter `n` get spilled) and its
	//thread-local storage both live IN that shared memory, addressed by the __stack_pointer
	//and __tls_base globals. Those globals initialise to the SAME value in every instance,
	//so without the setup below all three threads pile their stacks on top of each other and
	//clobber each other's locals. Give each worker its own non-overlapping stack + TLS block.
	const exports = wasm.instance.exports
	const workerIndex = workerID - 1

	const REGION_BASE = 2 * 1024 * 1024 //Above the module's static data, heap base, and world.globalTick.
	const STACK_SIZE  = 512 * 1024      //Plenty for this program; grows downward from the top of the block.
	const align = n => (n + 15) & ~15
	const tlsSize = align(exports.__tls_size.value) //0 here (no #[thread_local]s), but honour it for correctness.
	const blockSize = tlsSize + STACK_SIZE
	const blockBase = REGION_BASE + workerIndex * blockSize

	//TLS sits at the bottom of the block; the shadow stack occupies the rest and grows down from the top.
	//Set the private shadow stack FIRST, before any wasm call (including TLS init), so the
	//very first function entry runs on this worker's own stack rather than the shared one.
	exports.__stack_pointer.value = blockBase + blockSize
	exports.__wasm_init_tls(blockBase)
	
	//Loop, running the Rust logging loop when the "tick" advances.
	let lastProcessedTick = 0
	while (1) {
		Atomics.wait(world.globalTick, 0, lastProcessedTick)
		lastProcessedTick = world.globalTick[0]
		exports.run(workerID)
	}
}