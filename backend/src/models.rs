use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct Product {
    pub id: i32,
    pub name: String,
    pub price: i32,
    pub stock: i32,
    #[serde(rename = "imageUrl")]
    pub image_url: String,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Deserialize)]
pub struct UpsertProduct {
    pub name: String,
    pub price: i32,
    pub stock: i32,
    #[serde(rename = "imageUrl", alias = "image_url")]
    pub image_url: String,
}

#[derive(Debug, Deserialize)]
pub struct PatchProduct {
    pub name: Option<String>,
    pub price: Option<i32>,
    pub stock: Option<i32>,
    #[serde(rename = "imageUrl", alias = "image_url")]
    pub image_url: Option<String>,
}

#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct CashSlot {
    pub denomination: i32,
    pub count: i32,
}

#[derive(Debug, Deserialize)]
pub struct CashUpdate {
    pub denomination: i32,
    pub count: i32,
}

#[derive(Debug, Deserialize)]
pub struct InsertedCoin {
    pub denomination: i32,
    pub count: i32,
}

#[derive(Debug, Deserialize)]
pub struct PurchaseRequest {
    pub product_id: i32,
    pub inserted: Vec<InsertedCoin>,
}

#[derive(Debug, Serialize)]
pub struct PurchaseResponse {
    pub product_id: i32,
    pub product_name: String,
    pub price: i32,
    pub paid: i32,
    pub change_amount: i32,
    pub change: Vec<CashSlot>,
    pub remaining_stock: i32,
}

#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct TransactionLog {
    pub id: i32,
    pub product_id: i32,
    pub product_name: String,
    pub price: i32,
    pub paid: i32,
    pub change_amount: i32,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Serialize)]
pub struct PaginatedTransactionLogs {
    pub items: Vec<TransactionLog>,
    pub page: i64,
    pub page_size: i64,
    pub total_items: i64,
    pub total_pages: i64,
}
