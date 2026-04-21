use std::collections::BTreeMap;
use vending_backend::domain::money::{bag_total, make_change};

fn bag(entries: &[(i32, i32)]) -> BTreeMap<i32, i32> {
    entries.iter().copied().collect()
}

#[test]
fn end_to_end_purchase_math() {
    let mut inv = bag(&[
        (1, 50),
        (5, 50),
        (10, 50),
        (20, 20),
        (50, 20),
        (100, 20),
        (500, 10),
        (1000, 10),
    ]);
    // customer inserts one 100 — effective inventory for change includes it
    *inv.entry(100).or_insert(0) += 1;

    let change = make_change(75, &inv).expect("must give change");
    assert_eq!(bag_total(&change), 75);
}

#[test]
fn exact_payment_returns_no_change() {
    let inv = bag(&[(20, 5)]);
    let plan = make_change(0, &inv).unwrap();
    assert!(plan.is_empty());
}

#[test]
fn insufficient_inventory_fails_gracefully() {
    // need 3 THB change but only 5s and 10s available
    let inv = bag(&[(5, 10), (10, 10)]);
    assert!(make_change(3, &inv).is_none());
}
