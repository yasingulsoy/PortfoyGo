-- portfolio_items ve transactions tablolarına 'commodity' ve 'currency' asset_type ekle
ALTER TABLE portfolio_items DROP CONSTRAINT IF EXISTS portfolio_items_asset_type_check;
ALTER TABLE portfolio_items ADD CONSTRAINT portfolio_items_asset_type_check 
  CHECK (asset_type IN ('crypto', 'stock', 'commodity', 'currency'));

ALTER TABLE transactions DROP CONSTRAINT IF EXISTS transactions_asset_type_check;
ALTER TABLE transactions ADD CONSTRAINT transactions_asset_type_check 
  CHECK (asset_type IN ('crypto', 'stock', 'commodity', 'currency'));
