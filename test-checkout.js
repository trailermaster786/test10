const http = require('http');

function post(path, body, cookies) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const headers = { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) };
    if (cookies) headers['Cookie'] = cookies;
    const req = http.request({ hostname: 'localhost', port: 3000, path, method: 'POST', headers }, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        const cookies = res.headers['set-cookie'];
        const cookieStr = cookies ? cookies.map(c => c.split(';')[0]).join('; ') : null;
        resolve({ status: res.statusCode, body: JSON.parse(body), cookies: cookieStr });
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

function get(path, cookies) {
  return new Promise((resolve, reject) => {
    const headers = {};
    if (cookies) headers['Cookie'] = cookies;
    const req = http.request({ hostname: 'localhost', port: 3000, path, method: 'GET', headers }, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(body) }));
    });
    req.on('error', reject);
    req.end();
  });
}

(async () => {
  try {
    // Step 1: Login as customer
    console.log('=== Step 1: Login ===');
    const login = await post('/api/auth/login', { email: 'customer@gmail.com', password: 'customer123' });
    console.log('Login status:', login.status, login.body.user ? `OK (${login.body.user.email})` : login.body.error);
    const cookies = login.cookies;

    // Step 2: Get products
    console.log('\n=== Step 2: Get Products ===');
    const prods = await get('/api/products', cookies);
    console.log('Products:', prods.body.products.map(p => `${p.name} ($${p.price})`).join(', '));

    // Step 3: Get active promos
    console.log('\n=== Step 3: Get Active Promos ===');
    const promos = await get('/api/promos/active', cookies);
    console.log('Promos:', promos.body.promos.map(p => `${p.code} (${p.type} ${p.value}, min:${p.minOrder})`).join(', '));

    // Step 4: Create order with promo
    console.log('\n=== Step 4: Create Order with Promo ===');
    const createOrder = await post('/api/orders/create', {
      items: [{ productId: 'prod-1', quantity: 3 }],
      paymentMethod: 'cash',
      promoCode: 'WELCOME10',
    }, cookies);
    console.log('Create order status:', createOrder.status);
    if (createOrder.status !== 201) {
      console.log('ERROR:', createOrder.body);
      return;
    }
    console.log('Order:', createOrder.body.order.id);
    console.log('Total:', createOrder.body.order.totalAmount, 'Discount:', createOrder.body.order.discount, 'Final:', createOrder.body.order.finalAmount);

    // Step 5: Checkout
    console.log('\n=== Step 5: Checkout ===');
    const checkout = await post('/api/orders/checkout', { orderId: createOrder.body.order.id }, cookies);
    console.log('Checkout status:', checkout.status);
    console.log('Result:', checkout.body);

  } catch (err) {
    console.error('ERROR:', err.message);
  }
})();
