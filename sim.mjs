addEventListener('message', ({data})=>console.info(`Worker Thread: ${data}.`))

addEventListener('messageerror', e=>console.error(e)) //should log error in Chrome