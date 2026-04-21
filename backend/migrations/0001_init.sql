CREATE TABLE IF NOT EXISTS products (
    id          SERIAL PRIMARY KEY,
    name        TEXT NOT NULL UNIQUE,
    price       INTEGER NOT NULL CHECK (price > 0),
    stock       INTEGER NOT NULL CHECK (stock >= 0),
    image_url   TEXT NOT NULL DEFAULT '',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS cash_inventory (
    denomination INTEGER PRIMARY KEY,
    count        INTEGER NOT NULL CHECK (count >= 0)
);

CREATE TABLE IF NOT EXISTS transactions (
    id            SERIAL PRIMARY KEY,
    product_id    INTEGER NOT NULL REFERENCES products(id),
    product_name  TEXT NOT NULL,
    price         INTEGER NOT NULL,
    paid          INTEGER NOT NULL,
    change_amount INTEGER NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO cash_inventory (denomination, count) VALUES
    (1, 50), (5, 50), (10, 50),
    (20, 20), (50, 20), (100, 20),
    (500, 10), (1000, 10)
ON CONFLICT DO NOTHING;

INSERT INTO products (name, price, stock, image_url) VALUES
    ('Coke',        25, 10, 'https://placehold.net/default.svg'),
    ('Pepsi',       20, 10, 'https://placehold.net/default.svg'),
    ('Water',       15, 15, 'https://placehold.net/default.svg'),
    ('Green Tea',   30, 8, 'https://placehold.net/default.svg'),
    ('Coffee',      45, 8, 'https://placehold.net/default.svg'),
    ('Chips',       35, 12, 'https://placehold.net/default.svg'),
    ('Orange Soda', 22, 10, 'https://placehold.net/default.svg'),
    ('Lemon Soda',  22, 10, 'https://placehold.net/default.svg'),
    ('Iced Tea',    28, 9,  'https://placehold.net/default.svg'),
    ('Milk Tea',    40, 7,  'https://placehold.net/default.svg'),
    ('Sparkling Water', 18, 14, 'https://placehold.net/default.svg'),
    ('Energy Drink', 55, 6, 'https://placehold.net/default.svg'),
    ('Chocolate Bar', 30, 11, 'https://placehold.net/default.svg'),
    ('Gummy Candy', 25, 13, 'https://placehold.net/default.svg'),
    ('Cookies',     32, 10, 'https://placehold.net/default.svg'),
    ('Crackers',    27, 12, 'https://placehold.net/default.svg'),
    ('Nuts Mix',    50, 9,  'https://placehold.net/default.svg'),
    ('Potato Sticks', 33, 12, 'https://placehold.net/default.svg'),
    ('Fruit Juice', 38, 9,  'https://placehold.net/default.svg'),
    ('Sports Drink', 42, 8, 'https://placehold.net/default.svg')
ON CONFLICT DO NOTHING;
