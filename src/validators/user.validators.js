const { z } = require('zod');

const addressSchema = z.object({
  label: z.string().max(40).optional(),
  street: z.string().max(200).optional(),
  city: z.string().max(100).optional(),
  state: z.string().max(100).optional(),
  postalCode: z.string().max(20).optional(),
  country: z.string().max(100).optional(),
  isDefault: z.boolean().optional(),
});

const updateUserSchema = z.object({
  name: z.string().min(1).max(100).trim().optional(),
  email: z.string().email().toLowerCase().trim().optional(),
  password: z.string().min(8).max(128).optional(),
  addresses: z.array(addressSchema).optional(),
  role: z.enum(['customer', 'seller', 'admin']).optional(),
  isActive: z.boolean().optional(),
});

module.exports = { updateUserSchema };
