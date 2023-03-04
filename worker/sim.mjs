addEventListener('message', ({data})=>console.info(`Worker Thread: ${data}.`))
postMessage('loaded')