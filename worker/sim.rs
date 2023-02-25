#![no_main]
//#![wasm_import_memory] does not exist, so we can't use it here - maybe 

//use std::ptr;

#[no_mangle]
pub extern fn sum(x: i32, y: i32) -> i32 {
    x + y
}

#[no_mangle]
pub unsafe extern fn run(world: *mut i32) -> i32 {
        world.add(1).write(0xFF);
        //world.offset_from(ptr::null()) is always 0
        world.read_volatile()
}

