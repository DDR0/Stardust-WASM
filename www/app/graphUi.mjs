import "../index.css"
import "../graphUi.css"

const $ = document.querySelector.bind(document)
const $$ = document.querySelectorAll.bind(document)



///////////////////////
//  Graph Rendering  //
///////////////////////

const updateNodeType = [
	(data, elem) => { //circle
		const circle = elem.querySelector('circle')
		circle.setAttribute('cx', data.x)
		circle.setAttribute('cy', data.y)
		const text = elem.querySelector('text')
		text.setAttribute('x', data.x)
		text.setAttribute('y', data.y)
		text.textContent = data.name
	},
	(data, elem) => { //box
		const rect = elem.querySelector('rect')
		rect.setAttribute('x', data.x)
		rect.setAttribute('y', data.y)
		const text = elem.querySelector('text')
		text.setAttribute('x', data.x)
		text.setAttribute('y', data.y)
		text.textContent = data.name
	},
	(data, elem) => { //lozenge
		const rect = elem.querySelector('rect')
		rect.setAttribute('x', data.x)
		rect.setAttribute('y', data.y)
		const text = elem.querySelector('text')
		text.setAttribute('x', data.x)
		text.setAttribute('y', data.y)
		text.textContent = data.name
	},
	(data, elem) => { //text
		const text = elem.querySelector('text')
		text.setAttribute('x', data.x)
		text.setAttribute('y', data.y)
		text.textContent = data.name
	},
]


const nodeShapeRadii = [ //circle, rectangle, lozenge, text
	18, 
	Math.sqrt(Math.pow(46/2,2) + Math.pow(23/2,2)),
	46/2,
	18
]


//Used below, values passed by reference. (aka pointer)
let graphData
let linkTemplates, nodeTemplates

export const link = newGraphData => {
	graphData = newGraphData
	linkTemplates = $$("#graph-link-templates > g")
	nodeTemplates = $$("#graph-node-templates > g")
	repaint()
	
	const svg = $('#graph > svg')
	svg.addEventListener('mousedown',  svgActivated)
	svg.addEventListener('mousemove',  svgMouseMove)
	svg.addEventListener('mouseup',    svgDeactivated)
	svg.addEventListener('mouseleave', svgDeactivated)
	svg.addEventListener('wheel',      svgWheel)
	svg.currentScale = 1.5
	
	TextMutationHandler.observe($('#input-data ol'), {
		subtree: true,
		childList: true,
		characterData: true,
	})
	
	rescanInput()
}

let paintPending = false
export const repaint = () => {
	if (paintPending) { return }
	paintPending = true
	requestAnimationFrame(render)
}

const linkStateCache = []
const nodeStateCache = []
const render = ()=>{
	paintPending = false
	const nodeCount = graphData.nodes.nodeCount[0]
	const linkCount = graphData.links.linkCount[0]
	let i;
	
	while ((i = linkStateCache.length) < linkCount) {
		const domNode = linkTemplates[0].cloneNode(true)
		$('#graph-layer-links').appendChild(domNode)
		linkStateCache.push({
			domNode,
			visible: -1,
			alive: -1,
		})
	}
	
	while ((i = nodeStateCache.length) < nodeCount) {
		const dummyNode = document.createElementNS("http://www.w3.org/2000/svg", "g");
		$('#graph-layer-nodes').appendChild(dummyNode)
		nodeStateCache.push({
			lastShape: -1,
			domNode: dummyNode, //placeholder, gets replaced during initial hydration
			visible: -1,
			alive: -1,
		})
	}
	
	for (i = 0; i < linkCount; i++) {
		const data = graphData.link(i)
		const cached = linkStateCache[i]
		const link = cached.domNode
		
		const alive = (data.lflags & 1)
		if (alive !== cached.alive) {
			cached.alive = alive
			link.setAttribute('visibility', alive?'visible':'hidden')
			cached.visible = alive
		}
		if (!alive) { continue } //We're dead, hidden, don't bother with any further updates.
		
		const visible = alive //TODO DDR 2020-11-23: Add view rect intersection.
		if (visible !== cached.visible) {
			link.setAttribute('visibility', alive?'visible':'hidden')
			cached.visible = visible
		}
		
		//Set line position.
		const LINE_GAP = 0
		const { x:nodesX, y:nodesY } = graphData.nodes
		const linkLenX = nodesX[data.from]-nodesX[data.to]
		const linkLenY = nodesY[data.from]-nodesY[data.to]
		const linkLen = Math.sqrt(Math.pow(linkLenX, 2) + Math.pow(linkLenY, 2)) || 0.01
		const llenFrom = nodeShapeRadii[graphData.nodes.flags[data.from]>>3&3]
		const llenTo   = nodeShapeRadii[graphData.nodes.flags[data.to  ]>>3&3]
		const pathd = `M${//SVG path - move to x/y, line to x/y.
			nodesX[data.from] - linkLenX/linkLen * (llenTo  +LINE_GAP)
		},${
			nodesY[data.from] - linkLenY/linkLen * (llenTo  +LINE_GAP)
		}L${
			nodesX[data.to  ] + linkLenX/linkLen * (llenFrom+LINE_GAP)
		},${
			nodesY[data.to  ] + linkLenY/linkLen * (llenFrom+LINE_GAP)
		}`
		const paths = link.querySelectorAll('path') //set path of background line + margin line
		paths[0].setAttribute('d', pathd)
		paths[1].setAttribute('d', pathd)
		
		//Set text position.
		const text = link.querySelector('text')
		text.setAttribute('x', (nodesX[data.from]+nodesX[data.to])/2)
		text.setAttribute('y', (nodesY[data.from]+nodesY[data.to])/2)
		text.textContent = data.label
	}
	
	for (i = 0; i < nodeCount; i++) {
		const data = graphData.node(i)
		const cached = nodeStateCache[i]
		
		const alive = (data.flags & 1)
		if (alive !== cached.alive) {
			cached.alive = alive
			cached.domNode.setAttribute('visibility', alive?'visible':'hidden')
			cached.visible = alive
		}
		if (!alive) { continue } //We're dead, hidden, don't bother with any further updates.
		
		const visible = alive //TODO DDR 2020-11-23: Add view rect intersection.
		if (visible !== cached.visible) {
			cached.domNode.setAttribute('visibility', alive?'visible':'hidden')
			cached.visible = visible
		}
		
		//If needed, transition shape.
		const shape = data.flags>>3&3
		if (shape !== cached.lastShape) {
			cached.lastShape = shape
			const newNode = nodeTemplates[shape].cloneNode(true)
			$('#graph-layer-nodes').replaceChild(newNode, cached.domNode)
			cached.domNode = newNode
			
			//Add event listeners to first child, the background of the node type, because it's the consistent thing for mouseup/mouseleave to report as their evt.target.
			newNode.addEventListener('mousedown',  nodeActivated.bind(0, i))
		}
		
		updateNodeType[shape](data, cached.domNode)
	}
}




/////////////////////////
//  Graph Interaction  //
/////////////////////////

//Previously in graph interaction, we had attached event handlers to the SVG
//elements themselves to handle dragging. However, this caused some issues
//with the mouse moving off the element when dragging, and thus stopping the
//drag. Instead, what we do now is register an active element, and if there is
//one drag that around instead of the canvas.

let activeObj = null // { node: <g>, nodeIndex: int, nodeShape: int } //node must be synced with nodeShape, so keep it all together

//Start dragging a node.
const nodeActivated = (nodeIndex, evt) => {
	evt.target.closest('svg').setAttribute('dragging', '') //Disable further mouse events on svg elements.
	graphData.nodes.flags[nodeIndex] |= 2 //Freeze the current object, so graph optimization doesn't move it around.
	activeObj = {
		node: evt.target.closest('.graph-node'), //Our target is the graph node *group*, but that can't be clicked on so we have to find it from its child.
		nodeIndex,
		nodeShape: graphData.nodes.flags[nodeIndex]>>3&3,
	}
}

//Start panning the camera.
const svgActivated = evt => {
	if (evt.target.tagName !== 'svg') { return }
	evt.target.setAttribute('dragging', '')
}

//Move something.
const svgMouseMove = evt => {
	if (!evt.target.hasAttribute('dragging')) { return }
	//Note: .movementX/Y is a CR as of 2020-11-27, but seems widely supported and is *just* the ticket here.
	if (activeObj) { //Move the active graph node.
		graphData.nodes.x[activeObj.nodeIndex] += evt.movementX / evt.target.currentScale / devicePixelRatio
		graphData.nodes.y[activeObj.nodeIndex] += evt.movementY / evt.target.currentScale / devicePixelRatio
		updateNodeType[activeObj.nodeShape](graphData.node(activeObj.nodeIndex), activeObj.node)
	} else { //Move the camera.
		const target = evt.target.closest('svg')
		target.currentTranslate.x += evt.movementX
		target.currentTranslate.y += evt.movementY
	}
	
}

//Stop dragging and release active node if any.
const svgDeactivated = evt => {
	//$('#graph > svg').removeAttribute('dragging')
	evt.target.removeAttribute('dragging')
	
	if (activeObj) {
		graphData.nodes.flags[activeObj.nodeIndex] &= ~2 //Clear object freeze.
		activeObj = null
	}
}

//svg.addEventListener('wheel', svgWheel)
const svgWheel = evt => {
	const target = evt.target.closest('svg')
	
	//First, calcualte the new scale we want.
	const deltaYInPx = evt.deltaY * Math.pow(evt.deltaMode+1, 5) //Convert page and line scroll modes into something ~appropriate. Hopefully. I have no idea how to test this.
	const scaleFactor = -deltaYInPx/800
	const scrollAmount = scaleFactor > 0 ? scaleFactor+1 : 1/(-scaleFactor+1)
	const oldScale = target.currentScale
	const newScale = oldScale * scrollAmount
	
	//Next, calculate the offset to keep the same point under the mousewheel.
	const cX = (-target.currentTranslate.x/devicePixelRatio + evt.offsetX) / oldScale
	const cY = (-target.currentTranslate.y/devicePixelRatio + evt.offsetY) / oldScale
	const nX = (-target.currentTranslate.x/devicePixelRatio + evt.offsetX) / newScale
	const nY = (-target.currentTranslate.y/devicePixelRatio + evt.offsetY) / newScale
	
	//Finally, apply the results of our calculations.
	target.currentScale = newScale
	target.currentTranslate.x += (nX-cX)*newScale*devicePixelRatio
	target.currentTranslate.y += (nY-cY)*newScale*devicePixelRatio
	
	//Also don't scroll.
	evt.preventDefault()
}




////////////////////////
//  Graph Text Input  //
////////////////////////

const TextMutationHandler = new MutationObserver((mutations/*, observer*/)=>{
	mutations.forEach(({type, target, addedNodes, removedNodes}) => {
		console.log('mutation', {type, target, addedNodes, removedNodes})
		
		//const baseOl = target.closest('ol.code')
		const baseLi = target.closest('ol.code > li')
		
		addedNodes.forEach(addedNode => {
			const base = addedNode.closest('li, ol')
			if (base === baseLi) { syncFromInputLine(baseLi) }
			if (base === baseOl) { throw new Error('Weird edit detected.') }
		})
		
		//baseLi instanceof HTMLLIElement //true
		removedNodes.forEach(removedNode => {
			if (removedNode !== baseLi) {
				if(baseLi) {
					syncFromInputLine(baseLi)
				} else {
					throw new Error('Weird deletion detected.')
				}
			} else {
				graphData.note /////////////////todo
			}
		})
	})
	
	graphData.removeUnreferencedElements()
})


//God bless https://www.debuggex.com/.
//OK, so this doesn't work I think because every time we match for
//parameters (ie, colour=green) we *don't* match the other parameters.
//Listing all the permutations would be a ridiculous fix. So, todo,
//break this out into loops and logic.
const sinAgainstAllProgrammingWhichParsesAnInputLineAndReportsErrors = 
	/^#(?<comment>.*)$|^(?<node1>(?:".+"|\\[\s=]|[^\s=])+)(?:(?:\s+shape=(?<shape>[^\s]+)|\s+colou?r=(?<nodeColour>[^\s]+)|\s+bold=(?<bold>[^\s]+)|\s+fixed=(?<fixed>[^\s]+)|\s+(?<imageURL>data:image\/[^\s]+))+|\s+(?<node2>(?:".+"|\\[\s=]|[^\s=])+)(?:\s+(?<linkWeight>\d*))?(?:\s+(?<linkName>(?:".+"|\\[\s|]|[^\s=])*))?(?:\s+colou?r=(?<linkColour>[^\s]*))?)?(?:\s*?(?<error>.*)?)$/u

const syncFromInputLine = entry => {
	//Annotate entry with the following data, for future use.
	//{
	//	index: The ID of the underlying graph data. Doesn't have anything to do with the line numbers.
	//	type: 'node', 'link', or 'comment'. (Note that links may summon the nodes they need to connect.)
	//	parsedData: null | { (note: all nullable, but node or to/from will be defined)
	//		node = str node name
	//		from = str node name
	//		to = str node name
	//		shape = int shape id (0 to 3)
	//		colour = str css colour
	//		bold = bool
	//		fixed = bool
	//		image = str [data] url
	//	}
	//	error: str, false if the line text has been successfully parsed into the parsedData structure. Note that parseData is cached.
	//	comment: str, for type=comment
	//}
	
	const data = {}
	const line = entryToText(entry).trim()
	if (!line) {
		data.type = 'comment'
		data.comment = ''
	} else {
		const components = sinAgainstAllProgrammingWhichParsesAnInputLineAndReportsErrors.exec(line)
		if (!components) {
			console.error(`Could not parse input line at all.\n${line}`)
			data.error = "Invalid syntax."
		} else {
			console.log(entry, line)
			console.log(components)
		}
	}
	
	//console.log({data})
}

const rescanInput = () =>
	$$('#input-data ol > li').forEach(syncFromInputLine)


const entryToText = node =>
	Array.from(node.childNodes).reduce((accum, node) => {
		switch (true) {
			case node instanceof Text: return accum + node.textContent
			case node instanceof HTMLImageElement: return `${accum} ${node.src} `
			case typeof node === 'string': return accum + node
			default: return accum + entryToText(node)
		}
	}, '')