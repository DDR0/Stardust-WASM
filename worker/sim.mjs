const importObject = { imports: { imported_func: (arg) => console.log(arg) } };

const wasmSource = fetch("sim.wasm")
console.log('idle')

addEventListener("message", ({data}) => {
	if (data[0] !== "start") throw new Error(`Unknown event '${data[0]}' sent to worker.`)
	console.log('loading')
	WebAssembly.compileStreaming(wasmSource, {
		js: { workerID: new WebAssembly.Global({ value: "i32" }, data[1]) }
	}).then(wasm=>{
		console.log('run here', wasm)
	})
})

postMessage(['loaded'])