//Patch around Webpack's HMR not handling that it's in a worker.
self.window = {
	location: {
		reload: postMessage.bind(self, { type:'reload' }),
	}
}