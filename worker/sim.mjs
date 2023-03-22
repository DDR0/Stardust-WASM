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
	
	self.workerID = workerID
	self.worldBackingBuffer = worldBackingBuffer
	self.world = world
	
	
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
			log_num: num => console.log(`sim ${workerID}: number ${num}`),
		},
	})
	
	const sim = wasm.instance.exports
	
	let now = () => performance.now();
	
	let wasmTime = now()
	try {
		sim.run(workerID)
	} catch (e) {
		console.error(`core ${workerID}`, e)
	}
	
	console.log(`wasm time: ${(now()-wasmTime).toFixed(2)}ms`)
	
	console.log(worldBackingBuffer.buffer.slice(wasmMemoryStartingByte, wasmMemoryStartingByte+100))
}

console.info("Sim core listening.")