import("./shims.mjs")
const wasm = await import("../../crate-wasm/pkg/index.js")
wasm.init()

const thisWorkerID = -2 //-2 for render worker, -1 for main thread, 0 for unclaimed, ≥1 for logic workers
let world

const callbacks = Object.freeze({
	__proto__: null,
	
	hello: () => {
		console.log('render worker hello 1');
		return [wasm.hello()]
	},
	
	bindToData: new_world => {
		world = new_world
	},
	
	renderFrame: () => {
		console.log('render frame')
	},
	
	drawDot: (x, y, toolRadius, typeID) => {
		wasm.reset_to_type(world, thisWorkerID, x, y, typeID)
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

