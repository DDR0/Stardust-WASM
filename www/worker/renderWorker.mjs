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
	},
	
	renderInto,
})

addEventListener("message", ({'data': {type, data}}) => {
	const callback = callbacks[type]
	if (!callback) { return console.error(`Unknown worker event '${type}'.`) }
	//console.info('render worker msg', type, data)
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



function renderInto(buffer, width, height) {
	const pixelArray = new DataView(buffer);
	
	//Draw a dot, colour is ABGR format.
	const dot = (colour, x, y) =>
		pixelArray.setUint32(4*(x + y*width), colour, false)
	
	dot(0xFF0000FF, 0,0);
	dot(0xFF00FFFF, 20,10);
	dot(0x009900FF | ((Math.random()*0xFF)<<8), Math.floor(Math.random()*width), Math.floor(Math.random()*height));
	
	postMessage({type: 'drawFrame', data: [buffer, width, height]}, [buffer])
	
	if(buffer.byteLength && !renderInto.hasThrownTransferError) {
		renderInto.hasThrownTransferError = true
		console.error('Failed to transfer image data, falling back to expensive copy operation.')
	}
}