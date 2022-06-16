const ice = Object.freeze
export const pong = ice(val => {
	console.log('pong', val)
})