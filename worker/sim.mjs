const wasmSource = fetch("sim.wasm")
addEventListener("message", async ({data: [event, workerID, worldBuf]}) => {
	if (event !== "start") throw new Error(`Unknown event '${event}' sent to worker.`)
	console.log('loading')
	
	const wasm = await WebAssembly.instantiateStreaming(wasmSource, {
		imports: { 
			imported_func: (arg) => console.log(`imported_func ${workerID}:`, arg)
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