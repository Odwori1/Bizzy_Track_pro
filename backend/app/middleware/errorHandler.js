const errorHandler = (error, req, res, next) => {
  console.error('Server Error:', {
    url: req.url,
    method: req.method,
    error: error.message,
    stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
  });

  // Route not found - give helpful message
  if (error.message === 'Route not found' || res.statusCode === 404) {
    return res.status(404).json({
      success: false,
      error: 'Route not found',
      path: req.url,
      message: 'Check the API documentation for available endpoints',
      availableEndpoints: [
        'GET /api/health',
        'POST /api/businesses/login',
        'POST /api/pos/transactions-with-discount',  // ✅ CORRECT ENDPOINT
        'POST /api/pos/transactions/:id/apply-discount',
        'GET /api/pos/transactions/:id/discount-status',
        'GET /api/discounts/promotional',
        'POST /api/discounts/promotional/validate',
        'GET /api/discounts/volume/tiers',
        'POST /api/discounts/volume/calculate',
        'GET /api/discounts/early-payment/terms',
        'POST /api/discounts/early-payment/calculate',
        'GET /api/discounts/allocations',
        'GET /api/discounts/analytics/usage/summary',
        'GET /api/discount-approvals/pending',
        'PUT /api/discount-approvals/:id/status'
      ]
    });
  }

  // Database errors
  if (error.code === '23505') { // Unique violation
    return res.status(409).json({
      success: false,
      error: 'Resource already exists',
      details: error.detail
    });
  }

  if (error.code === '23502') { // Not null violation
    return res.status(400).json({
      success: false,
      error: 'Missing required field',
      details: error.message,
      column: error.column
    });
  }

  if (error.code === '23503') { // Foreign key violation
    return res.status(400).json({
      success: false,
      error: 'Referenced record not found',
      details: error.detail
    });
  }

  // Default error
  res.status(500).json({
    success: false,
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong',
    path: req.url
  });
};

export default errorHandler;
