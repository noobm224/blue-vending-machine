use crate::domain::money::Bag;
use crate::models::CashSlot;
use sqlx::{PgExecutor, PgPool};

pub async fn list(pool: &PgPool) -> sqlx::Result<Vec<CashSlot>> {
    sqlx::query_as::<_, CashSlot>(
        "SELECT denomination, count FROM cash_inventory ORDER BY denomination",
    )
    .fetch_all(pool)
    .await
}

pub async fn load_bag<'e, E: PgExecutor<'e>>(ex: E) -> sqlx::Result<Bag> {
    let rows = sqlx::query_as::<_, CashSlot>(
        "SELECT denomination, count FROM cash_inventory ORDER BY denomination",
    )
    .fetch_all(ex)
    .await?;
    Ok(rows
        .into_iter()
        .map(|s| (s.denomination, s.count))
        .collect())
}

pub async fn set_count(pool: &PgPool, denomination: i32, count: i32) -> sqlx::Result<CashSlot> {
    sqlx::query_as::<_, CashSlot>(
        "INSERT INTO cash_inventory (denomination, count) VALUES ($1, $2)
         ON CONFLICT (denomination) DO UPDATE SET count = EXCLUDED.count
         RETURNING denomination, count",
    )
    .bind(denomination)
    .bind(count)
    .fetch_one(pool)
    .await
}

pub async fn apply_delta(
    conn: &mut sqlx::PgConnection,
    denomination: i32,
    delta: i32,
) -> sqlx::Result<()> {
    // Use UPDATE, not UPSERT. The CHECK (count >= 0) constraint triggers on the
    // proposed INSERT before conflict resolution, causing -1 to fail.
    // Since rows are pre-seeded at migration, UPDATE always works.
    let res = sqlx::query("UPDATE cash_inventory SET count = count + $2 WHERE denomination = $1")
        .bind(denomination)
        .bind(delta)
        .execute(&mut *conn)
        .await?;
    if res.rows_affected() == 0 {
        sqlx::query("INSERT INTO cash_inventory (denomination, count) VALUES ($1, $2)")
            .bind(denomination)
            .bind(delta.max(0))
            .execute(&mut *conn)
            .await?;
    }
    Ok(())
}
