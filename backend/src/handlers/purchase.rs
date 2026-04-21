use crate::domain::money::{bag_add, bag_sub, bag_total, is_valid_denomination, make_change, Bag};
use crate::error::{AppError, AppResult};
use crate::models::{CashSlot, PurchaseRequest, PurchaseResponse};
use crate::repositories::{cash as cash_repo, products as product_repo};
use crate::state::AppState;
use axum::extract::State;
use axum::Json;

fn is_concurrency_db_error(err: &sqlx::Error) -> bool {
    match err {
        sqlx::Error::Database(db) => {
            matches!(db.code().as_deref(), Some("40001" | "40P01" | "55P03"))
        }
        _ => false,
    }
}

fn map_purchase_db_error(err: sqlx::Error) -> AppError {
    if is_concurrency_db_error(&err) {
        AppError::Conflict(
            "purchase could not be completed due to concurrent update; please retry".into(),
        )
    } else {
        AppError::Database(err)
    }
}

pub async fn purchase(
    State(st): State<AppState>,
    Json(req): Json<PurchaseRequest>,
) -> AppResult<Json<PurchaseResponse>> {
    // Validate inserted cash and build a bag
    let mut inserted: Bag = Bag::new();
    for coin in &req.inserted {
        if !is_valid_denomination(coin.denomination) {
            return Err(AppError::BadRequest(format!(
                "invalid denomination: {}",
                coin.denomination
            )));
        }
        if coin.count <= 0 {
            return Err(AppError::BadRequest(
                "inserted count must be positive".into(),
            ));
        }
        *inserted.entry(coin.denomination).or_insert(0) += coin.count;
    }
    let paid = bag_total(&inserted);
    if paid == 0 {
        return Err(AppError::BadRequest("no money inserted".into()));
    }

    // All DB work in one transaction for atomicity.
    let mut tx = st.db.begin().await?;

    let product = product_repo::get(&mut *tx, req.product_id)
        .await?
        .ok_or_else(|| AppError::NotFound(format!("product {} not found", req.product_id)))?;

    if product.stock <= 0 {
        return Err(AppError::Conflict(format!(
            "'{}' is out of stock",
            product.name
        )));
    }
    if paid < product.price {
        return Err(AppError::BadRequest(format!(
            "insufficient funds: paid {paid}, price {}",
            product.price
        )));
    }

    let change_amount = paid - product.price;

    // Build the inventory AFTER inserted cash is accepted, so change can be drawn
    // from the newly inserted coins if needed.
    let mut effective_inv = cash_repo::load_bag(&mut *tx)
        .await
        .map_err(map_purchase_db_error)?;
    bag_add(&mut effective_inv, &inserted);

    let change_plan = make_change(change_amount, &effective_inv).ok_or_else(|| {
        AppError::Conflict(
            "cannot provide exact change — please try a different combination".into(),
        )
    })?;

    // Apply deltas: inventory += inserted, inventory -= change_plan
    for (&denom, &count) in &inserted {
        cash_repo::apply_delta(&mut tx, denom, count)
            .await
            .map_err(map_purchase_db_error)?;
    }
    for (&denom, &count) in &change_plan {
        cash_repo::apply_delta(&mut tx, denom, -count)
            .await
            .map_err(map_purchase_db_error)?;
    }
    let decremented = product_repo::decrement_stock(&mut *tx, product.id)
        .await
        .map_err(map_purchase_db_error)?;
    if !decremented {
        return Err(AppError::Conflict(format!(
            "'{}' is out of stock",
            product.name
        )));
    }

    sqlx::query(
        "INSERT INTO transactions (product_id, product_name, price, paid, change_amount)
         VALUES ($1, $2, $3, $4, $5)",
    )
    .bind(product.id)
    .bind(&product.name)
    .bind(product.price)
    .bind(paid)
    .bind(change_amount)
    .execute(&mut *tx)
    .await
    .map_err(map_purchase_db_error)?;

    tx.commit().await.map_err(map_purchase_db_error)?;

    // Sanity check change plan consistency (defensive; should never fail)
    let mut verify = effective_inv.clone();
    bag_sub(&mut verify, &change_plan);
    debug_assert!(verify.values().all(|&c| c >= 0));

    let change_slots: Vec<CashSlot> = change_plan
        .into_iter()
        .map(|(denomination, count)| CashSlot {
            denomination,
            count,
        })
        .collect();

    Ok(Json(PurchaseResponse {
        product_id: product.id,
        product_name: product.name,
        price: product.price,
        paid,
        change_amount,
        change: change_slots,
        remaining_stock: product.stock - 1,
    }))
}
