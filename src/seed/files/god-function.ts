interface Order {
  id: string;
  items: Array<{ name: string; price: number; qty: number }>;
  customer: { name: string; email: string; tier: string };
  shipping: { method: string; address: string };
  coupon?: string;
}

// God function: does validation, business logic, DB, formatting
async function processOrder(order: Order, db: any): Promise<any> {
  // Validation
  if (!order.id) throw new Error('Missing id');
  if (!order.items || order.items.length === 0) throw new Error('No items');
  if (!order.customer) throw new Error('No customer');
  if (!order.customer.email) throw new Error('No email');
  if (!order.customer.email.includes('@')) throw new Error('Bad email');
  if (!order.shipping) throw new Error('No shipping');
  if (!order.shipping.address) throw new Error('No address');
  if (order.items.length > 100) throw new Error('Too many items');
  for (const item of order.items) {
    if (item.price < 0) throw new Error('Negative price');
    if (item.qty < 1) throw new Error('Bad quantity');
    if (item.name.length > 200) throw new Error('Name too long');
  }

  // Calculate subtotal
  let subtotal = 0;
  for (const item of order.items) {
    subtotal += item.price * item.qty;
  }

  // Apply discounts
  let discount = 0;
  if (order.coupon === 'SAVE10') {
    discount = subtotal * 0.1;
  } else if (order.coupon === 'SAVE20') {
    discount = subtotal * 0.2;
  } else if (order.coupon === 'FLAT50') {
    discount = 50;
  } else if (order.coupon === 'VIP') {
    if (order.customer.tier === 'gold') {
      discount = subtotal * 0.15;
    } else if (order.customer.tier === 'platinum') {
      discount = subtotal * 0.25;
    } else {
      discount = subtotal * 0.05;
    }
  }

  // Calculate tax
  let taxRate = 0.08;
  if (order.shipping.address.includes('CA')) {
    taxRate = 0.0975;
  } else if (order.shipping.address.includes('NY')) {
    taxRate = 0.08875;
  } else if (order.shipping.address.includes('TX')) {
    taxRate = 0.0625;
  } else if (order.shipping.address.includes('OR')) {
    taxRate = 0;
  }

  const afterDiscount = subtotal - discount;
  const tax = afterDiscount * taxRate;

  // Calculate shipping
  let shippingCost = 0;
  if (order.shipping.method === 'standard') {
    shippingCost = 5.99;
  } else if (order.shipping.method === 'express') {
    shippingCost = 14.99;
  } else if (order.shipping.method === 'overnight') {
    shippingCost = 29.99;
  }

  if (afterDiscount > 100) {
    shippingCost = 0;
  }

  const total = afterDiscount + tax + shippingCost;

  // Save to DB
  const savedOrder = await db.query(
    `INSERT INTO orders (id, customer_email, subtotal, discount, tax, shipping, total, status) VALUES ('${order.id}', '${order.customer.email}', ${subtotal}, ${discount}, ${tax}, ${shippingCost}, ${total}, 'pending')`
  );

  for (const item of order.items) {
    await db.query(
      `INSERT INTO order_items (order_id, name, price, qty) VALUES ('${order.id}', '${item.name}', ${item.price}, ${item.qty})`
    );
  }

  // Send confirmation email
  console.log(`Sending email to ${order.customer.email}`);
  console.log(`Order ${order.id} total: $${total.toFixed(2)}`);

  // Format response
  const response = {
    orderId: order.id,
    customer: order.customer.name,
    items: order.items.map(i => ({
      name: i.name,
      subtotal: (i.price * i.qty).toFixed(2),
    })),
    subtotal: subtotal.toFixed(2),
    discount: discount.toFixed(2),
    tax: tax.toFixed(2),
    shipping: shippingCost.toFixed(2),
    total: total.toFixed(2),
    status: 'confirmed',
    estimatedDelivery: order.shipping.method === 'overnight' ? '1 day' : order.shipping.method === 'express' ? '3 days' : '5-7 days',
  };

  return response;
}

export { processOrder };
