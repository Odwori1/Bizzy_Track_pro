import app from './app/index.js';

const PORT = process.env.PORT || 8002;

app.listen(PORT, () => {
  console.log(`🚀 Bizzy Track Pro Backend running on port ${PORT}`);
  console.log(`📍 Environment: ${process.env.NODE_ENV}`);
  console.log(`🗄️  Database: ${process.env.DB_HOST}:${process.env.DB_PORT}/${process.env.DB_NAME}`);
});
