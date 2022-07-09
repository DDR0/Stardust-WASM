import("./shims.mjs")
const wasm = await import("../../crate-wasm/pkg/index.js")
wasm.init()

const callbacks = Object.freeze({
	__proto__: null,
	
	hello: () => {
		console.log('render worker hello 1');
		return [wasm.hello()]
	},
	
	drawDot: (x1, y1, x2, y2, toolRadius, selectedTypeId) => {
		
	}
})

addEventListener("message", ({'data': {type, data}}) => {
	const callback = callbacks[type]
	if (!callback) { return console.error(`unknown worker event '${type}')`) }
	console.info('render worker msg', type, data)
	try {
		const retval = callback(...(data??[]))
		if (retval !== undefined) {
			postMessage({ type, data: retval })
		}
	}
	catch (err) {
		console.error(err)
		postMessage({ type, error: err.message })
	}
})

postMessage({ type:'ready' }) //Let the main thread know this worker is up, ready to receive data.