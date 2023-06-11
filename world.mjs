//Define shared configuration & state for our WASM simulation cores to count to 3 with. 

const wasmSpareMemory = Math.pow(2, 20)

//World to be constructed. Our arrays will need to be backed by memory and properly aligned to their data structure sizes.
const worldShape = {
	__proto__: null,
	
	globalTick: [Int32Array, 1], //Current global tick. Increment to tell the workers to count up in scratchA!
	workerStatuses: [Int32Array, 3], //Monitoring for the workers.
	scratchA: [BigUint64Array, 300], //internal state for the particle
}

//Hydrate our world data structure.
//First, allocate the memory we need...
export const memory = (()=>{
	const numBytesNeeded = Object.values(worldShape).reduce(
		(accum, [type, entries]) => 
			+ Math.ceil(accum/type.BYTES_PER_ELEMENT) * type.BYTES_PER_ELEMENT //Align access for 2- and 4-byte types.
			+ type.BYTES_PER_ELEMENT * entries,
		wasmSpareMemory
	)
	
	const wasmPageSize = 65535 //According to https://developer.mozilla.org/en-US/docs/WebAssembly/JavaScript_interface/Memory/Memory. There is no constant to reference, we must provide our own.
	return new WebAssembly.Memory({
		initial: Math.ceil(numBytesNeeded/wasmPageSize),
		maximum: Math.ceil(numBytesNeeded/wasmPageSize),
		shared: true,
	})
})()

export const getWorldAt = wasmMemoryStartingByte => {
	//Then, allocate the data views into the memory.
	//This is shared memory which will get updated by the worker threads, off the main thread.
	let world = new Object(null)
	
	//Create `world` from `worldShape`.
	Object.entries(worldShape).reduce(
		(totalBytesSoFar, [key, [type, entries]]) => {
			const startingByteOffset = Math.ceil(totalBytesSoFar/type.BYTES_PER_ELEMENT)*type.BYTES_PER_ELEMENT //Align access for 2- and 4-byte types.
			world[key] = new type(memory.buffer, startingByteOffset, entries)
			return startingByteOffset + world[key].byteLength
		},
		wasmMemoryStartingByte
	)
	
	return Object.freeze(world)
}