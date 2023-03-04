addEventListener('message', ({data})=>console.info(`Worker Thread: ${data}.`))

worker.addEventListener('messageerror', e=>console.error(e)) //should log error in Chrome