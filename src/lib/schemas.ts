import { z } from 'zod'
import { normalizeMobile } from './utils'

export const registrationSchema = (price: number) =>
  z
    .object({
      customer_name: z.string().trim().min(1, 'Enter the visitor name').max(120, 'Name is too long'),
      mobile: z.string().refine((v) => normalizeMobile(v) !== null, 'Enter a valid 10-digit mobile number'),
      email: z
        .string()
        .trim()
        .refine((v) => v === '' || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v), 'Enter a valid email or leave blank'),
      notes: z.string().trim().max(500, 'Notes are too long'),
      physical_qty: z.number().int('Whole numbers only').min(0, 'Cannot be negative').max(200, 'Max 200'),
      online_qty: z.number().int('Whole numbers only').min(0, 'Cannot be negative').max(200, 'Max 200'),
      payment_type: z.enum(['cash', 'upi', 'other']),
      amount_received: z.number().min(0, 'Cannot be negative'),
      payment_description: z.string().trim().max(300, 'Description is too long'),
    })
    .superRefine((v, ctx) => {
      const total = v.physical_qty + v.online_qty
      if (total < 1) {
        ctx.addIssue({ code: 'custom', path: ['physical_qty'], message: 'Add at least one pass' })
      } else if (total > 200) {
        ctx.addIssue({ code: 'custom', path: ['physical_qty'], message: 'At most 200 passes per registration' })
      }
      if (total >= 1 && v.amount_received > total * price) {
        ctx.addIssue({ code: 'custom', path: ['amount_received'], message: 'Amount received is more than the total due' })
      }
    })

export type RegistrationFormValues = z.infer<ReturnType<typeof registrationSchema>>

export const cancelSchema = z.object({
  reason: z.string().trim().min(3, 'Enter a reason (at least 3 characters)').max(300),
})

export const paymentSchema = (maxAmount: number) =>
  z.object({
    payment_type: z.enum(['cash', 'upi', 'other']),
    amount: z
      .number()
      .positive('Enter an amount greater than 0')
      .max(maxAmount, `Cannot exceed the balance of ${maxAmount}`),
    description: z.string().trim().max(300),
  })

export const eventSchema = z.object({
  name: z.string().trim().min(1, 'Event name is required').max(150),
  description: z.string().trim().max(2000),
  event_date: z.string(),
  location: z.string().trim().max(300),
  price: z.number().min(0, 'Price cannot be negative'),
  contact_details: z.string().trim().max(500),
  subtitle: z.string().trim().max(200),
  instructions: z.string().trim().max(500),
})
export type EventFormValues = z.infer<typeof eventSchema>

export const loginSchema = z.object({
  email: z.string().trim().email('Enter a valid email'),
  password: z.string().min(1, 'Enter your password'),
})
