const wasmSource = fetch("sim.wasm") //kick off the request now, we're going to need it

const wasmMemoryStartingByte = 1200000 //World location in memory. Somewhere above what we're using to run the program.

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

//See message sending code for why we use multiple messages.
let messageArgQueue = [];
addEventListener("message", ({data}) => {
	messageArgQueue.push(data)
	if (messageArgQueue.length === 4) {
		self[messageArgQueue[0]].apply(0, messageArgQueue.slice(1))
	}
})

self.start = async (workerID, worldBackingBuffer, world) => {
	console.info(`Sim core ${workerID} started.`)
	
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
		},
	})
	
	const sim = wasm.instance.exports
	
	let lastProcessedTick = 0
	while (1) {
		Atomics.wait(world.globalTick, 0, lastProcessedTick)
		lastProcessedTick = world.globalTick[0]
		
		try {
			sim.run(workerID)
		} catch (e) {
			console.error(`core ${workerID}`, e)
			recoverCrashedWorker(world, workerID)
		}
	}
}

const recoverCrashedWorker = (world, workerID) => {
	//Don't recover for this example, just reready.
	Atomics.store(world.workerStatuses, workerID-1, 0)
}