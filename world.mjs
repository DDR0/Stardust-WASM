//World module. Provides creation of and access to the data structure, and as little else as possible.

//4k resolution, probably no sense reserving more memory than that especially given we expect to scale up our pixels. (Tch - just another example of a website author making something that caps out at their screen resolution. 🙄)
export const maxWorldSize = Object.freeze({ x: 3840, y: 2160 })
const totalPixels = maxWorldSize.x * maxWorldSize.y
const wasmMemoryStartingByte = 1200000 //Try to allocate somewhere above heap and stack. We can probably reduce this quite a bit if we can find the right config flags.


///////////////////////////////////////
//  Define simulation world memory.  //
///////////////////////////////////////

//Could use a double-buffer system, but we would have to copy everything from one buffer to the other each frame. Benefit: no tearing. (ed. note: This is taken care of by locking now?)
export const world = {
	__proto__: null,
	
	//Some global configuration.
	//TODO: Don't need global lock, since we can just not advance globalTick from the main thread which is the only place we need to lock it.
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
export const memory = (()=>{
	const wasmPageSize = 65535 //According to https://developer.mozilla.org/en-US/docs/WebAssembly/JavaScript_interface/Memory/Memory. There is no constant to reference, we must provide our own.
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
Object.freeze(memory)

//Enable easy script access for debugging.
if (localStorage.devMode) {
	window.world = world
	window.memory = memory
}


/*

This isn't needed for now, but I'm leaving it in in case I ever do need to pause the sim for stuff.

/////////////////////////////
//  Pause the simulation.  //
/////////////////////////////

let simulationPauseRequests = 0;
export const SimulationIsPaused = () => !simulationPauseRequests

//Returns an awaitable delay of ⪆10ms.
const timeout = ms => new Promise(resolve => setTimeout(resolve, ms))
const frame = () => new Promise(resolve => requestAnimationFrame(resolve))

//Lock the world to run a function. Waits for all workers to finish.
//cb: Callback. Can be async.
//Note: We should probably coalesce calls, since this is being used for resizing the simulation.
//Note: Wait. We might not need to pause the sim if we don't use a linear chunk of memory, because resizing it shouldn't lead to corruption then.
export async function lockWorldTo(cb) {
	simulationPauseRequests++
	await workersSettled() //[80rxVM] Potential race condition: workers may be settled, but awaiting a wakeup which has been issued but not received yet. To solve this, when unsettling workers, write 1 to their statuses and then have them write 2 when they're running or something. It's probably enough just to do the first one non-atomically before issueing the go order but after checking for paused-ness.
	await cb()
	simulationPauseRequests--
}

export const workersSettled = Atomics.waitAsync
	? async () =>
		Promise.all(new Array(world.totalWorkers[0]).fill().map((_, coreIndex) =>
			Atomics.waitAsync(
				world.workerStatuses, 
				coreIndex, 
				0, 
				timeToWait - (iter*(timeToWait/lockAttempts))
			)
		))
	: async () => {
		throw new Error('TODO')
	}
*/


function assertInRange(a, b, c) {
	if (a > c) throw new RangeError(`min(${a}) > max(${c})`)
	if (a > b) throw new RangeError(`min(${a}) > val(${b})`)
	if (b > c) throw new RangeError(`val(${b}) > max(${c})`)
	return b
}