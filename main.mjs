import {maxScreenRes, bindWorldToDisplay} from './ui.mjs'

const showErrorMessage = message => 
	document.body.innerHTML = `
		<div>
			<h1>Internal Failure</h1>
			<p>${message}</p>
			<p>Guru Meditation 0x${(!!Atomics.waitAsync << 2 | crossOriginIsolated << 1 | isSecureContext << 0).toString(16).toUpperCase().padStart(2, '0')}</p>
		</div>
	`

if (!window.SharedArrayBuffer) {
	showErrorMessage("Your browser does not appear to support shared array buffers, which are required by <em>Stardust</em>. Perhaps try another one?")
	throw new ReferenceError('SharedArrayBuffer is not defined.')
}

if (!Atomics.waitAsync) { //Firefox doesn't support asyncWait as of 2023-01-28.
	console.warn('Atomics.waitAsync is not available; glitching may occur when resized.')
}

const $ = document.querySelector.bind(document);
const $$ = document.querySelectorAll.bind(document);
const canvas = $("#stardust-game canvas.main")

const defaultHardwareConcurrency = 4;
const reservedCores = 2; //One for main thread, one for the render thread; the rest are used for processing. This means at minimum we run with 3 threads, even if we're on a single-core CPU.
//Note: Safari doesn't support hardwareConcurrency as of 2022-06-09.
const availableCores = 
	(+localStorage.coreOverride)
	|| Math.max(//Available cores for _processing,_ at least 1.
		1, 
		(navigator.hardwareConcurrency || defaultHardwareConcurrency) - reservedCores
	);

const totalPixels = maxScreenRes.x * maxScreenRes.y

//Define simulation memory.
//Could use a double-buffer system, but we would have to copy everything from one buffer to the other each frame. Benefit: no tearing. (ed. note: This is taken care of by locking now?)
const world = {
	__proto__: null,
	
	//Some global configuration.
	globalLock:        [Int32Array,  1], //Global lock for all world data, so we can resize the world. Also acts as a "pause" button. Bool, but atomic operations like i32.
	globalTick:        [Int32Array,  1], //Current global tick.
	workersRunning:    [Int32Array,  1], //Used by workers, last one to finish increments tick.
	totalWorkers:      [Uint32Array, 1],
	simulationSize:    [Uint32Array, 2], //width/height
	wrappingBehaviour: [Uint8Array,  4], //top, left, bottom, right: Set to particle type 0 or 1.
	
	//Particle attribute arrays.
	locks:        [Int32Array    , totalPixels], //Is this particle locked for processing? 0=no, >0 = logic worker, -1 = main thread, -2 = render worker
	types:        [Uint8Array    , totalPixels],
	ticks:        [Uint8Array    , totalPixels], //Used for is_new_tick. Stores whether last tick processed was even or odd. If this doesn't match the current tick, we know to advance the particle simulation one step.
	stages:       [Uint8Array    , totalPixels], //Particle processing step. Usually 0 = hasn't moved yet, 1 = can't move, >2 = done.
	colours:      [Uint32Array   , totalPixels], //This is copied directly to canvas.
	velocityXs:   [Float32Array  , totalPixels],
	velocityYs:   [Float32Array  , totalPixels],
	subpixelXs:   [Float32Array  , totalPixels], //Position comes in through x/y coordinate on screen, but this does not capture subpixel position for slow-moving particles.
	subpixelYs:   [Float32Array  , totalPixels],
	masses:       [Float32Array  , totalPixels],
	temperatures: [Float32Array  , totalPixels], //°C
	scratchA:     [BigUint64Array, totalPixels], //internal state for the particle
	scratchB:     [BigUint64Array, totalPixels],
}

//Hydrate our world data structure.
//First, allocate the memory we need...
const wasmMemoryStartingByte = 1200000 //Try to allocate somewhere above heap and stack. We can probably reduce this quite a bit if we can find the right config flags.
const memory = (()=>{
	const wasmPageSize = 65535 //according to https://developer.mozilla.org/en-US/docs/WebAssembly/JavaScript_interface/Memory/Memory, also, there is no constant to reference.
	const numBytesNeeded = Object.values(world).reduce(
		(accum, [type, entries]) => 
			+ Math.ceil(accum/type.BYTES_PER_ELEMENT) * type.BYTES_PER_ELEMENT //Align access for 2- and 4-byte types.
			+ type.BYTES_PER_ELEMENT * entries,
		wasmMemoryStartingByte
	)
	return new WebAssembly.Memory({
		initial: Math.ceil(numBytesNeeded/wasmPageSize),
		maximum: Math.ceil(numBytesNeeded/wasmPageSize),
		shared: true,
	})
})()

//Then, allocate the data views into the memory.
//This is shared memory which will get updated by the worker threads, off the main thread.
Object.entries(world).reduce(
	(totalBytesSoFar, [key, [type, entries]]) => {
		const startingByteOffset = Math.ceil(totalBytesSoFar/type.BYTES_PER_ELEMENT)*type.BYTES_PER_ELEMENT //Align access for 2- and 4-byte types.
		world[key] = new type(memory.buffer, startingByteOffset, entries)
		return startingByteOffset + world[key].byteLength
	},
	wasmMemoryStartingByte
)

Object.freeze(world)

world.wrappingBehaviour.fill(1) //0 is air, 1 is wall. Default to wall.
world.simulationSize.set([canvas.clientWidth, canvas.clientHeight])
world.totalWorkers[0] = availableCores

//Enable easy script access for debugging.
if (localStorage.devMode) {
	window.world = world
	window.memory = memory
}



///////////////////////
//  Set up workers.  //
///////////////////////

const simulationCores = new Array(availableCores).fill().map((_, coreIndex) => {
	const coreNumber = coreIndex+1 //Sim worker IDs start at 1. Check the definition of world.locks for more details.
	const worker = new Worker('worker/sim.mjs', {type:'module'})
	worker.addEventListener('error', err => console.error(`sim ${coreNumber}:`, err))
	worker.addEventListener('messageerror', err => console.error(`send ${coreNumber}:`, err))
	worker.addEventListener('message', msg => console.log(`sim ${coreNumber}:`, msg))
	
	//Marshal the "start" message across multiple postMessages because of the following bugs: [Adu1bZ]
	//	- Must transfer memory BEFORE world. https://bugs.chromium.org/p/chromium/issues/detail?id=1421524
	//	- Must transfer world BEFORE memory. https://bugzilla.mozilla.org/show_bug.cgi?id=1821582
	;['start', coreNumber, memory, world]
		.forEach(arg => worker.postMessage(arg))
	
	console.info(`Initialised sim core ${coreNumber}/${availableCores}.`)
	
	return worker
})

if (!simulationCores.length) {
	showErrorMessage("This means the game has nothing to run on, and won't work. Perhaps try another browser?")
	throw new Error('sim load failure')
}

console.info(`Main thread ready.`)



////Poke shared memory worker threads are waiting on, once per frame.
//(function advanceTick() {
//	if (!Atomics.load(world.workersRunning, 0)) { 
//		Atomics.add(world.tick, 0, 1)
//		Atomics.notify(world.tick, 0)
//		//console.log('incremented frame')
//	} else {
//		//console.log('missed frame')
//	}
//	requestAnimationFrame(advanceTick)
//})()


/*
const renderCore = await pendingRenderCore
renderCore.postMessage({type:'hello', data:[]})
renderCore.postMessage({type:'bindToData', data:[world]})

//Rendering works by passing around a typed array buffer, so that we can render
//the particles in a worker and then efficiently draw the resulting image in the
//main thread.

drawFrame.context = canvas.getContext('2d')
function drawFrame(buffer, width, height) {
	//If we save the ImageData after transferring the backing array buffer out, transferring the buffer back to this thread doesn't "put it back" into the ImageData's buffer. And since we can't assign it to buffer, we have to recreate the object. Seems fairly light-weight, at least, since we can create the new object with the old buffer.
	//Anyway, first step, we draw the image data. This way, we don't drop frames when we're resizing, even if we do lag a bit.
	drawFrame.context.putImageData(new ImageData(new Uint8ClampedArray(buffer), width, height), 0, 0);
	
	//Regenereate the buffer here if our canvas has changed size. We could use a ResizeObserver, but we'd have to check here anyway since we never *store* the buffer in a permanent variable - it only ever lives in function args, since ownership is passed around between the main and render threads.
	if (canvas.width != width || canvas.height != height) {
		({width, height} = canvas)
		buffer = new ArrayBuffer(4*width*height)
	}
	
	//I'm not sure about the placement of this RAF - should we kick off rendering at the end of the current frame and draw it immediately on the next, as opposed to kicking off the render and hoping it returns before the next frame? I think we could also put it in the web-worker, but that wouldn't really help us here.
	requestAnimationFrame(() => {
		renderCore.postMessage(
			{ type: 'renderInto', data: [buffer, width, height] },
			[ buffer ],
		)
		
		if (buffer.byteLength && !drawFrame.hasThrownTransferError) {
			drawFrame.hasThrownTransferError = true
			console.error('Failed to transfer image data, falling back to expensive copy operation.')
		}
	})
}

drawFrame(new ArrayBuffer(4), 1, 1) //Kick off the render loop.

console.info(`Loaded render core.`)

bindWorldToDisplay(world, $("#stardust-game"), {
	dot:  (...args) => renderCore.postMessage({type:'drawDot',  data:args}),
	line: (...args) => renderCore.postMessage({type:'drawLine', data:args}),
	rect: (...args) => renderCore.postMessage({type:'drawRect', data:args}),
	fill: (...args) => renderCore.postMessage({type:'drawFill', data:args}),
})

console.info('Bound UI elements.')
*/
