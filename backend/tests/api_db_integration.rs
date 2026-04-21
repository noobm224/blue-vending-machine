use axum::body::{to_bytes, Body};
use axum::http::{Method, Request, StatusCode};
use serde_json::{json, Value};
use sqlx::postgres::PgPoolOptions;
use sqlx::{PgPool, Row};
use std::sync::OnceLock;
use tokio::sync::Mutex;
use tower::util::ServiceExt;
use vending_backend::{router, state::AppState};

fn db_test_lock() -> &'static Mutex<()> {
    static LOCK: OnceLock<Mutex<()>> = OnceLock::new();
    LOCK.get_or_init(|| Mutex::new(()))
}

fn app(pool: PgPool) -> axum::Router {
    router::build(AppState { db: pool })
}

fn test_database_url() -> String {
    std::env::var("TEST_DATABASE_URL")
        .or_else(|_| std::env::var("DATABASE_URL"))
        .expect("set TEST_DATABASE_URL (or DATABASE_URL) to run DB integration tests")
}

async fn pool() -> PgPool {
    let url = test_database_url();
    let pool = PgPoolOptions::new()
        .max_connections(5)
        .connect(&url)
        .await
        .expect("connect postgres");

    sqlx::migrate!("./migrations")
        .run(&pool)
        .await
        .expect("run migrations");

    pool
}

async fn reset_database(pool: &PgPool) {
    sqlx::query("TRUNCATE TABLE transactions RESTART IDENTITY")
        .execute(pool)
        .await
        .expect("truncate transactions");

    sqlx::query("TRUNCATE TABLE products RESTART IDENTITY CASCADE")
        .execute(pool)
        .await
        .expect("truncate products");

    sqlx::query("TRUNCATE TABLE cash_inventory")
        .execute(pool)
        .await
        .expect("truncate cash_inventory");

    sqlx::query(
        "INSERT INTO cash_inventory (denomination, count) VALUES
         ($1, $9), ($2, $10), ($3, $11), ($4, $12),
         ($5, $13), ($6, $14), ($7, $15), ($8, $16)",
    )
    .bind(1)
    .bind(5)
    .bind(10)
    .bind(20)
    .bind(50)
    .bind(100)
    .bind(500)
    .bind(1000)
    .bind(50)
    .bind(50)
    .bind(50)
    .bind(20)
    .bind(20)
    .bind(20)
    .bind(10)
    .bind(10)
    .execute(pool)
    .await
    .expect("seed cash_inventory");
}

fn json_request(method: Method, path: &str, body: Value) -> Request<Body> {
    Request::builder()
        .method(method)
        .uri(path)
        .header("content-type", "application/json")
        .body(Body::from(body.to_string()))
        .expect("valid request")
}

async fn response_json(resp: axum::response::Response) -> Value {
    let bytes = to_bytes(resp.into_body(), usize::MAX)
        .await
        .expect("read response body");
    serde_json::from_slice(&bytes).expect("json response")
}

async fn insert_product(pool: &PgPool, name: &str, price: i32, stock: i32) -> i32 {
    let row = sqlx::query(
        "INSERT INTO products (name, price, stock, image_url)
         VALUES ($1, $2, $3, $4)
         RETURNING id",
    )
    .bind(name)
    .bind(price)
    .bind(stock)
    .bind("https://example.com/default.png")
    .fetch_one(pool)
    .await
    .expect("insert product");
    row.get::<i32, _>("id")
}

#[tokio::test]
#[ignore = "requires TEST_DATABASE_URL and runs against a real Postgres"]
async fn products_crud_happy_path() {
    let _lock = db_test_lock().lock().await;
    let pool = pool().await;
    reset_database(&pool).await;

    let app = app(pool.clone());

    let create_resp = app
        .clone()
        .oneshot(json_request(
            Method::POST,
            "/api/products",
            json!({
                "name": "DB Test Cola",
                "price": 27,
                "stock": 4,
                "imageUrl": "https://example.com/cola.png"
            }),
        ))
        .await
        .expect("create response");
    assert_eq!(create_resp.status(), StatusCode::CREATED);

    let created = response_json(create_resp).await;
    let id = created["id"].as_i64().expect("product id as i64") as i32;
    assert_eq!(created["name"], "DB Test Cola");

    let list_resp = app
        .clone()
        .oneshot(
            Request::builder()
                .method(Method::GET)
                .uri("/api/products")
                .body(Body::empty())
                .expect("valid request"),
        )
        .await
        .expect("list response");
    assert_eq!(list_resp.status(), StatusCode::OK);
    let listed = response_json(list_resp).await;
    assert!(!listed.as_array().expect("products array").is_empty());

    let get_resp = app
        .clone()
        .oneshot(
            Request::builder()
                .method(Method::GET)
                .uri(format!("/api/products/{id}"))
                .body(Body::empty())
                .expect("valid request"),
        )
        .await
        .expect("get response");
    assert_eq!(get_resp.status(), StatusCode::OK);
    let fetched = response_json(get_resp).await;
    assert_eq!(fetched["name"], "DB Test Cola");

    let patch_resp = app
        .clone()
        .oneshot(json_request(
            Method::PATCH,
            &format!("/api/products/{id}"),
            json!({ "price": 30, "stock": 3 }),
        ))
        .await
        .expect("patch response");
    assert_eq!(patch_resp.status(), StatusCode::OK);
    let patched = response_json(patch_resp).await;
    assert_eq!(patched["price"], 30);
    assert_eq!(patched["stock"], 3);

    let delete_resp = app
        .clone()
        .oneshot(
            Request::builder()
                .method(Method::DELETE)
                .uri(format!("/api/products/{id}"))
                .body(Body::empty())
                .expect("valid request"),
        )
        .await
        .expect("delete response");
    assert_eq!(delete_resp.status(), StatusCode::NO_CONTENT);

    let get_after_delete_resp = app
        .clone()
        .oneshot(
            Request::builder()
                .method(Method::GET)
                .uri(format!("/api/products/{id}"))
                .body(Body::empty())
                .expect("valid request"),
        )
        .await
        .expect("get after delete response");
    assert_eq!(get_after_delete_resp.status(), StatusCode::NOT_FOUND);
}

#[tokio::test]
#[ignore = "requires TEST_DATABASE_URL and runs against a real Postgres"]
async fn cash_list_and_set_happy_path() {
    let _lock = db_test_lock().lock().await;
    let pool = pool().await;
    reset_database(&pool).await;

    let app = app(pool.clone());

    let list_before_resp = app
        .clone()
        .oneshot(
            Request::builder()
                .method(Method::GET)
                .uri("/api/cash")
                .body(Body::empty())
                .expect("valid request"),
        )
        .await
        .expect("list cash response");
    assert_eq!(list_before_resp.status(), StatusCode::OK);
    let list_before = response_json(list_before_resp).await;
    assert_eq!(list_before.as_array().expect("cash array").len(), 8);

    let set_resp = app
        .clone()
        .oneshot(json_request(
            Method::PUT,
            "/api/cash",
            json!({ "denomination": 10, "count": 77 }),
        ))
        .await
        .expect("set cash response");
    assert_eq!(set_resp.status(), StatusCode::OK);

    let updated_slot = response_json(set_resp).await;
    assert_eq!(updated_slot["denomination"], 10);
    assert_eq!(updated_slot["count"], 77);

    let row = sqlx::query("SELECT count FROM cash_inventory WHERE denomination = 10")
        .fetch_one(&pool)
        .await
        .expect("cash row exists");
    let count = row.get::<i32, _>("count");
    assert_eq!(count, 77);
}

#[tokio::test]
#[ignore = "requires TEST_DATABASE_URL and runs against a real Postgres"]
async fn purchase_happy_path_updates_stock_and_transactions() {
    let _lock = db_test_lock().lock().await;
    let pool = pool().await;
    reset_database(&pool).await;

    let product_id = insert_product(&pool, "DB Purchase Happy", 25, 2).await;
    let app = app(pool.clone());

    let purchase_resp = app
        .clone()
        .oneshot(json_request(
            Method::POST,
            "/api/purchase",
            json!({
                "product_id": product_id,
                "inserted": [{ "denomination": 100, "count": 1 }]
            }),
        ))
        .await
        .expect("purchase response");

    assert_eq!(purchase_resp.status(), StatusCode::OK);
    let body = response_json(purchase_resp).await;
    assert_eq!(body["product_id"], product_id);
    assert_eq!(body["price"], 25);
    assert_eq!(body["paid"], 100);
    assert_eq!(body["change_amount"], 75);
    assert_eq!(body["remaining_stock"], 1);

    let stock_row = sqlx::query("SELECT stock FROM products WHERE id = $1")
        .bind(product_id)
        .fetch_one(&pool)
        .await
        .expect("product row exists");
    let stock = stock_row.get::<i32, _>("stock");
    assert_eq!(stock, 1);

    let tx_row = sqlx::query("SELECT COUNT(*) AS c FROM transactions WHERE product_id = $1")
        .bind(product_id)
        .fetch_one(&pool)
        .await
        .expect("transactions count row");
    let tx_count = tx_row.get::<i64, _>("c");
    assert_eq!(tx_count, 1);
}

#[tokio::test]
#[ignore = "requires TEST_DATABASE_URL and runs against a real Postgres"]
async fn transactions_list_returns_paginated_logs() {
    let _lock = db_test_lock().lock().await;
    let pool = pool().await;
    reset_database(&pool).await;

    let product_id = insert_product(&pool, "DB Tx List", 25, 10).await;

    sqlx::query(
        "INSERT INTO transactions (product_id, product_name, price, paid, change_amount, created_at)
         VALUES
         ($1, $2, $3, $4, $5, NOW() - INTERVAL '3 minutes'),
         ($1, $2, $3, $6, $7, NOW() - INTERVAL '2 minutes'),
         ($1, $2, $3, $8, $9, NOW() - INTERVAL '1 minute')",
    )
    .bind(product_id)
    .bind("DB Tx List")
    .bind(25)
    .bind(25)
    .bind(0)
    .bind(50)
    .bind(25)
    .bind(100)
    .bind(75)
    .execute(&pool)
    .await
    .expect("seed transactions");

    let app = app(pool.clone());
    let resp = app
        .oneshot(
            Request::builder()
                .method(Method::GET)
                .uri("/api/transactions?page=1&page_size=2")
                .body(Body::empty())
                .expect("valid request"),
        )
        .await
        .expect("transactions response");

    assert_eq!(resp.status(), StatusCode::OK);
    let body = response_json(resp).await;

    assert_eq!(body["page"], 1);
    assert_eq!(body["page_size"], 2);
    assert_eq!(body["total_items"], 3);
    assert_eq!(body["total_pages"], 2);

    let items = body["items"].as_array().expect("items array");
    assert_eq!(items.len(), 2);
    assert_eq!(items[0]["paid"], 100);
    assert_eq!(items[1]["paid"], 50);
}

#[tokio::test]
#[ignore = "requires TEST_DATABASE_URL and runs against a real Postgres"]
async fn purchase_failure_rolls_back_stock_and_cash() {
    let _lock = db_test_lock().lock().await;
    let pool = pool().await;
    reset_database(&pool).await;

    // Make exact change impossible for 25 by allowing only 10-denomination cash.
    sqlx::query("UPDATE cash_inventory SET count = 0")
        .execute(&pool)
        .await
        .expect("zero all cash");
    sqlx::query("UPDATE cash_inventory SET count = 1 WHERE denomination = 10")
        .execute(&pool)
        .await
        .expect("set one 10");

    let product_id = insert_product(&pool, "DB Purchase Rollback", 25, 1).await;
    let app = app(pool.clone());

    let before_stock = sqlx::query("SELECT stock FROM products WHERE id = $1")
        .bind(product_id)
        .fetch_one(&pool)
        .await
        .expect("stock row before");
    let before_stock = before_stock.get::<i32, _>("stock");

    let before_50 = sqlx::query("SELECT count FROM cash_inventory WHERE denomination = 50")
        .fetch_one(&pool)
        .await
        .expect("50 row before");
    let before_50 = before_50.get::<i32, _>("count");

    let purchase_resp = app
        .clone()
        .oneshot(json_request(
            Method::POST,
            "/api/purchase",
            json!({
                "product_id": product_id,
                "inserted": [{ "denomination": 50, "count": 1 }]
            }),
        ))
        .await
        .expect("purchase response");

    assert_eq!(purchase_resp.status(), StatusCode::CONFLICT);
    let body = response_json(purchase_resp).await;
    assert_eq!(body["error"], "conflict");

    let after_stock = sqlx::query("SELECT stock FROM products WHERE id = $1")
        .bind(product_id)
        .fetch_one(&pool)
        .await
        .expect("stock row after");
    let after_stock = after_stock.get::<i32, _>("stock");
    assert_eq!(after_stock, before_stock);

    let after_50 = sqlx::query("SELECT count FROM cash_inventory WHERE denomination = 50")
        .fetch_one(&pool)
        .await
        .expect("50 row after");
    let after_50 = after_50.get::<i32, _>("count");
    assert_eq!(after_50, before_50);

    let tx_row = sqlx::query("SELECT COUNT(*) AS c FROM transactions WHERE product_id = $1")
        .bind(product_id)
        .fetch_one(&pool)
        .await
        .expect("transactions count row");
    let tx_count = tx_row.get::<i64, _>("c");
    assert_eq!(tx_count, 0);
}

#[tokio::test]
#[ignore = "requires TEST_DATABASE_URL and runs against a real Postgres"]
async fn concurrent_purchase_only_one_succeeds_on_last_stock() {
    let _lock = db_test_lock().lock().await;
    let pool = pool().await;
    reset_database(&pool).await;

    let product_id = insert_product(&pool, "DB Concurrent Purchase", 25, 1).await;
    let app = app(pool.clone());

    let req1 = json_request(
        Method::POST,
        "/api/purchase",
        json!({
            "product_id": product_id,
            "inserted": [{ "denomination": 100, "count": 1 }]
        }),
    );
    let req2 = json_request(
        Method::POST,
        "/api/purchase",
        json!({
            "product_id": product_id,
            "inserted": [{ "denomination": 100, "count": 1 }]
        }),
    );

    let (resp1, resp2) = tokio::join!(app.clone().oneshot(req1), app.clone().oneshot(req2));
    let resp1 = resp1.expect("first purchase response");
    let resp2 = resp2.expect("second purchase response");

    let status1 = resp1.status();
    let status2 = resp2.status();
    let success_count = [status1, status2]
        .iter()
        .filter(|&&status| status == StatusCode::OK)
        .count();
    assert_eq!(success_count, 1, "exactly one purchase must succeed");

    let failure_status = if status1 == StatusCode::OK {
        status2
    } else {
        status1
    };
    assert_eq!(
        failure_status,
        StatusCode::CONFLICT,
        "losing concurrent purchase should return conflict"
    );

    let stock_row = sqlx::query("SELECT stock FROM products WHERE id = $1")
        .bind(product_id)
        .fetch_one(&pool)
        .await
        .expect("stock row exists");
    let stock = stock_row.get::<i32, _>("stock");
    assert_eq!(stock, 0, "stock should be decremented exactly once");

    let tx_row = sqlx::query("SELECT COUNT(*) AS c FROM transactions WHERE product_id = $1")
        .bind(product_id)
        .fetch_one(&pool)
        .await
        .expect("transactions count row");
    let tx_count = tx_row.get::<i64, _>("c");
    assert_eq!(tx_count, 1, "only one transaction should be recorded");

    let hundred_row = sqlx::query("SELECT count FROM cash_inventory WHERE denomination = 100")
        .fetch_one(&pool)
        .await
        .expect("100 row exists");
    let hundred_count = hundred_row.get::<i32, _>("count");
    assert_eq!(
        hundred_count, 21,
        "cash inventory should include exactly one accepted 100 note"
    );
}

#[tokio::test]
#[ignore = "requires TEST_DATABASE_URL and runs against a real Postgres"]
async fn concurrent_purchase_both_succeed_when_stock_is_two() {
    let _lock = db_test_lock().lock().await;
    let pool = pool().await;
    reset_database(&pool).await;

    let product_id = insert_product(&pool, "DB Concurrent Purchase x2", 25, 2).await;
    let app = app(pool.clone());

    let req1 = json_request(
        Method::POST,
        "/api/purchase",
        json!({
            "product_id": product_id,
            "inserted": [{ "denomination": 100, "count": 1 }]
        }),
    );
    let req2 = json_request(
        Method::POST,
        "/api/purchase",
        json!({
            "product_id": product_id,
            "inserted": [{ "denomination": 100, "count": 1 }]
        }),
    );

    let (resp1, resp2) = tokio::join!(app.clone().oneshot(req1), app.clone().oneshot(req2));
    let resp1 = resp1.expect("first purchase response");
    let resp2 = resp2.expect("second purchase response");

    assert_eq!(resp1.status(), StatusCode::OK);
    assert_eq!(resp2.status(), StatusCode::OK);

    let stock_row = sqlx::query("SELECT stock FROM products WHERE id = $1")
        .bind(product_id)
        .fetch_one(&pool)
        .await
        .expect("stock row exists");
    let stock = stock_row.get::<i32, _>("stock");
    assert_eq!(stock, 0, "stock should be decremented twice");

    let tx_row = sqlx::query("SELECT COUNT(*) AS c FROM transactions WHERE product_id = $1")
        .bind(product_id)
        .fetch_one(&pool)
        .await
        .expect("transactions count row");
    let tx_count = tx_row.get::<i64, _>("c");
    assert_eq!(tx_count, 2, "two successful purchases should be recorded");

    let hundred_row = sqlx::query("SELECT count FROM cash_inventory WHERE denomination = 100")
        .fetch_one(&pool)
        .await
        .expect("100 row exists");
    let hundred_count = hundred_row.get::<i32, _>("count");
    assert_eq!(
        hundred_count, 22,
        "cash inventory should include two accepted 100 notes"
    );
}
