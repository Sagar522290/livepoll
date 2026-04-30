#![cfg_attr(not(test), no_std)]

use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, panic_with_error, symbol_short, Address,
    Env, String,
};

#[contracttype]
pub enum DataKey {
    Admin,
    Name,
    Symbol,
    Decimals,
    TotalSupply,
    Balance(Address),
}

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum TokenError {
    AlreadyInitialized = 1,
    NotInitialized = 2,
    Unauthorized = 3,
    InvalidAmount = 4,
    InsufficientBalance = 5,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct TokenMetadata {
    pub name: String,
    pub symbol: String,
    pub decimals: u32,
}

#[contract]
pub struct RewardTokenContract;

fn require_initialized(env: &Env) {
    if !env.storage().persistent().has(&DataKey::Admin) {
        panic_with_error!(env, TokenError::NotInitialized);
    }
}

fn read_admin(env: &Env) -> Address {
    require_initialized(env);
    env.storage()
        .persistent()
        .get(&DataKey::Admin)
        .unwrap_or_else(|| panic_with_error!(env, TokenError::NotInitialized))
}

fn read_balance(env: &Env, id: &Address) -> i128 {
    env.storage()
        .persistent()
        .get(&DataKey::Balance(id.clone()))
        .unwrap_or(0i128)
}

fn write_balance(env: &Env, id: &Address, amount: i128) {
    env.storage()
        .persistent()
        .set(&DataKey::Balance(id.clone()), &amount);
}

fn read_total_supply(env: &Env) -> i128 {
    env.storage().persistent().get(&DataKey::TotalSupply).unwrap_or(0i128)
}

fn write_total_supply(env: &Env, amount: i128) {
    env.storage().persistent().set(&DataKey::TotalSupply, &amount);
}

#[contractimpl]
impl RewardTokenContract {
    pub fn initialize(env: Env, admin: Address, name: String, symbol: String, decimals: u32) {
        if env.storage().persistent().has(&DataKey::Admin) {
            panic_with_error!(&env, TokenError::AlreadyInitialized);
        }

        env.storage().persistent().set(&DataKey::Admin, &admin);
        env.storage().persistent().set(&DataKey::Name, &name);
        env.storage().persistent().set(&DataKey::Symbol, &symbol);
        env.storage().persistent().set(&DataKey::Decimals, &decimals);
        env.storage().persistent().set(&DataKey::TotalSupply, &0i128);

        env.events().publish(
            (symbol_short!("token"), symbol_short!("init")),
            TokenMetadata { name, symbol, decimals },
        );
    }

    pub fn admin(env: Env) -> Address {
        read_admin(&env)
    }

    pub fn metadata(env: Env) -> TokenMetadata {
        require_initialized(&env);
        let name: String = env.storage().persistent().get(&DataKey::Name).unwrap();
        let symbol: String = env.storage().persistent().get(&DataKey::Symbol).unwrap();
        let decimals: u32 = env.storage().persistent().get(&DataKey::Decimals).unwrap();
        TokenMetadata { name, symbol, decimals }
    }

    pub fn total_supply(env: Env) -> i128 {
        require_initialized(&env);
        read_total_supply(&env)
    }

    pub fn balance(env: Env, id: Address) -> i128 {
        require_initialized(&env);
        read_balance(&env, &id)
    }

    /// Mint tokens. Restricted to the configured admin address (typically the poll contract).
    pub fn mint(env: Env, to: Address, amount: i128) {
        require_initialized(&env);

        if amount <= 0 {
            panic_with_error!(&env, TokenError::InvalidAmount);
        }

        let admin = read_admin(&env);
        admin.require_auth();

        let balance = read_balance(&env, &to);
        write_balance(&env, &to, balance + amount);

        let supply = read_total_supply(&env);
        write_total_supply(&env, supply + amount);

        env.events().publish(
            (symbol_short!("token"), symbol_short!("mint"), to.clone()),
            amount,
        );
    }

    pub fn transfer(env: Env, from: Address, to: Address, amount: i128) {
        require_initialized(&env);
        from.require_auth();

        if amount <= 0 {
            panic_with_error!(&env, TokenError::InvalidAmount);
        }

        let from_balance = read_balance(&env, &from);
        if from_balance < amount {
            panic_with_error!(&env, TokenError::InsufficientBalance);
        }

        write_balance(&env, &from, from_balance - amount);
        let to_balance = read_balance(&env, &to);
        write_balance(&env, &to, to_balance + amount);

        env.events().publish(
            (symbol_short!("token"), symbol_short!("transfer"), from, to),
            amount,
        );
    }
}
