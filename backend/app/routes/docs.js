import express from 'express';
import swaggerJsdoc from 'swagger-jsdoc';
import swaggerUi from 'swagger-ui-express';

const router = express.Router();

// Swagger definition
const swaggerOptions = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'BizzyTrack API',
      version: '1.0.0',
      description: 'Complete Business Management System API',
    },
    servers: [
      {
        url: 'http://localhost:8002',
        description: 'Development server',
      },
    ],
  },
  apis: ['./app/routes/*.js'],
};

const swaggerSpec = swaggerJsdoc(swaggerOptions);

// Serve Swagger UI
router.use('/', swaggerUi.serve);
router.get('/', swaggerUi.setup(swaggerSpec));

export default router;
