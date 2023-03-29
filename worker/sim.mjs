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
	
	const sim = wasm.instance.exports
	
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
	
	//No-op in Firefox. See https://bugzilla.mozilla.org/show_bug.cgi?id=1613424, "Cannot log SharedArrayBuffer objects from a worker".
	console.log(worldBackingBuffer.buffer.slice(wasmMemoryStartingByte, wasmMemoryStartingByte+100))
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