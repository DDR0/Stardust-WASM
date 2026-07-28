const wasmSource = fetch("sim.wasm")

const wasmMemoryStartingByte = 1200000

const assert = (condition, message) => {
	class AssertionError extends Error { name = "AssertionError" }
	if (!message) { throw new Error('Missing message for assert.') }
	if (!condition) { throw new AssertionError(message) }
}

//Extract a utf-8 string from WASM memory, converting it to a utf-16 Javascript String.
//Very much not zero-copy.
const stringFromMem = (mem, index) =>
	index //usually around 1053656
		? new TextDecoder('utf-8').decode(
			//Copy shared memory out to an unshared array for TextDecoder.
			//Warning: Racy. Time of check for trailing null != time of copy.
			new Uint8Array(mem.buffer).slice(
				index,
				index + new Uint8Array(mem.buffer, index).indexOf(0),
			)
		)
		: "«null»"

//See message sending code for why we use multiple messages. [Adu1bZ]
let messageArgQueue = [];
addEventListener("message", ({data}) => {
	messageArgQueue.push(data)
	if (messageArgQueue.length === 4) {
		self[messageArgQueue[0]].apply(0, messageArgQueue.slice(1))
	}
})

self.start = async (workerID, worldBackingBuffer, world) => {
	console.info(`Sim core ${workerID} started.`)
	assert(workerID > 0, "Worker ID must be positive.")
	
	//Expose a few values for debugging.
	self.workerID = workerID
	self.worldBackingBuffer = worldBackingBuffer
	self.world = world
	
	const i32View = new Int32Array(worldBackingBuffer.buffer)
	
	const wasm = await WebAssembly.instantiateStreaming(wasmSource, {
		env: {
			memory: worldBackingBuffer,
		},
		imports: {
			abort: (messagePtr, locationPtr, row, column) => {
				const location = stringFromMem(worldBackingBuffer, locationPtr)
				const message  = stringFromMem(worldBackingBuffer, messagePtr )
				throw new Error(`${message} (${location}:${row}:${column}, thread ${workerID})`)
			},
			_log_num: num => console.log(`sim ${workerID}: number ${num}`),
			
			//Opposite of wait - waits for a value to be equal, vs not-equal.
			_wait_for: (ptr, value) => {
				while (true) {
					const stored = Atomics.load(i32View, ptr / i32View.BYTES_PER_ELEMENT)
					if (stored == value) return
					Atomics.wait(i32View, ptr / i32View.BYTES_PER_ELEMENT, stored)
				}
			}
		},
	})
	
	//Each worker runs on its own thread but shares one linear memory. The wasm module's
	//shadow stack (where debug locals like the loop counter `n` get spilled) and its
	//thread-local storage both live IN that shared memory, addressed by the __stack_pointer
	//and __tls_base globals. Those globals initialise to the same value in every instance,
	//so without the setup below all three threads pile their stacks on top of each other and
	//clobber each other's locals. Give each worker its own non-overlapping stack + TLS block.
	const sim = wasm.instance.exports
	const workerIndex = workerID - 1

	const REGION_BASE = 2 * 1024 * 1024 //Above the module's static data, heap base, and world.globalTick.
	const STACK_SIZE  = 512 * 1024      //Plenty for this program; grows downward from the top of the block.
	const align = n => (n + 15) & ~15
	const tlsSize = align(sim.__tls_size.value) //0 here (no #[thread_local]s), but honour it for correctness.
	const blockSize = tlsSize + STACK_SIZE
	const blockBase = REGION_BASE + workerIndex * blockSize

	//TLS sits at the bottom of the block; the shadow stack occupies the rest and grows down from the top.
	//Set the private shadow stack FIRST, before any wasm call (including TLS init), so the
	//very first function entry runs on this worker's own stack rather than the shared one.
	sim.__stack_pointer.value = blockBase + blockSize
	sim.__wasm_init_tls(blockBase)

	let now = () => performance.now()
	
	let lastProcessedTick = -1
	while (1) {
		Atomics.wait(world.globalTick, 0, lastProcessedTick)
		lastProcessedTick = world.globalTick[0]
		
		let wasmTime = now()
		try {
			sim.run(workerID)
		} catch (e) {
			console.error(`core ${workerID}`, e)
			recoverCrashedWorker(world, workerID)
		}
		
		console.log(`wasm time: ${(now()-wasmTime).toFixed(2)}ms`)
	}
	
}

console.info("Sim core listening.")

const recoverCrashedWorker = (world, workerID) => {
	const workerIndex = workerID - 1
	Atomics.store(world.workerStatuses, workerIndex, 3) //mark crashed
	
	const totalPixels = world.simulationWindow[2] - world.simulationWindow[0] * world.simulationWindow[3] - world.simulationWindow[0]
	
	let chunkSize = Math.ceil(totalPixels / world.totalWorkers);
	
	for (let y = world.simulationWindow[0]; y < world.simulationWindow[2]; y++)
		for (let x = world.simulationWindow[1]; x < world.simulationWindow[3]; x++)
			if (world.locks[y*3840 + x] === workerID) //maxWorldSize.x
				world.locks[y*3840 + x] = 0 //Mark particle unlocked, as we crashed while processing it. Consistency is not guaranteed after this point!
	
	Atomics.store(world.workerStatuses, workerIndex, 0) //mark ready
}