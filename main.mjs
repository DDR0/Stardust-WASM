const memory = new WebAssembly.Memory({ initial:5949, maximum:5949, shared:true })
console.info(`Main Thread: ${['memory', memory]}.`)
window.view = new Uint8Array(memory.buffer, 5, 5);

new Worker('worker/sim.mjs', {type:'module'})
	.addEventListener('message', ({target}) => {
		target.postMessage(['memory', memory]) //does not work in Chrome
		target.postMessage(['memory.buffer', memory.buffer]) //does work
	})