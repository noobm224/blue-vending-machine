use axum::body::{to_bytes, Body};
use axum::http::{Method, Request, StatusCode};
use serde_json::{json, Value};
use sqlx::postgres::PgPoolOptions;
use tower::util::ServiceExt;
use vending_backend::{router, state::AppState};

fn app() -> axum::Router {
    // Lazy pool lets us verify request validation/route behavior without a live DB.
    let pool = PgPoolOptions::new()
        .connect_lazy("postgres://vending:vending@localhost:5432/vending")
        .expect("valid lazy postgres url");
    router::build(AppState { db: pool })
}

async fn json_response(resp: axum::response::Response) -> Value {
    let bytes = to_bytes(resp.into_body(), usize::MAX)
        .await
        .expect("body bytes");
    serde_json::from_slice(&bytes).expect("json response")
}

fn json_request(method: Method, path: &str, body: Value) -> Request<Body> {
    Request::builder()
        .method(method)
        .uri(path)
        .header("content-type", "application/json")
        .body(Body::from(body.to_string()))
        .expect("valid request")
}

#[tokio::test]
async fn health_returns_ok() {
    let app = app();
    let resp = app
        .oneshot(
            Request::builder()
                .method(Method::GET)
                .uri("/health")
                .body(Body::empty())
                .expect("valid request"),
        )
        .await
        .expect("router response");

    assert_eq!(resp.status(), StatusCode::OK);
    let body = to_bytes(resp.into_body(), usize::MAX)
        .await
        .expect("body bytes");
    assert_eq!(&body[..], b"ok");
}

#[tokio::test]
async fn purchase_get_is_method_not_allowed() {
    let app = app();
    let resp = app
        .oneshot(
            Request::builder()
                .method(Method::GET)
                .uri("/api/purchase")
                .body(Body::empty())
                .expect("valid request"),
        )
        .await
        .expect("router response");

    assert_eq!(resp.status(), StatusCode::METHOD_NOT_ALLOWED);
}

#[tokio::test]
async fn create_product_rejects_empty_name() {
    let app = app();
    let req = json_request(
        Method::POST,
        "/api/products",
        json!({
            "name": "   ",
            "price": 25,
            "stock": 3,
            "imageUrl": "https://example.com/coke.png"
        }),
    );

    let resp = app.oneshot(req).await.expect("router response");
    assert_eq!(resp.status(), StatusCode::BAD_REQUEST);

    let body = json_response(resp).await;
    assert_eq!(body["error"], "bad_request");
    assert_eq!(body["message"], "name is required");
}

#[tokio::test]
async fn update_product_rejects_non_positive_price() {
    let app = app();
    let req = json_request(Method::PATCH, "/api/products/1", json!({ "price": 0 }));

    let resp = app.oneshot(req).await.expect("router response");
    assert_eq!(resp.status(), StatusCode::BAD_REQUEST);

    let body = json_response(resp).await;
    assert_eq!(body["error"], "bad_request");
    assert_eq!(body["message"], "price must be > 0");
}

#[tokio::test]
async fn cash_update_rejects_invalid_denomination() {
    let app = app();
    let req = json_request(
        Method::PUT,
        "/api/cash",
        json!({ "denomination": 2, "count": 10 }),
    );

    let resp = app.oneshot(req).await.expect("router response");
    assert_eq!(resp.status(), StatusCode::BAD_REQUEST);

    let body = json_response(resp).await;
    assert_eq!(body["error"], "bad_request");
    assert_eq!(body["message"], "invalid denomination: 2");
}

#[tokio::test]
async fn cash_update_rejects_negative_count() {
    let app = app();
    let req = json_request(
        Method::PUT,
        "/api/cash",
        json!({ "denomination": 10, "count": -1 }),
    );

    let resp = app.oneshot(req).await.expect("router response");
    assert_eq!(resp.status(), StatusCode::BAD_REQUEST);

    let body = json_response(resp).await;
    assert_eq!(body["error"], "bad_request");
    assert_eq!(body["message"], "count must be >= 0");
}

#[tokio::test]
async fn purchase_rejects_invalid_inserted_denomination() {
    let app = app();
    let req = json_request(
        Method::POST,
        "/api/purchase",
        json!({
            "product_id": 1,
            "inserted": [{ "denomination": 2, "count": 1 }]
        }),
    );

    let resp = app.oneshot(req).await.expect("router response");
    assert_eq!(resp.status(), StatusCode::BAD_REQUEST);

    let body = json_response(resp).await;
    assert_eq!(body["error"], "bad_request");
    assert_eq!(body["message"], "invalid denomination: 2");
}

#[tokio::test]
async fn purchase_rejects_non_positive_inserted_count() {
    let app = app();
    let req = json_request(
        Method::POST,
        "/api/purchase",
        json!({
            "product_id": 1,
            "inserted": [{ "denomination": 10, "count": 0 }]
        }),
    );

    let resp = app.oneshot(req).await.expect("router response");
    assert_eq!(resp.status(), StatusCode::BAD_REQUEST);

    let body = json_response(resp).await;
    assert_eq!(body["error"], "bad_request");
    assert_eq!(body["message"], "inserted count must be positive");
}

#[tokio::test]
async fn purchase_rejects_no_money_inserted() {
    let app = app();
    let req = json_request(
        Method::POST,
        "/api/purchase",
        json!({ "product_id": 1, "inserted": [] }),
    );

    let resp = app.oneshot(req).await.expect("router response");
    assert_eq!(resp.status(), StatusCode::BAD_REQUEST);

    let body = json_response(resp).await;
    assert_eq!(body["error"], "bad_request");
    assert_eq!(body["message"], "no money inserted");
}

#[tokio::test]
async fn transactions_rejects_non_positive_page() {
    let app = app();
    let resp = app
        .oneshot(
            Request::builder()
                .method(Method::GET)
                .uri("/api/transactions?page=0")
                .body(Body::empty())
                .expect("valid request"),
        )
        .await
        .expect("router response");

    assert_eq!(resp.status(), StatusCode::BAD_REQUEST);

    let body = json_response(resp).await;
    assert_eq!(body["error"], "bad_request");
    assert_eq!(body["message"], "page must be >= 1");
}

#[tokio::test]
async fn transactions_rejects_too_large_page_size() {
    let app = app();
    let resp = app
        .oneshot(
            Request::builder()
                .method(Method::GET)
                .uri("/api/transactions?page_size=500")
                .body(Body::empty())
                .expect("valid request"),
        )
        .await
        .expect("router response");

    assert_eq!(resp.status(), StatusCode::BAD_REQUEST);

    let body = json_response(resp).await;
    assert_eq!(body["error"], "bad_request");
    assert_eq!(body["message"], "page_size must be <= 100");
}
