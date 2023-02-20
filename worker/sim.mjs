const wasmSource = fetch("sim.wasm")
addEventListener("message", ({data: [event, workerID, world]}) => {
	if (event !== "start") throw new Error(`Unknown event '${event}' sent to worker.`)
	console.log('loading')
	WebAssembly.instantiateStreaming(wasmSource, {
		js: { 
			workerID: new WebAssembly.Global({ value: 'i32' }, workerID), //Can't be passed via message.
			world,
		},
		imports: { 
			imported_func: (arg) => console.log(arg)
		},
	}).then(wasm=>{
		console.log('run here', wasm)
	})
})

postMessage(['loaded'])