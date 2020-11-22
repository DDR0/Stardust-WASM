(async () => {
	const textBox = document.querySelector('#primeTextbox');
	const submitButton = document.querySelector('#submitButton');
	const answerBox = document.querySelector('#answer');
	
	const graphData = (await import('./graphData.mjs')).graphData
	
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
	
	
	const worker = new Worker('./worker.js');
	worker.addEventListener('message', ev => {
	  const message = ev.data;
	  if (message.allGood) {
	    answerBox.textContent = message.hello
	  } else {
	    answerBox.textContent = "Something went wrong! " + message.error
	  }
	});

	submitButton.addEventListener('click', () => worker.postMessage(textBox.value));
})()