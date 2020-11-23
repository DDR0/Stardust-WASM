import("../../crate-wasm/pkg").then(wasm => {
	wasm.init()
	
	const callbacks = Object.create(null)
	callbacks.hello = _=>[wasm.hello(_)]
	
	callbacks.useGraphData = (data)=>{
		
	}
	
	self.addEventListener("message", ({'data': {type, data}}) => {
		const callback = callbacks[type]
		if (!callback) { return console.error(`unknown worker event '${type}')`) }
		
		try { self.postMessage({ type, data: callback(...data) }) }
		catch (err) { self.postMessage({ type, error: err.message }) }
	})
})