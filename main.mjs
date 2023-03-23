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
const availableCores = Math.min(256, //max number of cores we support - I recognise this is very ambitious, it should probably be lowered to reduce memory contention on the high end once if we can find a suitable test rig.
	(+localStorage.coreOverride)
	|| Math.max(//Available cores for _processing,_ at least 1.
		1, 
		(navigator.hardwareConcurrency || defaultHardwareConcurrency) - reservedCores
	)
);

const totalPixels = maxScreenRes.x * maxScreenRes.y

//Define simulation memory.
//Could use a double-buffer system, but we would have to copy everything from one buffer to the other each frame. Benefit: no tearing. (ed. note: This is taken care of by locking now?)
const world = {
	__proto__: null,
	
	//Some global configuration.
	globalLock:        [Int32Array,  1], //Global lock for all world data, so we can resize the world. Also acts as a "pause" button. Bool, but atomic operations like i32.
	globalTick:        [Int32Array,  1], //Current global tick.
	workerStatuses:    [Int32Array,  256], //Used by workers, last one to finish increments tick. i32 because that's what Atomics.waitAsync and friends takes, along with i64 which we don't need.
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


//Returns an awaitable delay of ⪆10ms.
const timeout = ms => new Promise(resolve => setTimeout(resolve, ms))
const frame = () => new Promise(resolve => requestAnimationFrame(resolve))

//Lock the world to run a function. Waits for all workers to finish.
//cb: Callback. Can be async.
//fail: Set to `false` to invoke callback if a lock cannot be obtained.
//iter: Number of times to try to acquire the lock over the duration. Defaults to 100. Currently uses the stack for this, so don't put too high a number.
//timeToWait: Duration over which to try to acquire the lock. Defaults to 1000.
//So, with iter=100 and timeToWait=1000, it'll try every 10ms to acquire the
//lock. This should be ~fine for gui-based interactions.
async function lockWorldTo(cb, fail=true, iter=100, timeToWait=1000) {
	if(0 === Atomics.compareExchange(world.globalLock, 0, 0, 1)) {
		await cb() //Safely, lock obtained.
		Atomics.store(world.globalLock, 0, 0)
		Atomics.notify(world.globalLock, 0)
	}
	else if (iter <= 0) {
		console.warn(`Failed to acquire world lock.`)
		fail || await cb(); //yolo
	}
	else if (Atomics.waitAsync) { //Firefox doesn't support asyncWait as of 2022-06-12.
		//console.info(`Failed to acquire world lock ×${iter}.`)
		await Atomics.waitAsync(world.globalLock, 0, 0, timeToWait/lockAttempts)
		await Promise.all(new Array(availableCores).fill().map((_, coreIndex) =>
			Atomics.waitAsync(
				world.workerStatuses, 
				coreIndex, 
				0, 
				timeToWait - (iter*(timeToWait/lockAttempts))
			)
		))
		await lockWorldTo(cb, timeToWait, iter-1, fail)
	} else {
		//console.info(`Failed to acquire world lock ×${iter}.`)
		await lockWorldTo(cb, timeToWait, iter-1, fail)
		await timeout(20) //Wait for a little bit for the simulation cores to stop.
		//TODO: Write our own version of `Atomics.waitAsync` here. Basically,
		//using a combination of `Atomics.load(…)` with `setTimeout(…)` and
		//`new Promise(…)` ought to work - check every little while and resolve
		//the promise if the value is good.
	}
}



///////////////////////
//  Set up workers.  //
///////////////////////

const simulationCores = new Array(availableCores).fill().map((_, coreIndex) => {
	const coreNumber = coreIndex+1 //Sim worker IDs start at 1. Check the definition of world.locks for more details.
	const worker = new Worker('worker/sim.mjs', {type:'module'})
	//worker.addEventListener('error', err => console.error(`sim ${coreNumber}:`, err))
	//worker.addEventListener('messageerror', err => console.error(`send ${coreNumber}:`, err))
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



{
//Draw the particle colours in the world to the canvas.
	const context = canvas.getContext('2d')
	const drawFrame = () => {
		const [width, height] = world.simulationSize
		
		context.putImageData(
			new ImageData(
				new Uint8ClampedArray(
					world.colours.slice(0, 4 * width * height)
				),
				width, height
			),
			0, 0
		)
		
		//I'm not sure about the placement of this RAF - should we kick off rendering at the end of the current frame and draw it immediately on the next, as opposed to kicking off the render and hoping it returns before the next frame? I think we could also put it in the web-worker, but that wouldn't really help us here.
		requestAnimationFrame(drawFrame)
	}
	requestAnimationFrame(drawFrame)
}

bindWorldToDisplay(world, lockWorldTo, $("#stardust-game"), {
	pick: (x,y) => {},
	dot:  (x,y, radius, type) => {},
	line: (x1, y1, x2, y2, radius, type) => {},
	rect: (x1, y1, x2, y2, radius, type) => {},
})

console.info('Bound UI elements.')
