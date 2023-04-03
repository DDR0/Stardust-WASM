import {world, memory} from './world.mjs'

//Let's count to 3!
//We'll count a bunch of times to make sure we get it right.
//However, we never seem to get it right if we have multple workers
//counting at once, even though they're working on different values.

//Load a core and send the "start" event to it.
const startAWorkerCore = coreIndex => {
	const worker = new Worker('worker/sim.mjs', {type:'module'})
	;['start', coreIndex+1, memory, world].forEach(arg => worker.postMessage(arg)) //Marshal the "start" message across multiple postMessages because of the following bugs: 1. Must transfer memory BEFORE world. https://bugs.chromium.org/p/chromium/issues/detail?id=1421524 2. Must transfer world BEFORE memory. https://bugzilla.mozilla.org/show_bug.cgi?id=1821582
}

//Now, let's start some worker threads! They will work on different memory locations, so they don't conflict.
startAWorkerCore(0) //works fine
startAWorkerCore(1) //breaks counting - COMMENT THIS OUT TO FIX COUNTING
startAWorkerCore(2) //breaks counting - COMMENT THIS OUT TO FIX COUNTING


//Advance the simulation one step. (Trigger the worker threads to do their work.)
//Right now, the simulation increments each value in scratch space by 1.
const tick = () => {
	Atomics.add(world.globalTick, 0, 1)
	Atomics.notify(world.globalTick, 0)
}

//Log the simulation values which are set in scratch memory by the workers on tick.
const log = () => {
	console.log(world.scratchA.slice(0,100))
}


//The following should output a list of 0s, then 1s, 2s, and 3s.
//It does if you only start one worker.
//Otherwise the 3s have 4s and 2s in them as things go off the rails.

setTimeout(log,  500) //expected [0n, 0n, 0n, ...]
setTimeout(tick, 500)
setTimeout(log,  700) //expected [1n, 1n, 1n, ...]
setTimeout(tick, 700)
setTimeout(log,  900) //expected [2n, 2n, 2n, ...]
setTimeout(tick, 900)
setTimeout(log, 1100) //expected [3n, 3n, 3n, ...]