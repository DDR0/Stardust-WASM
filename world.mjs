//World module. Provides creation of and access to the data structure, and as little else as possible.

//4k resolution, probably no sense reserving more memory than that especially given we expect to scale up our pixels. (Tch - just another example of a website author making something that caps out at their screen resolution. 🙄)
export const maxWorldSize = Object.freeze({ x: 3840, y: 2160 })
const totalPixels = maxWorldSize.x * maxWorldSize.y
const wasmMemoryStartingByte = 1200000 //Try to allocate somewhere above heap and stack. We can probably reduce this quite a bit if we can find the right config flags.


///////////////////////////////////////
//  Define simulation world memory.  //
///////////////////////////////////////

//Could use a double-buffer system, but we would have to copy everything from one buffer to the other each frame. Benefit: no tearing. (ed. note: This is taken care of by locking now?)
//Make sure this data structure is synced with Rust! [1CLsom]
export const world = {
	__proto__: null,
	
	//Some global configuration.
	//TODO: Don't need global lock, since we can just not advance globalTick from the main thread which is the only place we need to lock it.
	globalLock:        [Int32Array,   1], //Global lock for all world data, so we can resize the world. Also acts as a "pause" button. Bool, but atomic operations like i32.
	globalTick:        [Int32Array,   1], //Current global tick.
	workerStatuses:    [Int32Array, 248], //Used by workers, last one to finish increments tick. i32 because that's what Atomics.waitAsync and friends takes, along with i64 which we don't need.
	totalWorkers:      [Uint32Array,  1],
	simulationWindow:  [Uint32Array,  4], //x1/y1/x2/y2 to run the simulation in.
	wrappingBehaviour: [Uint8Array,   4], //top, left, bottom, right: Set to particle type 0 or 1.
	
	//Particle attribute arrays.
	locks:        [Int32Array    , totalPixels], //Is this particle locked for processing? 0=no, >0 = logic worker, -1 = main thread, -2 = render worker
	scratchA:     [BigUint64Array, totalPixels], //internal state for the particle
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
window.world = world
window.memory = memory