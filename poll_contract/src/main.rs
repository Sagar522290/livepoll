// fn main() {
//     println!("Hello, world!");
// }


#![no_std]
use soroban_sdk::{contract, contractimpl, Env};

#[contract]
pub struct Poll;

#[contractimpl]
impl Poll {
    pub fn get_results(env: Env) -> (u32, u32) {
        (10, 5) // temporary static data
    }
}