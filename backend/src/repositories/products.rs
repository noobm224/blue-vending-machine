use crate::models::{PatchProduct, Product, UpsertProduct};
use sqlx::{PgExecutor, PgPool};

pub async fn list(pool: &PgPool) -> sqlx::Result<Vec<Product>> {
    sqlx::query_as::<_, Product>(
        "SELECT id, name, price, stock, image_url, created_at, updated_at FROM products ORDER BY id",
    )
    .fetch_all(pool)
    .await
}

pub async fn get<'e, E: PgExecutor<'e>>(ex: E, id: i32) -> sqlx::Result<Option<Product>> {
    sqlx::query_as::<_, Product>(
        "SELECT id, name, price, stock, image_url, created_at, updated_at FROM products WHERE id = $1",
    )
    .bind(id)
    .fetch_optional(ex)
    .await
}

pub async fn create(pool: &PgPool, input: &UpsertProduct) -> sqlx::Result<Product> {
    sqlx::query_as::<_, Product>(
        "INSERT INTO products (name, price, stock, image_url) VALUES ($1, $2, $3, $4)
         RETURNING id, name, price, stock, image_url, created_at, updated_at",
    )
    .bind(&input.name)
    .bind(input.price)
    .bind(input.stock)
    .bind(&input.image_url)
    .fetch_one(pool)
    .await
}

pub async fn update(pool: &PgPool, id: i32, input: &PatchProduct) -> sqlx::Result<Option<Product>> {
    sqlx::query_as::<_, Product>(
        "UPDATE products SET
            name = COALESCE($2, name),
            price = COALESCE($3, price),
            stock = COALESCE($4, stock),
            image_url = COALESCE($5, image_url),
            updated_at = NOW()
         WHERE id = $1
         RETURNING id, name, price, stock, image_url, created_at, updated_at",
    )
    .bind(id)
    .bind(input.name.as_deref())
    .bind(input.price)
    .bind(input.stock)
    .bind(input.image_url.as_deref())
    .fetch_optional(pool)
    .await
}

pub async fn delete(pool: &PgPool, id: i32) -> sqlx::Result<bool> {
    let res = sqlx::query("DELETE FROM products WHERE id = $1")
        .bind(id)
        .execute(pool)
        .await?;
    Ok(res.rows_affected() > 0)
}

pub async fn decrement_stock<'e, E: PgExecutor<'e>>(ex: E, id: i32) -> sqlx::Result<bool> {
    let res = sqlx::query(
        "UPDATE products SET stock = stock - 1, updated_at = NOW() WHERE id = $1 AND stock > 0",
    )
    .bind(id)
    .execute(ex)
    .await?;
    Ok(res.rows_affected() > 0)
}
