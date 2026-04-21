use crate::models::TransactionLog;
use sqlx::PgPool;

pub async fn list_paginated(
    pool: &PgPool,
    limit: i64,
    offset: i64,
) -> sqlx::Result<(Vec<TransactionLog>, i64)> {
    let items = sqlx::query_as::<_, TransactionLog>(
        "SELECT id, product_id, product_name, price, paid, change_amount, created_at
         FROM transactions
         ORDER BY created_at DESC, id DESC
         LIMIT $1 OFFSET $2",
    )
    .bind(limit)
    .bind(offset)
    .fetch_all(pool)
    .await?;

    let total_items: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM transactions")
        .fetch_one(pool)
        .await?;

    Ok((items, total_items))
}
