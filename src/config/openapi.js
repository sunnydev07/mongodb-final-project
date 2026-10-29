const openapi = {
  openapi: '3.0.3',
  info: {
    title: 'MongoDB Final Project API',
    version: '1.0.0',
    description:
      'E-commerce backend demonstrating CRUD, advanced MongoDB queries and indexes, JWT auth, analytics, backups, and replication.',
  },
  servers: [{ url: 'http://localhost:4000', description: 'Local development' }],
  tags: [
    { name: 'Health' },
    { name: 'Auth' },
    { name: 'Products' },
    { name: 'Reviews' },
    { name: 'Orders' },
    { name: 'Users' },
  ],
  components: {
    securitySchemes: {
      bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
    },
    schemas: {
      Error: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: false },
          message: { type: 'string', example: 'Validation failed' },
        },
      },
      User: {
        type: 'object',
        properties: {
          _id: { type: 'string', example: '665f1c2ab8f0a1d2c3e45678' },
          name: { type: 'string', example: 'Alice' },
          email: { type: 'string', format: 'email' },
          role: { type: 'string', enum: ['customer', 'seller', 'admin'] },
          isActive: { type: 'boolean' },
        },
      },
      Product: {
        type: 'object',
        properties: {
          _id: { type: 'string' },
          sku: { type: 'string', example: 'SKU-000001' },
          name: { type: 'string' },
          description: { type: 'string' },
          category: { type: 'string' },
          brand: { type: 'string' },
          price: { type: 'number' },
          discountedPrice: { type: 'number' },
          stock: { type: 'integer' },
          inStock: { type: 'boolean' },
          rating: { type: 'number' },
          tags: { type: 'array', items: { type: 'string' } },
          location: {
            type: 'object',
            properties: {
              type: { type: 'string', example: 'Point' },
              coordinates: {
                type: 'array',
                items: { type: 'number' },
                example: [77.5, 11.5],
              },
            },
          },
        },
      },
      Review: {
        type: 'object',
        properties: {
          _id: { type: 'string' },
          product: { type: 'string' },
          user: { type: 'string' },
          rating: { type: 'integer', minimum: 1, maximum: 5 },
          title: { type: 'string' },
          comment: { type: 'string' },
          verifiedPurchase: { type: 'boolean' },
        },
      },
      Order: {
        type: 'object',
        properties: {
          _id: { type: 'string' },
          orderNumber: { type: 'string', example: 'ORD-MVT99CSS-2C95AI' },
          customer: { type: 'string' },
          items: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                product: { type: 'string' },
                sku: { type: 'string' },
                quantity: { type: 'integer' },
                unitPrice: { type: 'number' },
                lineTotal: { type: 'number' },
              },
            },
          },
          totalAmount: { type: 'number' },
          status: {
            type: 'string',
            enum: ['pending', 'processing', 'shipped', 'delivered', 'cancelled', 'returned'],
          },
        },
      },
    },
  },
  paths: {
    '/health': {
      get: {
        tags: ['Health'],
        summary: 'Liveness probe',
        responses: { 200: { description: 'Service is healthy' } },
      },
    },
    '/api/auth/register': {
      post: {
        tags: ['Auth'],
        summary: 'Register a customer or seller',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['name', 'email', 'password'],
                properties: {
                  name: { type: 'string' },
                  email: { type: 'string', format: 'email' },
                  password: { type: 'string', minLength: 8 },
                  role: { type: 'string', enum: ['customer', 'seller'] },
                },
              },
            },
          },
        },
        responses: {
          201: { description: 'Registered; returns user and JWT' },
          409: { description: 'Duplicate email', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        },
      },
    },
    '/api/auth/login': {
      post: {
        tags: ['Auth'],
        summary: 'Log in and receive a JWT',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['email', 'password'],
                properties: {
                  email: { type: 'string', format: 'email' },
                  password: { type: 'string' },
                },
              },
            },
          },
        },
        responses: {
          200: { description: 'Authenticated' },
          401: { description: 'Invalid credentials' },
        },
      },
    },
    '/api/auth/me': {
      get: {
        tags: ['Auth'],
        summary: 'Current user profile',
        security: [{ bearerAuth: [] }],
        responses: { 200: { description: 'Profile' }, 401: { description: 'Unauthorized' } },
      },
    },
    '/api/products': {
      get: {
        tags: ['Products'],
        summary: 'List/filter/search products with pagination',
        parameters: [
          { in: 'query', name: 'page', schema: { type: 'integer', minimum: 1 } },
          { in: 'query', name: 'limit', schema: { type: 'integer', minimum: 1, maximum: 100 } },
          { in: 'query', name: 'category', schema: { type: 'string' } },
          { in: 'query', name: 'brand', schema: { type: 'string' } },
          { in: 'query', name: 'tag', schema: { type: 'string' } },
          { in: 'query', name: 'minPrice', schema: { type: 'number' } },
          { in: 'query', name: 'maxPrice', schema: { type: 'number' } },
          { in: 'query', name: 'inStock', schema: { type: 'boolean' } },
          { in: 'query', name: 'isActive', schema: { type: 'boolean' } },
          { in: 'query', name: 'featured', schema: { type: 'boolean' } },
          { in: 'query', name: 'search', schema: { type: 'string' }, description: 'Full-text search' },
          {
            in: 'query',
            name: 'sort',
            schema: { type: 'string', enum: ['price_asc', 'price_desc', 'rating', 'newest', 'name'] },
          },
          {
            in: 'query',
            name: 'near',
            schema: { type: 'string', example: '77.5,11.5,10000' },
            description: 'lng,lat,maxDistanceMeters',
          },
        ],
        responses: { 200: { description: 'Paginated products' } },
      },
      post: {
        tags: ['Products'],
        summary: 'Create a product (seller/admin)',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/Product' } } },
        },
        responses: { 201: { description: 'Created' }, 403: { description: 'Forbidden' } },
      },
    },
    '/api/products/analytics/overview': {
      get: {
        tags: ['Products'],
        summary: 'Aggregation dashboard (category, brand, price buckets, inventory)',
        responses: { 200: { description: 'Aggregated analytics' } },
      },
    },
    '/api/products/{id}': {
      parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string' } }],
      get: {
        tags: ['Products'],
        summary: 'Get a product',
        responses: { 200: { description: 'Product' }, 404: { description: 'Not found' } },
      },
      patch: {
        tags: ['Products'],
        summary: 'Update own product (seller) or any product (admin)',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/Product' } } },
        },
        responses: { 200: { description: 'Updated' }, 403: { description: 'Forbidden' } },
      },
      delete: {
        tags: ['Products'],
        summary: 'Delete a product (admin)',
        security: [{ bearerAuth: [] }],
        responses: { 204: { description: 'Deleted' }, 403: { description: 'Forbidden' } },
      },
    },
    '/api/products/{productId}/reviews': {
      parameters: [{ in: 'path', name: 'productId', required: true, schema: { type: 'string' } }],
      get: {
        tags: ['Reviews'],
        summary: 'List reviews for a product',
        responses: { 200: { description: 'Paginated reviews' } },
      },
      post: {
        tags: ['Reviews'],
        summary: 'Create a review (one per user per product)',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/Review' } } },
        },
        responses: { 201: { description: 'Created' }, 409: { description: 'Already reviewed' } },
      },
    },
    '/api/reviews/{id}': {
      parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string' } }],
      patch: {
        tags: ['Reviews'],
        summary: 'Update own review (admin can edit any)',
        security: [{ bearerAuth: [] }],
        responses: { 200: { description: 'Updated' }, 403: { description: 'Forbidden' } },
      },
      delete: {
        tags: ['Reviews'],
        summary: 'Delete own review (admin can delete any)',
        security: [{ bearerAuth: [] }],
        responses: { 204: { description: 'Deleted' }, 403: { description: 'Forbidden' } },
      },
    },
    '/api/orders': {
      get: {
        tags: ['Orders'],
        summary: 'List orders (customers see their own)',
        security: [{ bearerAuth: [] }],
        responses: { 200: { description: 'Paginated orders' } },
      },
      post: {
        tags: ['Orders'],
        summary: 'Create an order and decrement stock',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['items', 'paymentMethod'],
                properties: {
                  items: {
                    type: 'array',
                    items: {
                      type: 'object',
                      required: ['productId', 'quantity'],
                      properties: {
                        productId: { type: 'string' },
                        quantity: { type: 'integer', minimum: 1 },
                      },
                    },
                  },
                  paymentMethod: {
                    type: 'string',
                    enum: ['UPI', 'card', 'netbanking', 'cod', 'wallet'],
                  },
                  shippingAddress: { type: 'object' },
                },
              },
            },
          },
        },
        responses: { 201: { description: 'Created' }, 409: { description: 'Insufficient stock' } },
      },
    },
    '/api/orders/{id}': {
      parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string' } }],
      get: {
        tags: ['Orders'],
        summary: 'Get an order (owner or admin)',
        security: [{ bearerAuth: [] }],
        responses: { 200: { description: 'Order' }, 403: { description: 'Forbidden' } },
      },
      delete: {
        tags: ['Orders'],
        summary: 'Delete an order (admin)',
        security: [{ bearerAuth: [] }],
        responses: { 204: { description: 'Deleted' } },
      },
    },
    '/api/orders/{id}/status': {
      parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string' } }],
      patch: {
        tags: ['Orders'],
        summary: 'Update order/payment status (admin/seller)',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['status'],
                properties: {
                  status: {
                    type: 'string',
                    enum: ['pending', 'processing', 'shipped', 'delivered', 'cancelled', 'returned'],
                  },
                  paymentStatus: {
                    type: 'string',
                    enum: ['pending', 'completed', 'failed', 'refunded'],
                  },
                  cancellationReason: { type: 'string' },
                },
              },
            },
          },
        },
        responses: { 200: { description: 'Updated' }, 403: { description: 'Forbidden' } },
      },
    },
    '/api/orders/analytics/overview': {
      get: {
        tags: ['Orders'],
        summary: 'Revenue, status and top-product aggregations (admin)',
        security: [{ bearerAuth: [] }],
        responses: { 200: { description: 'Aggregated analytics' } },
      },
    },
    '/api/orders/customer/{id}/summary': {
      get: {
        tags: ['Orders'],
        summary: 'Lifetime value summary for a customer (self or admin)',
        security: [{ bearerAuth: [] }],
        parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Summary' }, 403: { description: 'Forbidden' } },
      },
    },
    '/api/users': {
      get: {
        tags: ['Users'],
        summary: 'List users (admin)',
        security: [{ bearerAuth: [] }],
        responses: { 200: { description: 'Paginated users' } },
      },
    },
    '/api/users/{id}': {
      parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string' } }],
      get: {
        tags: ['Users'],
        summary: 'Get a user profile',
        security: [{ bearerAuth: [] }],
        responses: { 200: { description: 'User' } },
      },
      patch: {
        tags: ['Users'],
        summary: 'Update own profile (admin can update anyone)',
        security: [{ bearerAuth: [] }],
        responses: { 200: { description: 'Updated' }, 403: { description: 'Forbidden' } },
      },
      delete: {
        tags: ['Users'],
        summary: 'Delete a user (admin)',
        security: [{ bearerAuth: [] }],
        responses: { 204: { description: 'Deleted' } },
      },
    },
  },
};

module.exports = openapi;
