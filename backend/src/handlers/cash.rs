use crate::domain::money::is_valid_denomination;
use crate::error::{AppError, AppResult};
use crate::models::{CashSlot, CashUpdate};
use crate::repositories::cash as repo;
use crate::state::AppState;
use axum::extract::State;
use axum::Json;

pub async fn list(State(st): State<AppState>) -> AppResult<Json<Vec<CashSlot>>> {
    Ok(Json(repo::list(&st.db).await?))
}

pub async fn set(
    State(st): State<AppState>,
    Json(input): Json<CashUpdate>,
) -> AppResult<Json<CashSlot>> {
    if !is_valid_denomination(input.denomination) {
        return Err(AppError::BadRequest(format!(
            "invalid denomination: {}",
            input.denomination
        )));
    }
    if input.count < 0 {
        return Err(AppError::BadRequest("count must be >= 0".into()));
    }
    Ok(Json(
        repo::set_count(&st.db, input.denomination, input.count).await?,
    ))
}
