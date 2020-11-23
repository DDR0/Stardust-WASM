import { graphData } from './graphData.mjs'

(async () => {
	"use strict"
	const textBox = document.querySelector('#primeTextbox');
	const submitButton = document.querySelector('#submitButton');
	const answerBox = document.querySelector('#answer');
	
	
	const ids = [
		graphData.setNode({x:10, y:20, name:'node 1'}),
		graphData.setNode({x:30, y:40, name:'node 2'}),
		graphData.setNode({x:50, y:60, name:'node 3'}),
		graphData.setNode({x:70, y:80, name:'node 2'}),
		graphData.setNode({x:90, y:99, name:'node 4'}),
	]
	console.log({ids})
	
	const a = graphData.setLink(ids[0], ids[1], 'a')
	const b = graphData.setLink('node 1', 'node 4', 'b', 2)
	const c = graphData.setLink('node 2', 'node 4')
	graphData.removeLink(a)
	
	graphData.removeNode({name:'node 2'})
	graphData.removeNode({index:ids[2]})
	
	
	
	const callbacks = { ok: Object.create(null), err: Object.create(null) } //callbacks
	
	callbacks.ok.hello = data => { answerBox.textContent = data }
	callbacks.err.hello = msg => { answerBox.textContent = "Something went wrong! " + msg }
	
	const worker = new Worker('./worker.js');
	worker.addEventListener('message', ({'data': {type, data, error}}) => {
		if (error === undefined && data === undefined)
			return console.error(`malformed message '${type}', missing data or error`)
		if (error !== undefined && data !== undefined)
			return console.error(`malformed message '${type}', has both data and error`)
		
		const callback = callbacks[data?'ok':'err'][type]
		if (!callback) { return console.error(`unknown main event '${data?'ok':'err'}.${type}')`) }
		callback(...(data ?? [error]))
	});

	submitButton.addEventListener('click', () => 
		worker.postMessage({type:'hello', data:[textBox.value]}) );
	
	//worker.postMessage('useGraphData')
})()