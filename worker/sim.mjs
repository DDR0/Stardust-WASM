const wasmSource = fetch("sim.wasm")

//Extract a utf-8 string from WASM memory, converting it to a utf-16 Javascript String.
//Very much not zero-copy.
const stringFromMem = (mem, index) =>
	index
		? new TextDecoder('utf-8').decode(
			new Uint8Array(mem.buffer, index, 
				new Uint8Array(mem.buffer, index).indexOf(0)
			)
		)
		: "«null»"

addEventListener("message", async ({data: [event, workerID, world, worldBackingBuffer]}) => {
//addEventListener("message", async (data) => {
	console.log("WBB", worldBackingBuffer);
	if (event !== "start") throw new Error(`Unknown event '${event}' sent to worker.`)
	console.log('loading')
	
	const wasm = await WebAssembly.instantiateStreaming(wasmSource, {
		imports: { 
			abort: (messagePtr, locationPtr, row, column) => {
				const location = stringFromMem(wasm.instance.exports.memory, locationPtr)
				const message  = stringFromMem(wasm.instance.exports.memory, messagePtr )
				throw new Error(`${message} (${location}:${row}:${column}, thread ${workerID})`)
			},
			logNum: arg => console.log(`sim ${workerID}:`, arg),
			
			wScratchA: (index, value) => world.scratchA[index] = value,
			waScratchA: Atomics.store.bind(null, world.scratchA),
		},
	})
	
	const calls = wasm.instance.exports
	
	let now = () => performance.now();
	
	let total = now()
	const timings = [];
	for (let i = 0; i < 500; i++) {
		let jsTime = now()
		for (let i = 0; i < 100000; i++) {
			Atomics.store(world.scratchA, i, BigInt(i));
		}
		jsTime = now()-jsTime
		
		let wasmTime = now()
		calls.run()
		wasmTime = now()-wasmTime
		
		timings.push([jsTime, wasmTime])
	}
	
	total = now()-total
	console.log('js, wasm')
	console.table(timings)
	console.log({total})
	
	console.log(world.scratchA.slice(0,5))
})

postMessage(['loaded'])