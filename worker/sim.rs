#![no_main]

use std::ptr;

#[no_mangle]
pub extern fn sum(x: i32, y: i32) -> i32 {
    x + y
}

#[no_mangle]
pub extern fn run(_worker_id: i32, world: *mut i32) -> isize {
    unsafe {
        world.offset_from(ptr::null())
    }
}

