# Discount Accounting System API Documentation
## Version 1.0.0 | March 2026

## Base URL
`http://localhost:8002/api`

## Authentication
All endpoints require JWT token:
Authorization: Bearer <your_token>

## Test Data
```javascript
const testBusinessId = 'ac7de9dd-7cc8-41c9-94f7-611a4ade5256';
const testUserId = 'd5f407e3-ac71-4b91-b03e-ec50f908c3d1';
const testCustomerId = 'ac0d2540-2e6b-4efe-b890-72c013fdc597';
const testProductId = 'd754bf00-76db-481b-af5e-b54d8009990b';
1. PROMOTIONAL DISCOUNTS
POST /discounts/promotions/validate
Validate a promo code without applying it.

Request Body:

json
{
  "promoCode": "TEST15",
  "amount": 500000,
  "customerId": "ac0d2540-2e6b-4efe-b890-72c013fdc597"
}
Response:

json
{
  "success": true,
  "data": {
    "valid": true,
    "discountAmount": 75000,
    "finalAmount": 425000,
    "reason": "Valid promo code"
  }
}
POST /discounts/promotions
Create a new promotional discount.

Request Body:

json
{
  "promoCode": "SUMMER25",
  "discountType": "PERCENTAGE",
  "discountValue": 25,
  "validFrom": "2026-06-01",
  "validTo": "2026-08-31",
  "minPurchase": 100000,
  "maxUses": 500,
  "description": "Summer sale 25% off"
}
GET /discounts/promotions/:id/stats
Get usage statistics for a promotion.

Response:

json
{
  "success": true,
  "data": {
    "usage_stats": {
      "total_uses": 0,
      "total_discount_amount": 0,
      "remaining_uses": 100,
      "usage_percentage": "0.00%"
    }
  }
}
2. VOLUME DISCOUNTS
POST /discounts/volume/calculate
Calculate volume discount for items.

Request Body:

json
{
  "items": [
    {
      "id": "d754bf00-76db-481b-af5e-b54d8009990b",
      "quantity": 5,
      "amount": 1250000
    }
  ]
}
Response:

json
{
  "success": true,
  "data": {
    "totalOriginalAmount": 6250000,
    "totalDiscount": 1250000,
    "finalAmount": 5000000,
    "tier": {
      "discount_percentage": 20,
      "requirement": "10+ items"
    }
  }
}
3. EARLY PAYMENT DISCOUNTS
POST /discounts/early-payment/calculate
Calculate early payment discount for an invoice.

Request Body:

json
{
  "invoiceId": "e6405126-ced5-4f39-b084-c96ee0e464de",
  "paymentDate": "2026-03-20"
}
Response:

json
{
  "success": true,
  "data": {
    "eligible": true,
    "discountAmount": 15900,
    "finalAmount": 514100,
    "daysEarly": 9
  }
}
4. DISCOUNT ALLOCATIONS
POST /discounts/allocations
Create a discount allocation for a transaction.

Request Body:

json
{
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
}
POST /discounts/allocations/:id/void
Void a discount allocation.

Request Body:

json
{
  "reason": "Customer returned items"
}
ERROR CODES
Code	Description
400	Validation failed
401	Missing/invalid token
403	Insufficient permissions
404	Resource not found
409	Conflict (duplicate promo code)
500	Server error
RATE LIMITS
Standard endpoints: 100 requests/minute

Analytics endpoints: 50 requests/minute

Bulk operations: 20 requests/minute

