const defaultHardwareConcurrency = 4;
const reservedCores = 2; //One for main thread, one for the render thread; the rest are used for processing. This means at minimum we run with 3 threads, even if we're on a single-core CPU.
//Note: Safari doesn't support hardwareConcurrency as of 2022-06-09.
const availableCores = 
	(+localStorage.coreOverride)
	|| Math.max(//Available cores for _processing,_ at least 1.
		1, 
		(navigator.hardwareConcurrency || defaultHardwareConcurrency) - reservedCores
	);

const maxScreenRes = Object.freeze({ x: 3840, y: 2160 }) //4k resolution, probably no sense reserving more memory than that especially given we expect to scale up our pixels.
const totalPixels = maxScreenRes.x * maxScreenRes.y

//Allocate simulation memory.
//Could use a double-buffer system, but we would have to copy everything from one buffer to the other each frame. Benefit: no tearing.
const world = {
	__proto__: null,
	
	//Some global configuration.
	globalLock:        [Int32Array, 1], //Global lock for all world data, so we can resize the world. Also acts as a "pause" button. Bool, but atomic operations like i32.
	globalTick:        [Int32Array, 1], //Current global tick.
	workersRunning:    [Int32Array, 1], //Used by workers, last one to finish increments tick.
	simulationSize:    [Int32Array, 2], //width/height
	wrappingBehaviour: [Uint8Array, 4], //top, left, bottom, right: Set to particle type 0 or 1.
	
	//Particle attribute arrays.
	locks:        [Int32Array    , totalPixels], //Is this particle locked for processing? 0=no, >0 = logic worker, -1 = main thread, -2 = render worker
	types:        [Uint8Array    , totalPixels],
	ticks:        [Uint8Array    , totalPixels], //Used for is_new_tick. Stores whether last tick processed was even or odd. If this doesn't match the current tick, we know to advance the particle simulation one step.
	stages:       [Uint8Array    , totalPixels], //Particle processing step. Usually 0 = hasn't moved yet, 1 = can't move, >2 = done.
	colours:      [Uint32Array   , totalPixels], //This is copied directly to canvas.
	velocityXs:   [Float32Array  , totalPixels],
	velocityYs:   [Float32Array  , totalPixels],
	subpixelXs:   [Float32Array  , totalPixels], //Position comes in through x/y coordinate on screen, but this does not capture subpixel position for slow-moving particles.
	subpixelXs:   [Float32Array  , totalPixels],
	masses:       [Float32Array  , totalPixels],
	temperatures: [Float32Array  , totalPixels], //Kelvin
	scratchA:     [BigUint64Array, totalPixels], //internal state for the particle
	scratchB:     [BigUint64Array, totalPixels],
}

//Hydrate our world data structure.
//First, allocate the memory we need...
const memory = (()=>{
	const WASM_PAGE_SIZE = 65535 //according to https://developer.mozilla.org/en-US/docs/WebAssembly/JavaScript_interface/Memory/Memory, also, there is no constant to reference.
	const numBytesNeeded = Object.values(world).reduce(
		(accum, [type, entries]) => 
			+ Math.ceil(accum/type.BYTES_PER_ELEMENT) * type.BYTES_PER_ELEMENT //Align access for 2- and 4-byte types.
			+ type.BYTES_PER_ELEMENT * entries,
		0
	)
	return new WebAssembly.Memory({
		initial: Math.ceil(numBytesNeeded/WASM_PAGE_SIZE),
		maximum: Math.ceil(numBytesNeeded/WASM_PAGE_SIZE),
		shared: true,
	})
})()

//Then, allocate the data views into the memory.
//This is shared memory which will get updated by the worker threads, off the main thread.
Object.entries(world).reduce((totalBytesSoFar, [key, [type, entries]]) => {
	const startingByteOffset = Math.ceil(totalBytesSoFar/type.BYTES_PER_ELEMENT)*type.BYTES_PER_ELEMENT //Align access for 2- and 4-byte types.
	world[key] = new type(memory.buffer, totalBytesSoFar, entries)
	return startingByteOffset + world[key].byteLength
}, 0)

Object.freeze(world)

world.wrappingBehaviour.fill(1) //0 is air, 1 is wall. Default to wall.
world.simulationSize.set([200, 300])

//const memory = new WebAssembly.Memory({ initial:1, maximum:1, shared:true })

console.info(`Main Thread: ${['memory', memory]}.`)

new Worker('worker/sim.mjs', {type:'module'})
	.addEventListener('message', ({target}) => {
		target.postMessage(['memory', memory]) //does not work in Chrome
		target.postMessage(['world', world]) //does not work in Chrome
		target.postMessage(['both', memory, world]) //does work
	})