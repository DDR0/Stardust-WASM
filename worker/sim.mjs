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

addEventListener("message", async ({data: [event, workerID, worldBuf]}) => {
	if (event !== "start") throw new Error(`Unknown event '${event}' sent to worker.`)
	console.log('loading')
	
	const wasm = await WebAssembly.instantiateStreaming(wasmSource, {
		imports: { 
			abort: (messagePtr, locationPtr, row, column) => {
				const location = stringFromMem(wasm.instance.exports.memory, locationPtr)
				const message  = stringFromMem(wasm.instance.exports.memory, messagePtr )
				throw new Error(`${message} (${location}:${row}:${column}, thread ${workerID})`)
			},
			logNum: arg => console.log(`sim ${workerID}:`, arg)
		},
	})
	
	const mem = new Int32Array(worldBuf)
	mem[0] = 2
	
	const calls = wasm.instance.exports
	console.log('sum', calls.sum(4,5))
	console.log('sum2', calls.run(worldBuf))
	console.log(mem.slice(0,5))
	
	const mem2 = new Int32Array(5)
	mem2[0] = 7
	console.log('sum', calls.sum(1,2))
	console.log('sum2', calls.run(mem2.buffer))
	console.log(mem2)
})

postMessage(['loaded'])