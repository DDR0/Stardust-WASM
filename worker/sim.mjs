const wasmSource = fetch("sim.wasm")

const assert = (condition, message) => {
	class AssertionError extends Error { name = "AssertionError" }
	if (!message) { throw new Error('Missing message for assert.') }
	if (!condition) { throw new AssertionError(message) }
}

//Extract a utf-8 string from WASM memory, converting it to a utf-16 Javascript String.
//Very much not zero-copy.
const stringFromMem = (mem, index) =>
	index
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
			logNum: arg => console.log(`sim ${workerID}:`, arg),
			
			wScratchA: (index, value) => world.scratchA[index] = value,
			waScratchA: Atomics.store.bind(null, world.scratchA),
		},
	})
	
	const sim = wasm.instance.exports
	
	//I think our heaps are in shared memory, along with everything else.
	//Try to offset them without hacking the compiler, since --shared-memory in .cargo/config.toml doesn't seem to be working.
	//This will only work if the heap pointer stuff is not also in shared memory, which it probably is. (It could be using WASM locals or something.)
	//The other alternative is to try writing Rust with [noalloc].
	sim.leakMem(workerID - 1);
	
	let now = () => performance.now();
	
	let total = now()
	const timings = [];
	for (let i = 0; i < 500; i++) {
		let jsTime = now()
		for (let i = 0; i < 10000; i++) {
			Atomics.store(world.scratchA, i, BigInt(i));
		}
		jsTime = now()-jsTime
		
		let wasmTime = now()
		try {
			sim.runWA()
		} catch (e) {
			console.error(`core ${workerID}, iteration ${i}`, e)
		}
		wasmTime = now()-wasmTime
		
		timings.push([jsTime, wasmTime])
	}
	
	total = now()-total
	console.log('js, wasm')
	//console.table(timings)
	console.log(`${timings.reduce((a,t)=>a+t[0], 0).toFixed(2)}ms + ${timings.reduce((a,t)=>a+t[1], 0).toFixed(2)}ms = ${total.toFixed(2)}ms`)
	
	console.log(world.scratchA.slice(0,5))
}

console.info("Sim core listening.")