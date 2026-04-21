use std::collections::BTreeMap;

pub const DENOMINATIONS: [i32; 8] = [1000, 500, 100, 50, 20, 10, 5, 1];

pub fn is_valid_denomination(d: i32) -> bool {
    DENOMINATIONS.contains(&d)
}

/// Denom counts
pub type Bag = BTreeMap<i32, i32>;

pub fn bag_total(bag: &Bag) -> i32 {
    bag.iter().map(|(d, c)| d * c).sum()
}

/// Update base by adding the add values directly
pub fn bag_add(base: &mut Bag, add: &Bag) {
    for (&d, &c) in add {
        *base.entry(d).or_insert(0) += c;
    }
}

/// Update base by subtracting the sub values directly
pub fn bag_sub(base: &mut Bag, sub: &Bag) {
    for (&d, &c) in sub {
        let entry = base.entry(d).or_insert(0);
        *entry -= c;
    }
}

/// Finds exact change for amount.
/// Returns Some(plan) or None if impossible.
///
/// Logic: Descending backtrack (max-first). Prefers fewest notes 
/// and handles inventory constraints where greedy logic fails.
pub fn make_change(amount: i32, inventory: &Bag) -> Option<Bag> {
    if amount < 0 {
        return None;
    }
    if amount == 0 {
        return Some(Bag::new());
    }
    let mut plan = Bag::new();
    if backtrack(amount, 0, inventory, &mut plan) {
        // strip zero-count entries for clean output
        plan.retain(|_, c| *c > 0);
        Some(plan)
    } else {
        None
    }
}

fn backtrack(remaining: i32, idx: usize, inv: &Bag, plan: &mut Bag) -> bool {
    if remaining == 0 {
        return true;
    }
    if idx >= DENOMINATIONS.len() {
        return false;
    }
    let denom = DENOMINATIONS[idx];
    let available = *inv.get(&denom).unwrap_or(&0);
    let max_take = std::cmp::min(available, remaining / denom);
    let mut take = max_take;
    while take >= 0 {
        plan.insert(denom, take);
        if backtrack(remaining - denom * take, idx + 1, inv, plan) {
            return true;
        }
        take -= 1;
    }
    plan.remove(&denom);
    false
}

#[cfg(test)]
mod tests {
    use super::*;

    fn bag(entries: &[(i32, i32)]) -> Bag {
        entries.iter().copied().collect()
    }

    #[test]
    fn valid_denominations() {
        for d in [1, 5, 10, 20, 50, 100, 500, 1000] {
            assert!(is_valid_denomination(d));
        }
        for d in [2, 3, 25, 200, 2000] {
            assert!(!is_valid_denomination(d));
        }
    }

    #[test]
    fn change_zero_returns_empty_plan() {
        let inv = bag(&[(1, 100)]);
        let plan = make_change(0, &inv).unwrap();
        assert!(plan.is_empty());
    }

    #[test]
    fn change_simple_greedy() {
        let inv = bag(&[(1, 10), (5, 10), (10, 10), (20, 10), (50, 10), (100, 10)]);
        let plan = make_change(75, &inv).unwrap();
        assert_eq!(bag_total(&plan), 75);
        // prefers fewest: 50 + 20 + 5
        assert_eq!(plan.get(&50).copied().unwrap_or(0), 1);
        assert_eq!(plan.get(&20).copied().unwrap_or(0), 1);
        assert_eq!(plan.get(&5).copied().unwrap_or(0), 1);
    }

    #[test]
    fn change_with_constrained_inventory() {
        // Need 30 with no 10s, no 20s — must use 5s and 1s
        let inv = bag(&[(1, 10), (5, 5), (10, 0), (20, 0)]);
        let plan = make_change(30, &inv).unwrap();
        assert_eq!(bag_total(&plan), 30);
    }

    #[test]
    fn change_impossible_returns_none() {
        // Need 3 but only have 5s
        let inv = bag(&[(5, 10)]);
        assert!(make_change(3, &inv).is_none());
    }

    #[test]
    fn change_impossible_exact_limit() {
        // Need 7 with 5s and 10s only — impossible
        let inv = bag(&[(5, 10), (10, 10)]);
        assert!(make_change(7, &inv).is_none());
    }

    #[test]
    fn change_large_amount() {
        let inv = bag(&[
            (1, 100),
            (5, 100),
            (10, 100),
            (20, 100),
            (50, 100),
            (100, 100),
            (500, 100),
            (1000, 100),
        ]);
        let plan = make_change(1337, &inv).unwrap();
        assert_eq!(bag_total(&plan), 1337);
    }

    #[test]
    fn change_prefers_big_notes_when_possible() {
        let inv = bag(&[(100, 5), (50, 5), (20, 5), (10, 5), (5, 5), (1, 20)]);
        let plan = make_change(100, &inv).unwrap();
        assert_eq!(plan.get(&100).copied().unwrap_or(0), 1);
    }

    #[test]
    fn change_falls_back_when_big_note_unavailable() {
        // Exactly 100, no 100-note available
        let inv = bag(&[(100, 0), (50, 2), (20, 0), (10, 0), (5, 0), (1, 0)]);
        let plan = make_change(100, &inv).unwrap();
        assert_eq!(plan.get(&50).copied().unwrap(), 2);
    }

    #[test]
    fn bag_add_and_sub_round_trip() {
        let mut a = bag(&[(10, 5), (20, 3)]);
        let b = bag(&[(10, 2), (50, 1)]);
        bag_add(&mut a, &b);
        assert_eq!(a.get(&10).copied().unwrap(), 7);
        assert_eq!(a.get(&50).copied().unwrap(), 1);
        bag_sub(&mut a, &b);
        assert_eq!(a.get(&10).copied().unwrap(), 5);
        assert_eq!(a.get(&50).copied().unwrap(), 0);
    }

    #[test]
    fn bag_total_sums_correctly() {
        let b = bag(&[(1, 3), (5, 2), (100, 1)]);
        assert_eq!(bag_total(&b), 3 + 10 + 100);
    }
}
