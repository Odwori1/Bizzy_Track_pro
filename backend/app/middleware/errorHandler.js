const errorHandler = (error, req, res, next) => {
  console.error('Server Error:', error);

  // Database errors
  if (error.code === '23505') { // Unique violation
    return res.status(409).json({
      error: 'Resource already exists',
      details: error.detail
    });
  }

  // Default error
  res.status(500).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong'
  });
};

export default errorHandler;
