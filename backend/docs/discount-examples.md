Discount System - Quick Reference Examples
Authentication
bash
# Login to get token
curl -X POST http://localhost:8002/api/businesses/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "system@accounts.com",
    "password": "system123"
  }'

# Set token for subsequent requests
export TOKEN="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
1. Validate Promo Code
bash
curl -X POST http://localhost:8002/api/discounts/promotions/validate \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "promoCode": "TEST15",
    "amount": 500000,
    "customerId": "ac0d2540-2e6b-4efe-b890-72c013fdc597"
  }'
2. Create Promo Code
bash
curl -X POST http://localhost:8002/api/discounts/promotions \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "promoCode": "SUMMER25",
    "discountType": "PERCENTAGE",
    "discountValue": 25,
    "validFrom": "2026-06-01",
    "validTo": "2026-08-31",
    "minPurchase": 100000,
    "maxUses": 500,
    "description": "Summer sale 25% off"
  }'
3. Get Promo Stats
bash
curl -X GET "http://localhost:8002/api/discounts/promotions/ca96f9f9-ebad-4007-89f6-1a2439b5540b/stats" \
  -H "Authorization: Bearer $TOKEN"
4. Calculate Volume Discount
bash
curl -X POST http://localhost:8002/api/discounts/volume/calculate \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "items": [
      {
        "id": "d754bf00-76db-481b-af5e-b54d8009990b",
        "quantity": 10,
        "amount": 2500000
      }
    ]
  }'
5. Calculate Early Payment Discount
bash
curl -X POST http://localhost:8002/api/discounts/early-payment/calculate \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "invoiceId": "e6405126-ced5-4f39-b084-c96ee0e464de",
    "paymentDate": "2026-03-20"
  }'
6. Create Discount Allocation
bash
curl -X POST http://localhost:8002/api/discounts/allocations \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "discountRuleId": "bf00e448-646d-41a1-a3dd-eb83baefb593",
    "posTransactionId": "a613a467-3332-41ae-a794-ac3998671843",
    "totalDiscountAmount": 680800,
    "allocationMethod": "PRO_RATA_AMOUNT",
    "lines": [
      {
        "lineItemId": "2b935aa1-cd32-4ce4-ba38-9007bef4e20b",
        "lineType": "POS",
        "originalAmount": 2000000,
        "discountAmount": 680800
      }
    ]
  }'
7. Void Allocation
bash
curl -X POST http://localhost:8002/api/discounts/allocations/b264b394-b67e-4d72-91af-6c852e167fc8/void \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "reason": "Customer returned items"
  }'
8. Create POS Transaction with Discount
bash
curl -X POST http://localhost:8002/api/pos/transactions-with-discount \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "customer_id": "ac0d2540-2e6b-4efe-b890-72c013fdc597",
    "items": [
      {
        "product_id": "d754bf00-76db-481b-af5e-b54d8009990b",
        "item_name": "Office Chair",
        "item_type": "product",
        "quantity": 2,
        "unit_price": 250000,
        "tax_category_code": "STANDARD_GOODS"
      }
    ],
    "promo_code": "TEST15",
    "payment_method": "cash"
  }'
Test IDs Reference
bash
# Business
BUSINESS_ID="ac7de9dd-7cc8-41c9-94f7-611a4ade5256"

# User
USER_ID="d5f407e3-ac71-4b91-b03e-ec50f908c3d1"

# Customer
CUSTOMER_ID="ac0d2540-2e6b-4efe-b890-72c013fdc597"

# Product
PRODUCT_ID="d754bf00-76db-481b-af5e-b54d8009990b"

# Promo Codes
# TEST15 - 15% off (no approval required)
# TEST16 - 15% off (requires approval)
# WELCOME10 - 10% off (new customer)
Quick Setup Commands
bash
# Create the docs directory
mkdir -p ~/Bizzy_Track_pro/backend/docs

# Create both files with proper names
touch ~/Bizzy_Track_pro/backend/docs/discount-api.md
touch ~/Bizzy_Track_pro/backend/docs/discount-examples.md

# Verify files exist
ls -la ~/Bizzy_Track_pro/backend/docs/
