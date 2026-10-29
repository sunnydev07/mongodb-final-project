const { z } = require('zod');

const reviewCreateSchema = z.object({
  rating: z.number().min(1).max(5),
  title: z.string().max(120).trim().optional(),
  comment: z.string().max(2000).trim().optional(),
});

const reviewUpdateSchema = reviewCreateSchema.partial();

module.exports = { reviewCreateSchema, reviewUpdateSchema };
