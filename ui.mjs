//Bind the UI to the world.
//The purpose of this module is to hide away as much of the complexity of the
//HTML binding work as possible. In turn, it tries to stay away from the
//complexity of mucking about in the world memory as it can.

//4k resolution, probably no sense reserving more memory than that especially given we expect to scale up our pixels.
export const maxScreenRes = Object.freeze({ x: 3840, y: 2160 })

//Mutable state.
let selectedTypeId = 0
let selectedTool = ""
let toolRadius = 10 //particles

//Needed for colour picker logic.
export const setSelectedTool = id => {
	selectedTypeId = id
	console.log('todo: update tool selection')
}

/// Bind HTML to underlying state.
export const bindWorldToDisplay = (world, lockWorldTo, display, tools) => {
	const $ = display.querySelector.bind(display)
	const $$ = display.querySelectorAll.bind(display)
	
	const mainCanvas = $('canvas.main')
	
	selectedTypeId = +$('.toolbox [name=type_id]:checked').value
	selectedTool = $('.toolbox [name=tool]:checked').value
	
	// Canvas resizing.
	new ResizeObserver(([{target: canvas}]) => {
		//There may be multiple in flight at once. We will want to only update when resizing stops, I think, or every few frames?
		lockWorldTo(()=>{
			//canvas.clientWidth = 3;
			//canvas.clientHeight = 4;
			console.log(`canvas resized to ${canvas.clientWidth}×${canvas.clientHeight} – TODO: copy pixel data here.`)
			
			world.simulationSize[0] = canvas.width  = Math.min(canvas.clientWidth, maxScreenRes.x);
			world.simulationSize[1] = canvas.height = Math.min(canvas.clientHeight, maxScreenRes.y);
		})
	}).observe(mainCanvas)
	
	
	// Toolbox logic.
	for (let input of $$('.toolbox [name=type_id]')) {
		input.addEventListener('change', evt => {
			selectedTypeId = +evt.target.value
			updateCursor()
			return evt.stopPropagation()
		})
	}
	
	for (let input of $$('.toolbox [name=tool]')) {
		input.addEventListener('change', evt => {
			selectedTool = evt.target.value
			updateCursor()
			return evt.stopPropagation()
		})
	}
	
	function updateCursor() {
		display.style.cursor = "default" //TODO: Make the cursor reflect the selection, using the url(...) syntax with canvas' toDataURL function.
	}
	updateCursor()
	
	//Wrap raw events, passing the most useful information to tools.
	{
		let startEvt //store starting event of drag
		
		const startToolAction = evt => {
			startEvt = evt
			
			const clientRect = evt.target.getClientRects()[0]
			const x1 = Math.round(evt.x - clientRect.x) 
			const y1 = Math.round(evt.y - clientRect.y)
			
			switch (selectedTool) {
				case "picker":
					tools.pick(x1, y2)
					break
				case "pencil":
					tools.dot(x1, y1, toolRadius, selectedTypeId)
					break
				case "eraser":
					tools.dot(x1, y1, toolRadius, 0)
					break
			}
		}
		
		const continuedToolAction = evt => {
			if (!evt.buttons) { return }
			
			const clientRect = evt.target.getClientRects()[0]
			const x1 = Math.round(evt.x - clientRect.x) 
			const y1 = Math.round(evt.y - clientRect.y)
			const x2 = x1 - evt.movementX;
			const y2 = y1 - evt.movementY;
			
			switch (selectedTool) {
				case "picker":
					tools.pick(x1, y2)
					break
				case "pencil":
					tools.line(x1, y1, x2, y2, toolRadius, selectedTypeId)
					break
				case "eraser":
					tools.line(x1, y1, x2, y2, toolRadius, 0)
					break
			}
		}
		
		const endToolAction = evt => {
			const clientRect = evt.target.getClientRects()[0]
			const x1 = Math.round(evt.x - clientRect.x) 
			const y1 = Math.round(evt.y - clientRect.y)
			const x2 = Math.round(startEvt.x - clientRect.x)
			const y2 = Math.round(startEvt.y - clientRect.y)
			
			switch (selectedTool) {
				case "rect":
					tools.rect(x1, y1, x2, y2)
					break
			}
		}
		
		mainCanvas.addEventListener('mousedown', startToolAction)
		mainCanvas.addEventListener('mousemove', continuedToolAction)
		mainCanvas.addEventListener('mouseup', endToolAction)
	}
}