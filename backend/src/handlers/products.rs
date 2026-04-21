use crate::error::{AppError, AppResult};
use crate::models::{PatchProduct, Product, UpsertProduct};
use crate::repositories::products as repo;
use crate::state::AppState;
use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::Json;
use url::Url;

pub async fn list(State(st): State<AppState>) -> AppResult<Json<Vec<Product>>> {
    Ok(Json(repo::list(&st.db).await?))
}

pub async fn get(State(st): State<AppState>, Path(id): Path<i32>) -> AppResult<Json<Product>> {
    repo::get(&st.db, id)
        .await?
        .map(Json)
        .ok_or_else(|| AppError::NotFound(format!("product {id} not found")))
}

pub async fn create(
    State(st): State<AppState>,
    Json(input): Json<UpsertProduct>,
) -> AppResult<(StatusCode, Json<Product>)> {
    validate(&input)?;
    let created = repo::create(&st.db, &input).await.map_err(|e| match e {
        sqlx::Error::Database(db) if db.is_unique_violation() => {
            AppError::Conflict(format!("product '{}' already exists", input.name))
        }
        other => AppError::Database(other),
    })?;
    Ok((StatusCode::CREATED, Json(created)))
}

pub async fn update(
    State(st): State<AppState>,
    Path(id): Path<i32>,
    Json(input): Json<PatchProduct>,
) -> AppResult<Json<Product>> {
    validate_patch(&input)?;
    repo::update(&st.db, id, &input)
        .await?
        .map(Json)
        .ok_or_else(|| AppError::NotFound(format!("product {id} not found")))
}

pub async fn delete(State(st): State<AppState>, Path(id): Path<i32>) -> AppResult<StatusCode> {
    let deleted = repo::delete(&st.db, id).await?;
    if deleted {
        Ok(StatusCode::NO_CONTENT)
    } else {
        Err(AppError::NotFound(format!("product {id} not found")))
    }
}

fn validate(p: &UpsertProduct) -> AppResult<()> {
    if p.name.trim().is_empty() {
        return Err(AppError::BadRequest("name is required".into()));
    }
    if p.price <= 0 {
        return Err(AppError::BadRequest("price must be > 0".into()));
    }
    if p.stock < 0 {
        return Err(AppError::BadRequest("stock must be >= 0".into()));
    }
    validate_image_url(&p.image_url)?;
    Ok(())
}

fn validate_patch(p: &PatchProduct) -> AppResult<()> {
    if let Some(price) = p.price {
        if price <= 0 {
            return Err(AppError::BadRequest("price must be > 0".into()));
        }
    }
    if let Some(stock) = p.stock {
        if stock < 0 {
            return Err(AppError::BadRequest("stock must be >= 0".into()));
        }
    }
    if let Some(image_url) = &p.image_url {
        validate_image_url(image_url)?;
    }
    Ok(())
}

fn validate_image_url(raw: &str) -> AppResult<()> {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return Ok(());
    }

    let parsed = Url::parse(trimmed)
        .map_err(|_| AppError::BadRequest("imageUrl must be a valid URL".into()))?;

    if parsed.scheme() != "http" && parsed.scheme() != "https" {
        return Err(AppError::BadRequest(
            "imageUrl must start with http:// or https://".into(),
        ));
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::{validate, validate_patch};
    use crate::models::{PatchProduct, UpsertProduct};

    #[test]
    fn create_allows_empty_image_url() {
        let payload = UpsertProduct {
            name: "Coke".into(),
            price: 25,
            stock: 5,
            image_url: "".into(),
        };

        assert!(validate(&payload).is_ok());
    }

    #[test]
    fn create_rejects_invalid_image_url() {
        let payload = UpsertProduct {
            name: "Coke".into(),
            price: 25,
            stock: 5,
            image_url: "not-a-url".into(),
        };

        assert!(validate(&payload).is_err());
    }

    #[test]
    fn patch_accepts_valid_image_url() {
        let payload = PatchProduct {
            name: None,
            price: None,
            stock: None,
            image_url: Some("https://example.com/coke.png".into()),
        };

        assert!(validate_patch(&payload).is_ok());
    }

    #[test]
    fn patch_rejects_non_http_url_scheme() {
        let payload = PatchProduct {
            name: None,
            price: None,
            stock: None,
            image_url: Some("ftp://example.com/coke.png".into()),
        };

        assert!(validate_patch(&payload).is_err());
    }
}
