use crate::handlers;
use crate::state::AppState;
use axum::routing::{get, post};
use axum::Router;
use tower_http::cors::{Any, CorsLayer};
use tower_http::trace::TraceLayer;

pub fn build(state: AppState) -> Router {
    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);

    Router::new()
        .route("/health", get(|| async { "ok" }))
        .route(
            "/api/products",
            get(handlers::products::list).post(handlers::products::create),
        )
        .route(
            "/api/products/:id",
            get(handlers::products::get)
                .patch(handlers::products::update)
                .delete(handlers::products::delete),
        )
        .route(
            "/api/cash",
            get(handlers::cash::list).put(handlers::cash::set),
        )
        .route("/api/purchase", post(handlers::purchase::purchase))
        .route("/api/transactions", get(handlers::transactions::list))
        .with_state(state)
        .layer(cors)
        .layer(TraceLayer::new_for_http())
}
