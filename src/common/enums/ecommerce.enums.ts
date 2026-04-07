import { registerEnumType } from '@nestjs/graphql';

export enum ProductStatus {
  DRAFT = 'DRAFT',
  ACTIVE = 'ACTIVE',
  ARCHIVED = 'ARCHIVED',
}

export enum InventoryPolicy {
  DENY = 'DENY',
  CONTINUE = 'CONTINUE',
}

export enum AdjustmentReason {
  CORRECTION = 'CORRECTION',
  RECEIVED = 'RECEIVED',
  DAMAGED = 'DAMAGED',
  SOLD = 'SOLD',
  RETURNED = 'RETURNED',
  RESERVED = 'RESERVED',
  UNRESERVED = 'UNRESERVED',
  TRANSFER = 'TRANSFER',
}

export enum OrderStatus {
  DRAFT = 'DRAFT',
  PENDING_PAYMENT = 'PENDING_PAYMENT',
  PAID = 'PAID',
  FULFILLED = 'FULFILLED',
  CANCELLED = 'CANCELLED',
  REFUNDED = 'REFUNDED',
}

export enum PaymentStatus {
  PENDING = 'PENDING',
  AUTHORIZED = 'AUTHORIZED',
  CAPTURED = 'CAPTURED',
  FAILED = 'FAILED',
  REFUNDED = 'REFUNDED',
}

export enum FulfillmentStatus {
  UNFULFILLED = 'UNFULFILLED',
  PARTIAL = 'PARTIAL',
  FULFILLED = 'FULFILLED',
}

registerEnumType(ProductStatus, { name: 'ProductStatus' });
registerEnumType(InventoryPolicy, { name: 'InventoryPolicy' });
registerEnumType(AdjustmentReason, { name: 'AdjustmentReason' });
registerEnumType(OrderStatus, { name: 'OrderStatus' });
registerEnumType(PaymentStatus, { name: 'PaymentStatus' });
registerEnumType(FulfillmentStatus, { name: 'FulfillmentStatus' });
