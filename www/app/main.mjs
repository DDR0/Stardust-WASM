"use strict"

if (!window.SharedArrayBuffer) {
	document.body.innerHTML = `
		<div>
			<h1>Software Failure</h1>
			<p>Your browser does not appear to support shared array buffers, which are required by <em>Stardust</em>. Perhaps try another one?</p>
			<p>Guru Meditation 0x${(!!Atomics.waitAsync << 2 | crossOriginIsolated << 1 | isSecureContext << 0).toString(16).toUpperCase().padStart(2, '0')}</p>
		</div>
	`
	throw new ReferenceError('SharedArrayBuffer is not defined.')
}

if (!Atomics.waitAsync) { //Firefox doesn't support asyncWait as of 2022-06-12.
	console.warn('Atomics.waitAsync not available; glitching may occur when resized.')
}

//import { graphData } from './graphData.mjs'
import * as ui from './ui.mjs'

const $ = document.querySelector.bind(document);
//const $$ = document.querySelectorAll.bind(document);

const canvasSelector = "canvas" //just use the first canvas we find for now
const maxScreenRes = Object.freeze({ x: 3840, y: 2160 }) //4k resolution, probably no sense reserving more memory than that especially given we expect to scale up our pixels.
const totalPixels = maxScreenRes.x * maxScreenRes.y
const renderBuffer = new Uint8Array(new SharedArrayBuffer(totalPixels * Uint8Array.BYTES_PER_ELEMENT * 3)) //rgb triplets (no a?) - drawn to canvas to render the game

const world = Object.freeze({
	__proto__: null,
	lock: new Int32Array(new SharedArrayBuffer(1 * Int32Array.BYTES_PER_ELEMENT)),
	bounds: Object.seal({ 
		__proto__: null,
		x: new Int32Array(new SharedArrayBuffer(1 * Int32Array.BYTES_PER_ELEMENT)), 
		y: new Int32Array(new SharedArrayBuffer(1 * Int32Array.BYTES_PER_ELEMENT)),
	}),
	wrappingBehaviour: new Uint8Array(new SharedArrayBuffer(4 * Uint8Array.BYTES_PER_ELEMENT)), //top, left, bottom, right: Set to a particle type. 0 or 1.
	particles: Object.freeze({
		__proto__: null,
		lock:        new Int32Array    (new SharedArrayBuffer(totalPixels * Int32Array.    BYTES_PER_ELEMENT)), //Is this particle locked for processing? 0=no, 1=yes.
		type:        new Uint8Array    (new SharedArrayBuffer(totalPixels * Uint8Array.    BYTES_PER_ELEMENT)),
		stage:       new Uint8Array    (new SharedArrayBuffer(totalPixels * Uint8Array.    BYTES_PER_ELEMENT)), //Particle processing step. Usually 0 = hasn't moved yet, 1 = can't move, >2 = done.
		initiative:  new Float32Array  (new SharedArrayBuffer(totalPixels * Float32Array.  BYTES_PER_ELEMENT)), //Faster particles get more initiative to spend moving around.
		rgba:        new Uint32Array   (new SharedArrayBuffer(totalPixels * Uint32Array.   BYTES_PER_ELEMENT)),
		velocity: {
			__proto__: null,
		    x:       new Float32Array  (new SharedArrayBuffer(totalPixels * Float32Array.  BYTES_PER_ELEMENT)),
		    y:       new Float32Array  (new SharedArrayBuffer(totalPixels * Float32Array.  BYTES_PER_ELEMENT)),
		},
		subpixelPosition: { 
			__proto__: null,
		    x:       new Float32Array  (new SharedArrayBuffer(totalPixels * Float32Array.  BYTES_PER_ELEMENT)), //Position comes in through x/y coordinate on screen, but this does not capture subpixel position for slow-moving particles.
		    y:       new Float32Array  (new SharedArrayBuffer(totalPixels * Float32Array.  BYTES_PER_ELEMENT)),
		},
		mass:        new Float32Array  (new SharedArrayBuffer(totalPixels * Float32Array.  BYTES_PER_ELEMENT)),
		temperature: new Float32Array  (new SharedArrayBuffer(totalPixels * Float32Array.  BYTES_PER_ELEMENT)), //Kelvin
		scratch1:    new BigUint64Array(new SharedArrayBuffer(totalPixels * BigUint64Array.BYTES_PER_ELEMENT)), //internal state for the particle
		scratch2:    new BigUint64Array(new SharedArrayBuffer(totalPixels * BigUint64Array.BYTES_PER_ELEMENT)),
	})
})

window.world = world //For debugging.

Array.prototype.fill.call(world.wrappingBehaviour, 1) //0 is air, 1 is wall. Default to wall.


///////////////////////////
//  Set up HTML events.  //
///////////////////////////

new ResizeObserver(([{target: canvas}]) => {
	const lockAttempts = 20;
	const timeToWait = 2000; //ms
	
	//Firefox doesn't support asyncWait as of 2022-06-12.
	Atomics.waitAsync ? acquireWorldLock() : updateCanvasSize()
	
	async function acquireWorldLock(iter=1) {
		//I think this suffers from lock contention, there's no guarantee it'll ever really be free. We should probably just copy it over from a cache every frame.
		if(0 === Atomics.compareExchange(world.lock, 0, 0, 1)) {
			updateCanvasSize() //Safely, lock obtained.
			Atomics.store(world.lock, 0, 0)
			Atomics.notify(world.lock, 0, 2)
		}
		else if (iter > lockAttempts) {
			updateCanvasSize(); //Yolo, couldn't get lock.
			console.error(`Failed to acquire world lock.`)
		}
		else {
			await Atomics.waitAsync(world.lock, 0, 0, timeToWait/lockAttempts)
			acquireWorldLock(iter + 1)
			console.info(`Failed to acquire world lock ×${iter}.`)
		}
	}
	
	function updateCanvasSize() {
		console.log(`canvas resized to ${canvas.width}×${canvas.height} – TODO: copy pixel data here.`)
		
		world.bounds.x[0] = canvas.width;
		world.bounds.y[0] = canvas.height;
	}
	
}).observe($(canvasSelector))



///////////////////////
//  Set up workers.  //
///////////////////////


const callbacks = { ok: Object.create(null), err: Object.create(null) } //Default, shared callbacks.
callbacks.ok.hello = ui.pong
//callbacks.ok.update = graphUi.repaint
callbacks.ok.pong = ui.pong

const reservedCores = 2; //One for main thread, one for the render thread.
const availableCores = Math.max(1, (navigator.hardwareConcurrency || 4) - reservedCores); //Safari doesn't support hardwareConcurrency as of 2022-06-09.


//Wrap a worker for our error-handling callback style, ie, callbacks.ok.whatever = ()=>{}.
function wrapForCallbacks(worker, callbacks) {
	worker.addEventListener('message', ({'data': {type, data, error}}) => {
		if (error !== undefined && data !== undefined)
			return console.error(`malformed message '${type}', has both data and error`)
		
		const callback = 
			callbacks[error!==undefined?'err':'ok'][type]
			?? (error!==undefined 
				? console.error 
				: console.error(`unknown main event '${error!==undefined?'err':'ok'}.${type}')`) )
		callback(...(data ?? [error]))
	});
	
	return worker
}


const pendingRenderCore = new Promise((resolve, reject) => {
	const worker = wrapForCallbacks(
		new Worker('./renderWorker.mjs'),
		{
			err: { ...callbacks.err }, 
			ok: {
				...callbacks.ok,
				ready: ()=>{
					resolve(worker)
				},
			},
		}
	)
})

const pendingLogicCores = Array(availableCores).fill().map((_,i)=>{
	return new Promise((resolve, reject) => {
		const worker = wrapForCallbacks(
			new Worker('./logicWorker.mjs'),
			{
				err: { ...callbacks.err }, 
				ok: {
					...callbacks.ok,
					ready: ()=>{
						resolve(worker)
						worker.postMessage({type:'hello', data:[]});
					}
				}
			},
		)
	});
})

//Wait for our compute units to become available.
const renderCore = await pendingRenderCore
const logicCores = await Promise.allSettled(pendingLogicCores)
	.then(results => results
		.filter(result => result.status === "fulfilled")
		.map(result => result.value))

logicCores.forEach((core, coreNumber, cores) => core.postMessage({
	type: 'start',
	data: [coreNumber, cores.length, world],
}))

console.info(`Loaded render core and ${logicCores.length}/${pendingLogicCores.length} logic cores.`)
if(!logicCores.length) {
	document.body.innerHTML = `
		<div>
			<h1>Software Failure</h1>
			<p>Failed to load any simulation cores. Perhaps try another browser?</p>
			<p>Guru Meditation 0x${(!!Atomics.waitAsync << 2 | crossOriginIsolated << 1 | isSecureContext << 0).toString(16).toUpperCase().padStart(2, '0')}</p>
		</div>
	`
	throw new Error('Failed to load any simulation cores.')
}