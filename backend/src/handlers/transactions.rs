use crate::error::{AppError, AppResult};
use crate::models::PaginatedTransactionLogs;
use crate::repositories::transactions as repo;
use crate::state::AppState;
use axum::extract::{Query, State};
use axum::Json;
use serde::Deserialize;

const DEFAULT_PAGE_SIZE: i64 = 10;
const MAX_PAGE_SIZE: i64 = 100;

#[derive(Debug, Deserialize)]
pub struct TransactionLogQuery {
    pub page: Option<i64>,
    pub page_size: Option<i64>,
}

pub async fn list(
    State(st): State<AppState>,
    Query(query): Query<TransactionLogQuery>,
) -> AppResult<Json<PaginatedTransactionLogs>> {
    let page = query.page.unwrap_or(1);
    let page_size = query.page_size.unwrap_or(DEFAULT_PAGE_SIZE);

    if page <= 0 {
        return Err(AppError::BadRequest("page must be >= 1".into()));
    }
    if page_size <= 0 {
        return Err(AppError::BadRequest("page_size must be >= 1".into()));
    }
    if page_size > MAX_PAGE_SIZE {
        return Err(AppError::BadRequest(format!(
            "page_size must be <= {MAX_PAGE_SIZE}",
        )));
    }

    let offset = (page - 1) * page_size;
    let (items, total_items) = repo::list_paginated(&st.db, page_size, offset).await?;
    let total_pages = if total_items == 0 {
        0
    } else {
        (total_items + page_size - 1) / page_size
    };

    Ok(Json(PaginatedTransactionLogs {
        items,
        page,
        page_size,
        total_items,
        total_pages,
    }))
}
