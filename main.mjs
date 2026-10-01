//Error preamble.
const showErrorMessage = message => 
	document.body.innerHTML = `
		<div>
			<h1>Internal Failure</h1>
			<p>${message}</p>
			<p>Guru Meditation 0x${(!!Atomics.waitAsync << 2 | crossOriginIsolated << 1 | isSecureContext << 0).toString(16).toUpperCase().padStart(2, '0')}</p>
		</div>
	`

if (!window.isSecureContext) {
	showErrorMessage("This website was not served in a secure context, which is required by <em>Stardust</em>. This is likely the result of a server misconfiguration.")
}

if (!window.SharedArrayBuffer) {
	showErrorMessage("Your browser does not appear to support shared array buffers, which are required by <em>Stardust</em>. Perhaps try another one?")
	throw new ReferenceError('SharedArrayBuffer is not defined.')
}

if (!Atomics.waitAsync) { //Firefox doesn't support asyncWait as of 2023-01-28.
	console.warn('Atomics.waitAsync is not available; glitching may occur when resized.')
}


//Actual start of logic.
import {bindDisplayTo} from './ui.mjs'
import {world, memory, maxWorldSize, workersAreRunning} from './world.mjs'

const $ = document.querySelector.bind(document);
const $$ = document.querySelectorAll.bind(document);

const canvas = $("#stardust-game canvas.main")

const defaultHardwareConcurrency = 4;
const reservedCores = 3; //One for main thread, one for the render thread, one for the OS; the rest are used for processing. This means at minimum we run with 3 threads, even if we're on a single-core CPU.
//Note: Safari doesn't support hardwareConcurrency as of 2022-06-09.
const availableCores = Math.min(
	world.workerStatuses.length, //max number of cores we support - I recognise this is very ambitious, it should probably be lowered to reduce memory contention on the high end once if we can find a suitable test rig.
	(+localStorage.coreOverride) ||
		Math.max(//Available cores for _processing,_ at least 1.
			1, 
			(navigator.hardwareConcurrency || defaultHardwareConcurrency) - reservedCores
		)
);

world.wrappingBehaviour.fill(1) //0 is air, 1 is wall, etc. Default to wall.
world.totalWorkers[0] = availableCores

let ctrlHeld = false
let altHeld = false
for (const eventName of ['keydown', 'keyup']) {
	document.addEventListener(eventName, ({ctrlKey, altKey}) => {
		ctrlHeld = ctrlKey
		altHeld = altKey
		console.log(ctrlHeld, altHeld)
	})
};



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

const simulate = (()=>{
	let ticker = 0
	const loop = ()=>{
		simulate.tick()
		ticker = requestAnimationFrame(loop)
	}
	
	return Object.freeze({
		tick: () => {
			if (workersAreRunning()) {
				//console.info('dropped frame')
				return 0
			} else {
				//console.info('incremented frame')
				world.workerStatuses.fill(1, 0, world.totalWorkers[0])
				Atomics.add(world.globalTick, 0, 1)
				Atomics.notify(world.globalTick, 0)
				return world.globalTick[0]
			}
		},
		
		pause: () => ticker &= cancelAnimationFrame(ticker), //pause twice is fine,
		play: () => ticker ||= requestAnimationFrame(loop),  //but don't start twice
	})
})()
simulate.play()

if (localStorage.devMode) {
	window.simulate = simulate
}



{
	//Flip the colours of the particles to the canvas.
	const context = canvas.getContext('2d')
	
	//We need a non-shared buffer to write to the canvas.
	let rgbaArray = new Uint8ClampedArray(0) //r,g,b,a, r,g,b,a, …
	let rgbaArrayWordView = new Uint32Array(rgbaArray.buffer) //rgba, rgba, …
	
	requestAnimationFrame(function drawFrame() {
		const [x1, y1, x2, y2] = world.simulationWindow
		
		const outputWidth  = x2-x1 || 1,
		      outputHeight = y2-y1 || 1
		
		//Try to avoid GC pressure by reusing the output buffer.
		//The buffer for an ImageData must be exactly the right length.
		const requiredBufferByteLength = 4 * outputWidth * outputHeight
		if (rgbaArray.byteLength != requiredBufferByteLength) {
			rgbaArray = new Uint8ClampedArray(requiredBufferByteLength)
			rgbaArrayWordView = new Uint32Array(rgbaArray.buffer)
		}
		
		//For each line of the simulation, copy the colours to a contiguous rect to draw to canvas.
		//Visually: data:image/gif;base64,R0lGODdhJQARAIABAAAAAP///ywAAAAAJQARAAACTIyPqcsGD6N8rQZgEc5rc89px6SA2gQ54cWYo+pIpaiSm9uYdwtfcoKx+SKs4gfYQxozIE9QtgvhlrRpp4WiUCtWS1e5GmWz4bI5UQAAOw==
		const viewOffset = (y1 * maxWorldSize.x) + x1
		
		//Bulk copy the colours over for display.
		//The buffer for an ImageData must be a Uint8ClampedArray with non-shared backing storage.
		//So we copy the shared Uint32Array colours to the Uint8ClampedArray's backing storage through the view.
		rgbaArrayWordView.set(world.colours.subarray(viewOffset, viewOffset+(outputWidth*outputHeight)))
		context.putImageData(new ImageData(rgbaArray, outputWidth, outputHeight), 0, 0)
		
		//I'm not sure about the placement of this RAF - should we kick off rendering at the end of the current frame and draw it immediately on the next, as opposed to kicking off the render and hoping it returns before the next frame? I think we could also put it in the web-worker, but that wouldn't really help us here. The advantage to the current way is that if an error is encountered, then we stop rendering so we can debug the error.
		requestAnimationFrame(drawFrame)
	})
}

{
	//Show which (if any) workers are still running.
	const colour = Object.freeze({
		__proto__: null,
		notWorking: 0xFF55BB55,
		working: 0xFF55DDDD,
		unavailable: 0x44000020,
	})
	
	const canvasSelector = `#stardust-game canvas[workerStatus]`
	const canvas = $(canvasSelector)
	const context = canvas.getContext('2d') //note: Could switch to bitmaprenderer? eg, https://developer.mozilla.org/en-US/docs/Web/API/OffscreenCanvas/getContext
	const rgbaArray = new Uint8ClampedArray(4 * canvas.height * canvas.width) //a,b,g,r, a,b,g,r, …
	const rgbaArrayWordView = new Uint32Array(rgbaArray.buffer) //abgr, abgr, …
	
	canvas.setAttribute('title', `Simulating using ${availableCores}/${navigator.hardwareConcurrency || defaultHardwareConcurrency} CPU cores.`);
	canvas.textContent = canvas.getAttribute('title')
	
	console.assert(
		rgbaArrayWordView.length >= world.workerStatuses.length,
		`${canvasSelector} not large enough to show all workers.`
	)
	
	for (let i = world.workerStatuses.length; i < rgbaArrayWordView.length; i++) {
		rgbaArrayWordView[i] = colour.unavailable
	}
	
	requestAnimationFrame(function readOutWorkerStatuses() {
		for (let i = 0; i < world.totalWorkers; i++) {
			rgbaArrayWordView[i] = colour.notWorking + world.workerStatuses[i] * (colour.working - colour.notWorking)
		}
		context.putImageData(new ImageData(rgbaArray, canvas.height, canvas.width), 0, 0)
		requestAnimationFrame(readOutWorkerStatuses)
	})
}

const darkenRGBARandomlyByChannel = (colour, maxAmount=32) =>
	colour - (0
		| (colour >> 24 & 0xFF > maxAmount && (Math.random()*maxAmount << 24))
		| (colour >> 16 & 0xFF > maxAmount && (Math.random()*maxAmount << 16))
		| (colour >>  8 & 0xFF > maxAmount && (Math.random()*maxAmount <<  8))
	)
const darkenABGRRandomlyByChannel = (colour, maxAmount=32) =>
	colour - (0
		| (colour >> 16 & 0xFF > maxAmount && (Math.random()*maxAmount << 16))
		| (colour >>  8 & 0xFF > maxAmount && (Math.random()*maxAmount <<  8))
		| (colour >>  0 & 0xFF > maxAmount && (Math.random()*maxAmount <<  0))
	)

bindDisplayTo($("#stardust-game"), {
	play: simulate.play,
	step: simulate.tick,
	pause: simulate.pause,
	
	pick: (x,y) => {
		const [x1, y1] = world.simulationWindow
		const i = (y1 + y) * maxWorldSize.x + x1 + x
		return world.types[i]
	},
	dot:  (x,y, radius, type) => {
		createParticle(x, y, {
			__proto__: null, 
			type, 
			colour: type === 0 ? 0xFF000000 //AABBGGRR
				: type === 1 ? darkenABGRRandomlyByChannel(0xFF00FFFF)
				: type === 2 ? darkenABGRRandomlyByChannel(0XFF9AD1E8)
				: type === 3 ? darkenABGRRandomlyByChannel(0x44FFFFFF)
				: 0xFF0000FF, //"error red"
		})
	},
	line: (x1, y1, x2, y2, radius, type) => {
		//Draw a line.
		const canvas = new OffscreenCanvas(Math.abs(x1-x2)+radius*2+2, Math.abs(y1-y2)+radius*2+2)
		const ctx = canvas.getContext("2d", { alpha: false, willReadFrequently: true })
		ctx.strokeStyle = "red"
		ctx.lineCap = "round"
		ctx.lineWidth = radius
		ctx.moveTo(
			x1 < x2 ? radius+1 : (x1-x2) + radius+1,
			y1 < y2 ? radius+1 : (y1-y2) + radius+1)
		ctx.lineTo(
			x1 > x2 ? radius+1 : (x2-x1) + radius+1,
			y1 > y2 ? radius+1 : (y2-y1) + radius+1)
		ctx.stroke()
		const stroke = ctx.getImageData(0, 0, canvas.width, canvas.height)
		
		//console.log('line', {x1, y1, x2, y2, canvas, ctx, stroke, sw: world.simulationWindow})
		
		//Translate the line into pixels in our world.
		for (let y = 0; y < stroke.height; y++) {
			for (let x = 0; x < stroke.width; x++) {
				if (stroke.data[(y*stroke.width + x) * 4] > 127) {
					const tx = world.simulationWindow[0] + x1 + x - radius - 1
					const ty = world.simulationWindow[1] + y1 + y - radius - 1
					if (true
						&& tx >= world.simulationWindow[0] && tx < world.simulationWindow[2]
						&& ty >= world.simulationWindow[1] && ty < world.simulationWindow[3]
					) {
						createParticle(tx, ty, {
							__proto__: null, 
							type, 
							colour: type === 0 ? 0xFF000000 //AABBGGRR
								: type === 1 ? darkenABGRRandomlyByChannel(0xFF00FFFF)
								: type === 2 ? (Math.random() < 0.005 ? darkenABGRRandomlyByChannel(0XFF2F100A, 8) : darkenABGRRandomlyByChannel(0XFF9AD1E8, 16)) 
								: type === 3 ? darkenABGRRandomlyByChannel(0x44FFFFFF)
								: 0xFF0000FF, //"error red"
						})
					}
				}
			}
		}
	},
	rect: (x1, y1, x2, y2, radius, type) => {
		if (x1 > x2) [x2, x1] = [x1, x2]
		if (y1 > y2) [y2, y1] = [y1, y2]
		for (let x = x1; x < x2; x++) {
			for (let y = y1; y < y2; y++) {
				createParticle(x, y, {
					__proto__: null, 
					type, 
					colour: type === 0 ? 0xFF000000 //AABBGGRR
						: type === 1 ? darkenABGRRandomlyByChannel(0xFF00FFFF)
						: type === 2 ? darkenABGRRandomlyByChannel(0XFF9AD1E8)
						: type === 3 ? darkenABGRRandomlyByChannel(0x44FFFFFF)
						: 0xFF0000FF, //"error red"
				})
			}
		}
	},
})

function createParticle(x,y, options) {
	const [x1, y1, x2, y2] = world.simulationWindow
	const i = ((y1 + y) * (x2-x1)) + x1 + x
	
	//console.log('creating', x, y, options)
	
	if (Atomics.compareExchange(world.locks, i, 0, -1)) return
	
	world.types[i] = options.type ?? 1
	world.ticks[i] = world.globalTick % 256
	world.stages[i] = options.stage ?? 0
	world.colours[i] = options.colour ?? 0
	world.velocityXs[i] = options.velocityX ?? 0
	world.velocityYs[i] = options.velocityY ?? 0
	world.subpixelXs[i] = options.subpixelX ?? 0.5
	world.subpixelYs[i] = options.subpixelY ?? 0.5
	world.temperatures[i] = options.temperature ?? 24
	world.scratchA[i] = options.scratchA ?? BigInt(0)
	world.scratchB[i] = options.scratchB ?? BigInt(0)
	
	Atomics.store(world.locks, i, 0)
	
	//console.log('done')
}

function setParticle(x,y, options) {
	const [x1, y1, x2, y2] = world.simulationWindow
	const i = ((y1 + y) * (x2-x1)) + x1 + x
	
	//console.log('setting', x, y, options)
	
	if (Atomics.compareExchange(world.locks, i, 0, -1)) return
	
	if('types' in options) world.types[i] = options.types
	if('ticks' in options) world.ticks[i] = options.ticks
	if('stages' in options) world.stages[i] = options.stages
	if('colours' in options) world.colours[i] = options.colours
	if('velocityXs' in options) world.velocityXs[i] = options.velocityXs
	if('velocityYs' in options) world.velocityYs[i] = options.velocityYs
	if('subpixelXs' in options) world.subpixelXs[i] = options.subpixelXs
	if('subpixelYs' in options) world.subpixelYs[i] = options.subpixelYs
	if('temperatures' in options) world.temperatures[i] = options.temperatures
	if('scratchA' in options) world.scratchA[i] = options.scratchA
	if('scratchB' in options) world.scratchB[i] = options.scratchB
	
	Atomics.store(world.locks, i, 0)
	
	//console.log('done')
}

console.info('Main thread loaded.')
