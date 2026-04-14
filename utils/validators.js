const Joi = require('joi');

const loginSchema = Joi.object({
  email: Joi.string().email().required().messages({
    'string.email': 'Please provide a valid email',
    'any.required': 'Email is required',
  }),
  password: Joi.string().min(6).required().messages({
    'string.min': 'Password must be at least 6 characters',
    'any.required': 'Password is required',
  }),
});

const customerSchema = Joi.object({
  name: Joi.string().min(2).max(100).required().messages({ 'any.required': 'Customer name is required' }),
  phone: Joi.string().min(7).max(20).required().messages({ 'any.required': 'Phone number is required' }),
  email: Joi.string().email().allow('', null).optional(),
  address: Joi.string().max(300).allow('', null).optional(),
});

const measurementSchema = Joi.object({
  chest: Joi.number().min(0).optional(),
  waist: Joi.number().min(0).optional(),
  hips: Joi.number().min(0).optional(),
  shoulder: Joi.number().min(0).optional(),
  sleeve: Joi.number().min(0).optional(),
  length: Joi.number().min(0).optional(),
  neck: Joi.number().min(0).optional(),
  inseam: Joi.number().min(0).optional(),
  thigh: Joi.number().min(0).optional(),
  notes: Joi.string().allow('', null).optional(),
});

const itemSchema = Joi.object({
  type: Joi.string()
    .valid('Shirt', 'Pant', 'Suit', 'Kurta', 'Blouse', 'Dress', 'Jacket', 'Other')
    .required(),
  quantity: Joi.number().min(1).default(1),
  status: Joi.string().valid('PENDING', 'STITCHING', 'READY').default('PENDING'),
  measurements: measurementSchema.optional(),
  cloth_image: Joi.string().uri().allow('', null).optional(),
  description: Joi.string().max(500).allow('', null).optional(),
  price: Joi.number().min(0).default(0),
});

const orderSchema = Joi.object({
  customer_id: Joi.string().required().messages({ 'any.required': 'Customer is required' }),
  items: Joi.array().items(itemSchema).min(1).required().messages({
    'any.required': 'At least one item is required',
    'array.min': 'At least one item is required',
  }),
  trial_date: Joi.date().allow(null).optional(),
  delivery_date: Joi.date().allow(null).optional(),
  notes: Joi.string().max(500).allow('', null).optional(),
});

const itemStatusSchema = Joi.object({
  status: Joi.string().valid('PENDING', 'STITCHING', 'READY').required(),
});

const invoiceSchema = Joi.object({
  order_id: Joi.string().required(),
  total_amount: Joi.number().min(0).required(),
  advance_paid: Joi.number().min(0).default(0),
  discount: Joi.number().min(0).default(0),
});

const paymentSchema = Joi.object({
  amount: Joi.number().min(1).required(),
  note: Joi.string().max(200).allow('', null).optional(),
  method: Joi.string().valid('CASH', 'CARD', 'UPI', 'BANK').default('CASH'),
});

module.exports = {
  loginSchema,
  customerSchema,
  orderSchema,
  itemStatusSchema,
  invoiceSchema,
  paymentSchema,
};
