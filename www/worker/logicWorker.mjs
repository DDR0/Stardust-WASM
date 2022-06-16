"use strict"

const {rng} = await import("./rng.mjs")
const wasm = await import("../../crate-wasm/pkg/index.js");

wasm.init()

const requestFramerateCallback = self.requestAnimationFrame ?? (cb=>setTimeout(cb, 16)) //16ms: Default to a 60fps timeout if we can't hook into the animation callback.
const cancelFramerateCallback = self.cancelAnimationFrame ?? clearTimeout
if (!self.requestAnimationFrame) {
	console.warn("requestAnimationFrame unavailable; falling back to setTimeout. Motion may be rougher.")
}

let thisWorkerIndex = 0
let totalWorkers = 1
let thisWorkerID = -1
let world

let mainLoopID = -1
let lastFrameTime = 0;

const callbacks = Object.freeze({
	__proto__: null,
	
	hello: _=>{
		console.log('logic worker hello');
		return [wasm.hello()]
	},
	
	start: (_thisWorkerIndex, _totalWorkers, _world) => {
		thisWorkerIndex = _thisWorkerIndex
		totalWorkers = _totalWorkers
		thisWorkerID = _thisWorkerIndex + 1
		world = _world
		
		// performance.now() is not the same unit of time as the processFrame callback
		// argument in Chrome, so we pre-pump one frame to get accurate results.
		mainLoopID = requestFramerateCallback(thisFrameTime=>{
			lastFrameTime = thisFrameTime;
			mainLoopID = requestFramerateCallback(processFrame)
		});
	},
	
	stop: () => {
		cancelFramerateCallback(mainLoopID)
	}
})

addEventListener("message", ({'data': {type, data}}) => {
	const callback = callbacks[type]
	if (!callback) { return console.error(`unknown worker event '${type}')`) }
	
	console.info('worker msg', type, data)
	
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




function processFrame(thisFrameTime) {
	mainLoopID = requestFramerateCallback(processFrame)
	
	//Minimum and maximum framerate delta within which to try to run the simulation.
	const timeDelta = Math.max(1000/500, Math.min(thisFrameTime - lastFrameTime, 1000/10))
	lastFrameTime = thisFrameTime
	
	let x = 0;
	let y = 0;
	let delta = 1;
	let stage = 0; //0: Try to move where you ideally want to. 1: (Disabled for now.) Move where you can.
	const numStages = 1; //The first stage is stage 0, like with arrays.
	const worldX = world.bounds.x[0];
	const worldY = world.bounds.y[0];
	let iterCounter = 1;
	let didProcessParticle = 0;
	const iterationLimit = 100;
	
	// The Two Stages of Particle Logic (each stage is resolved iteratively)
	// 1. Can we do the move we would ideally like to?
	// 2. Can we do any move?
	
	while (1) {
		didProcessParticle |= wasm.process_particle(world, thisWorkerID, x, y)
		
		//Check if we're at bounds.
		if (x + delta < 0 || x + delta >= worldX) { //OK, we're off the end of a row.
			if (y + delta < 0 || y + delta >= worldY) { //We're off the end of a column too.
				if (iterCounter >= iterationLimit) break
				if (!didProcessParticle) { //Nothing happened this iteration.
					stage++
					if (stage >= 1) {
						break
					}
				}
				iterCounter++
				didProcessParticle = 0
				delta = delta * -1
			} else {
				y = y + delta
				x = x + (worldX*delta) + delta
			}
		} else {
			x = x + delta
		}
	}
}



/*
const runParticleAt = (()=>{
	const getVal = (array, {x, y}, stride=1) => {
		return array[(x+y*world.bounds.y[0]) * stride]
	}
	const setVal = (array, {x, y}, value, stride=1) => {
		array[(x+y*world.bounds.y[0]) * stride] = value
	}
	
	const allFields = Object.values(world.particles).flatMap(value=>
		typeof value === "object"
			? Object.values(value)
			: [value]
	)
	
	const swapParticles = (pos1, pos2)=>{
		fields.forEach(field=>{
			const tmp = getVal(field, pos)
		})
	};
	
	const particleBehaviours = Object.freeze({
		__proto__: null,
		0: () => false, //empty (should become air)
		1: () => false, //wall, never changes
		2: (pos) => {
			//acquire lock
			
			//rng.seed((y<<8) + x + p.subpixelPosition.x)
			
			//release lock
			return false;
		}
	})
	
	return (pos) =>
		particleBehaviours[
			getVal(world.particles.type, pos)
		](pos)
})()
*/