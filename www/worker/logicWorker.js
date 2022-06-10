"use strict"

import("../../crate-wasm/pkg").then(wasm => {
	wasm.init()
	
	self.addEventListener("message", ({'data': {type, data}}) => {
		const callback = callbacks[type]
		if (!callback) { return console.error(`unknown worker event '${type}')`) }
		console.log('worker msg', type, data)
		try {
			const retval = callback(...(data??[]))
			if (retval !== undefined) {
				self.postMessage({ type, data: retval })
			}
		}
		catch (err) {
			console.error(err)
			self.postMessage({ type, error: err.message })
		}
	})
	
	self.postMessage({ type:'ready' })
	
	
	
	//General callbacks.
	
	const callbacks = Object.create(null)
	callbacks.hello = _=>{
		console.log('logic worker hello');
		return [wasm.hello()]
	}
	
	let graphData;
	callbacks.useGraphData = data => {
		graphData = data
	}
	
	
	//Run/pause layout callbacks.
	
	let nextCB = -1
	//Default to a 60fps timeout if we can't hook into the animation framework.
	let requestCallback = this.requestAnimationFrame ?? (cb=>setTimeout(cb, 16))
	let cancelCallback = this.cancelAnimationFrame ?? clearTimeout
	
	callbacks.step = ()=>{
		wasm.optimize_graph(...graphData)
		self.postMessage({ type:'update', data:[] })
	}
	
	const run = ()=>{
		console.log('run');
		//wasm.optimize_graph(...graphData)
		//self.postMessage({ type:'update', data:[] })
		//nextCB = requestCallback(run) //Last, so if step errors, stop running.
	}
	
	callbacks.run = ()=>{
		cancelCallback(nextCB) //Stop callback if already running for idempotency.
		run();
	}
	callbacks.stop = ()=>cancelCallback(nextCB)
})