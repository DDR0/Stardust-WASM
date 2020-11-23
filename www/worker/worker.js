"use strict"

import("../../crate-wasm/pkg").then(wasm => {
	wasm.init()
	
	const callbacks = Object.create(null)
	callbacks.hello = _=>[wasm.hello(_)]
	
	let graph;
	callbacks.useGraphData = (data)=>{
		graph = new Uint8Array(new SharedArrayBuffer(10 * Uint8Array.BYTES_PER_ELEMENT))
	}
	callbacks.optimizeGraph = ()=>{
		console.log('a', graph)
		wasm.optimize_graph(graph)
		console.log('b', graph)
	}
	
	

	
	
	self.addEventListener("message", ({'data': {type, data}}) => {
		const callback = callbacks[type]
		if (!callback) { return console.error(`unknown worker event '${type}')`) }
		
		try {
			const retval = callback(...(data??[]))
			if (retval !== undefined) {
				self.postMessage({ type, data: retval })
			}
		}
		catch (err) {
			console.error(err)
			debugger
			self.postMessage({ type, error: err.message })
		}
	})
	
	self.postMessage({ type:'ready' })
})