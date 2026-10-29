const { z } = require('zod');

const booleanQuery = z
  .union([z.boolean(), z.enum(['true', 'false'])])
  .transform((value) => value === true || value === 'true');

const productCreateSchema = z.object({
  sku: z.string().min(3).max(40).trim().transform((v) => v.toUpperCase()),
  name: z.string().min(1).max(200).trim(),
  description: z.string().min(1).max(5000),
  category: z.string().min(1).max(80).trim(),
  subCategory: z.string().max(80).trim().optional(),
  brand: z.string().min(1).max(80).trim(),
  price: z.number().min(0),
  discountPercentage: z.number().min(0).max(100).optional(),
  stock: z.number().int().min(0),
  tags: z.array(z.string().trim().toLowerCase()).optional(),
  images: z.array(z.string().url()).optional(),
  rating: z.number().min(0).max(5).optional(),
  reviewCount: z.number().int().min(0).optional(),
  specifications: z
    .object({
      warranty: z.string().optional(),
      color: z.string().optional(),
      weight: z.number().optional(),
      attributes: z.record(z.any()).optional(),
    })
    .optional(),
  seller: z
    .object({
      name: z.string().min(1),
      rating: z.number().min(0).max(5).optional(),
    })
    .optional(),
  coordinates: z.tuple([z.number(), z.number()]).optional(),
  isFeatured: z.boolean().optional(),
  isActive: z.boolean().optional(),
});

const productUpdateSchema = productCreateSchema.partial().omit({ sku: true });

const productQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  category: z.string().optional(),
  brand: z.string().optional(),
  minPrice: z.coerce.number().min(0).optional(),
  maxPrice: z.coerce.number().min(0).optional(),
  inStock: booleanQuery.optional(),
  isActive: booleanQuery.optional(),
  tag: z.string().optional(),
  search: z.string().optional(),
  sort: z.string().optional(),
  featured: booleanQuery.optional(),
  near: z
    .string()
    .regex(/^-?\d+(\.\d+)?,-?\d+(\.\d+)?(,\d+)?$/, 'Expected "lng,lat[,maxDistanceMeters]"')
    .optional(), // "lng,lat,maxDistanceMeters"
});

module.exports = { productCreateSchema, productUpdateSchema, productQuerySchema };
