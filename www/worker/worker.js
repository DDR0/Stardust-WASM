"use strict"

import("../../crate-wasm/pkg").then(wasm => {
	wasm.init()
	
	const callbacks = Object.create(null)
	callbacks.hello = _=>[wasm.hello(_)]
	
	let graphData;
	callbacks.useGraphData = data => {
		graphData = data
	}
	callbacks.optimizeGraph = ()=>{
		wasm.optimize_graph(...graphData)
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