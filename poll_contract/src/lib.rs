#![cfg_attr(not(test), no_std)]

use soroban_sdk::{
    auth::{ContractContext, InvokerContractAuthEntry, SubContractInvocation},
    contract, contractclient, contracterror, contractimpl, contracttype, panic_with_error,
    symbol_short, vec, Address, Env, IntoVal, String, Vec,
};

#[contractclient(name = "RewardTokenClient")]
pub trait RewardTokenContract {
    fn mint(env: Env, to: Address, amount: i128);
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Poll {
    pub id: u32,
    pub question: String,
    pub options: Vec<String>,
    pub votes: Vec<u32>,
    pub created_at: u64,
    pub expires_at: u64,
    pub creator: Address,
    pub active: bool,
}

#[contracttype]
pub enum DataKey {
    Poll(u32),
    PollCount,
    UserVote(u32, Address),
    Admin,
    RewardToken,
    RewardAmount,
}

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum PollError {
    InvalidQuestion = 1,
    NotEnoughOptions = 2,
    InvalidOption = 3,
    InvalidDuration = 4,
    PollNotFound = 5,
    PollExpired = 6,
    PollInactive = 7,
    InvalidOptionIndex = 8,
    AlreadyVoted = 9,
    NotCreator = 10,
    Unauthorized = 11,
    InvalidRewardAmount = 12,
}

#[contract]
pub struct PollContract;

fn poll_or_error(env: &Env, poll_id: u32) -> Poll {
    env.storage()
        .persistent()
        .get(&DataKey::Poll(poll_id))
        .unwrap_or_else(|| panic_with_error!(env, PollError::PollNotFound))
}

fn validate_poll_input(env: &Env, question: &String, options: &Vec<String>, duration_minutes: u64) {
    if question.len() == 0 {
        panic_with_error!(env, PollError::InvalidQuestion);
    }

    if options.len() < 2 {
        panic_with_error!(env, PollError::NotEnoughOptions);
    }

    for option in options.iter() {
        if option.len() == 0 {
            panic_with_error!(env, PollError::InvalidOption);
        }
    }

    if duration_minutes == 0 {
        panic_with_error!(env, PollError::InvalidDuration);
    }
}

fn read_admin(env: &Env) -> Option<Address> {
    env.storage().persistent().get(&DataKey::Admin)
}

fn require_admin(env: &Env, caller: &Address) {
    match read_admin(env) {
        Some(admin) => {
            if admin != caller.clone() {
                panic_with_error!(env, PollError::Unauthorized);
            }
        }
        None => {
            env.storage().persistent().set(&DataKey::Admin, caller);
        }
    }
}

#[contractimpl]
impl PollContract {
    /// Configure vote rewards by setting a token contract and mint amount.
    ///
    /// - First call sets the `Admin` to the provided `caller`.
    /// - Subsequent calls require the stored `Admin` to authorize the update.
    pub fn configure_rewards(env: Env, caller: Address, token: Address, amount: i128) {
        caller.require_auth();
        require_admin(&env, &caller);

        if amount < 0 {
            panic_with_error!(&env, PollError::InvalidRewardAmount);
        }

        if amount == 0 {
            env.storage().persistent().remove(&DataKey::RewardToken);
            env.storage().persistent().remove(&DataKey::RewardAmount);
            env.events()
                .publish((symbol_short!("poll"), symbol_short!("rewards"), symbol_short!("off")), caller);
            return;
        }

        env.storage().persistent().set(&DataKey::RewardToken, &token);
        env.storage().persistent().set(&DataKey::RewardAmount, &amount);
        env.events().publish(
            (symbol_short!("poll"), symbol_short!("rewards"), symbol_short!("on")),
            (token, amount, caller),
        );
    }

    pub fn get_reward_config(env: Env) -> (bool, i128, Address) {
        let amount: i128 = env.storage().persistent().get(&DataKey::RewardAmount).unwrap_or(0i128);
        let token: Option<Address> = env.storage().persistent().get(&DataKey::RewardToken);
        match token {
            Some(token) if amount > 0 => (true, amount, token),
            _ => (false, 0i128, env.current_contract_address()),
        }
    }

    pub fn create_poll(
        env: Env,
        creator: Address,
        question: String,
        options: Vec<String>,
        duration_minutes: u64,
    ) -> u32 {
        creator.require_auth();
        validate_poll_input(&env, &question, &options, duration_minutes);

        let count: u32 = env.storage().persistent().get(&DataKey::PollCount).unwrap_or(0);
        let new_id = count + 1;

        let mut votes = Vec::new(&env);
        for _ in 0..options.len() {
            votes.push_back(0u32);
        }

        let now = env.ledger().timestamp();
        let poll = Poll {
            id: new_id,
            question,
            options,
            votes,
            created_at: now,
            expires_at: now + (duration_minutes * 60),
            creator: creator.clone(),
            active: true,
        };

        env.storage().persistent().set(&DataKey::Poll(new_id), &poll);
        env.storage().persistent().set(&DataKey::PollCount, &new_id);
        env.events()
            .publish((symbol_short!("poll"), symbol_short!("create"), new_id), creator);

        new_id
    }

    pub fn vote(env: Env, voter: Address, poll_id: u32, option_index: u32) {
        voter.require_auth();

        let mut poll = poll_or_error(&env, poll_id);
        let now = env.ledger().timestamp();

        if now > poll.expires_at {
            panic_with_error!(&env, PollError::PollExpired);
        }

        if !poll.active {
            panic_with_error!(&env, PollError::PollInactive);
        }

        if option_index >= poll.options.len() {
            panic_with_error!(&env, PollError::InvalidOptionIndex);
        }

        let user_vote_key = DataKey::UserVote(poll_id, voter.clone());
        if env.storage().persistent().has(&user_vote_key) {
            panic_with_error!(&env, PollError::AlreadyVoted);
        }

        let current_votes = poll.votes.get(option_index).unwrap_or(0);
        poll.votes.set(option_index, current_votes + 1);

        env.storage().persistent().set(&DataKey::Poll(poll_id), &poll);
        env.storage().persistent().set(&user_vote_key, &true);
        env.events().publish(
            (symbol_short!("poll"), symbol_short!("vote"), poll_id, voter.clone()),
            option_index,
        );

        let amount: i128 = env.storage().persistent().get(&DataKey::RewardAmount).unwrap_or(0i128);
        if amount > 0 {
            if let Some(token) = env.storage().persistent().get::<_, Address>(&DataKey::RewardToken) {
                env.authorize_as_current_contract(vec![
                    &env,
                    InvokerContractAuthEntry::Contract(SubContractInvocation {
                        context: ContractContext {
                            contract: token.clone(),
                            fn_name: symbol_short!("mint"),
                            args: vec![&env, voter.clone().into_val(&env), amount.into_val(&env)],
                        },
                        sub_invocations: vec![&env],
                    }),
                ]);
                RewardTokenClient::new(&env, &token).mint(&voter, &amount);
                env.events().publish(
                    (symbol_short!("poll"), symbol_short!("reward"), poll_id),
                    (token, voter, amount),
                );
            }
        }
    }

    pub fn get_poll(env: Env, poll_id: u32) -> Poll {
        poll_or_error(&env, poll_id)
    }

    pub fn get_polls(env: Env) -> Vec<Poll> {
        let count: u32 = env.storage().persistent().get(&DataKey::PollCount).unwrap_or(0);
        let mut polls = Vec::new(&env);

        for i in 1..=count {
            if let Some(poll) = env.storage().persistent().get(&DataKey::Poll(i)) {
                polls.push_back(poll);
            }
        }

        polls
    }

    pub fn get_active_polls(env: Env) -> Vec<Poll> {
        let all = Self::get_polls(env.clone());
        let now = env.ledger().timestamp();
        let mut active = Vec::new(&env);

        for poll in all.iter() {
            if poll.expires_at > now && poll.active {
                active.push_back(poll);
            }
        }

        active
    }

    pub fn get_expired_polls(env: Env) -> Vec<Poll> {
        let all = Self::get_polls(env.clone());
        let now = env.ledger().timestamp();
        let mut expired = Vec::new(&env);

        for poll in all.iter() {
            if poll.expires_at <= now || !poll.active {
                expired.push_back(poll);
            }
        }

        expired
    }

    pub fn get_poll_count(env: Env) -> u32 {
        env.storage().persistent().get(&DataKey::PollCount).unwrap_or(0)
    }

    pub fn has_voted(env: Env, poll_id: u32, voter: Address) -> bool {
        env.storage().persistent().has(&DataKey::UserVote(poll_id, voter))
    }

    pub fn has_voted_many(env: Env, poll_ids: Vec<u32>, voter: Address) -> Vec<bool> {
        let mut results = Vec::new(&env);

        for poll_id in poll_ids.iter() {
            results.push_back(env.storage().persistent().has(&DataKey::UserVote(poll_id, voter.clone())));
        }

        results
    }

    pub fn close_poll(env: Env, poll_id: u32, caller: Address) {
        caller.require_auth();

        let mut poll = poll_or_error(&env, poll_id);
        if poll.creator != caller.clone() {
            panic_with_error!(&env, PollError::NotCreator);
        }

        poll.active = false;
        env.storage().persistent().set(&DataKey::Poll(poll_id), &poll);
        env.events()
            .publish((symbol_short!("poll"), symbol_short!("close"), poll_id), caller);
    }

    pub fn delete_poll(env: Env, poll_id: u32, caller: Address) {
        caller.require_auth();

        let poll = poll_or_error(&env, poll_id);
        if poll.creator != caller.clone() {
            panic_with_error!(&env, PollError::NotCreator);
        }

        env.storage().persistent().remove(&DataKey::Poll(poll_id));
        env.events()
            .publish((symbol_short!("poll"), symbol_short!("delete"), poll_id), caller);
    }
}

#[cfg(test)]
mod test {
    use super::*;
    use soroban_sdk::testutils::Address as _;

    #[contract]
    struct MockTokenContract;

    #[contracttype]
    enum MockTokenKey {
        Balance(Address),
    }

    fn read_mock_balance(env: &Env, id: &Address) -> i128 {
        env.storage()
            .persistent()
            .get(&MockTokenKey::Balance(id.clone()))
            .unwrap_or(0i128)
    }

    fn write_mock_balance(env: &Env, id: &Address, amount: i128) {
        env.storage()
            .persistent()
            .set(&MockTokenKey::Balance(id.clone()), &amount);
    }

    #[contractimpl]
    impl MockTokenContract {
        pub fn mint(env: Env, to: Address, amount: i128) {
            let balance = read_mock_balance(&env, &to);
            write_mock_balance(&env, &to, balance + amount);
        }

        pub fn balance(env: Env, id: Address) -> i128 {
            read_mock_balance(&env, &id)
        }
    }

    #[test]
    fn vote_mints_reward_tokens_when_configured() {
        let env = Env::default();
        env.mock_all_auths();

        let poll_contract_id = env.register(PollContract, ());
        let poll_client = PollContractClient::new(&env, &poll_contract_id);

        let token_contract_id = env.register(MockTokenContract, ());
        let token_client = MockTokenContractClient::new(&env, &token_contract_id);

        let admin = Address::generate(&env);
        poll_client.configure_rewards(&admin, &token_contract_id, &10i128);

        let creator = Address::generate(&env);
        let voter = Address::generate(&env);

        let poll_id = poll_client.create_poll(
            &creator,
            &String::from_str(&env, "Pick a roadmap item"),
            &Vec::from_array(
                &env,
                [
                    String::from_str(&env, "Mobile"),
                    String::from_str(&env, "Analytics"),
                ],
            ),
            &15u64,
        );

        poll_client.vote(&voter, &poll_id, &0u32);
        assert_eq!(token_client.balance(&voter), 10i128);
    }

    #[test]
    fn has_voted_many_returns_vote_flags() {
        let env = Env::default();
        env.mock_all_auths();

        let poll_contract_id = env.register(PollContract, ());
        let poll_client = PollContractClient::new(&env, &poll_contract_id);

        let creator = Address::generate(&env);
        let voter = Address::generate(&env);

        let poll_1 = poll_client.create_poll(
            &creator,
            &String::from_str(&env, "Pick a roadmap item"),
            &Vec::from_array(
                &env,
                [
                    String::from_str(&env, "Mobile"),
                    String::from_str(&env, "Analytics"),
                ],
            ),
            &15u64,
        );

        let poll_2 = poll_client.create_poll(
            &creator,
            &String::from_str(&env, "Pick a color"),
            &Vec::from_array(
                &env,
                [
                    String::from_str(&env, "Green"),
                    String::from_str(&env, "Orange"),
                ],
            ),
            &15u64,
        );

        poll_client.vote(&voter, &poll_1, &0u32);

        let ids = Vec::from_array(&env, [poll_1, poll_2]);
        let flags = poll_client.has_voted_many(&ids, &voter);

        assert_eq!(flags.len(), 2);
        assert_eq!(flags.get(0).unwrap(), true);
        assert_eq!(flags.get(1).unwrap(), false);
    }
}

