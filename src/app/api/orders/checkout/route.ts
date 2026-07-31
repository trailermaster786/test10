import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user || (user.role !== 'customer' && user.role !== 'driver')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { orderId } = body;

    if (!orderId || typeof orderId !== 'string') {
      return NextResponse.json({ error: 'Order ID is required' }, { status: 400 });
    }

    const order = await prisma.order.findUnique({ where: { id: orderId } });
    if (!order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }

    if (order.userId !== user.userId && user.role !== 'driver') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Simulate payment success
    const updatedOrder = await prisma.order.update({
      where: { id: orderId },
      data: {
        paymentStatus: 'paid',
        status: 'CONFIRMED',
      },
    });

    // Save notification for admin
    try {
      const customerUser = await prisma.user.findUnique({ where: { id: user.userId } });
      await prisma.notification.create({
        data: {
          role: 'admin',
          type: 'new_order',
          title: 'New Order Placed',
          message: `Order #${orderId.slice(-8).toUpperCase()} by ${customerUser?.name || 'Customer'} - AED ${Number(updatedOrder.finalAmount).toFixed(2)}`,
          orderId: orderId,
        },
      });
    } catch (notifError) {
      console.error('Failed to create checkout notification:', notifError);
    }

    return NextResponse.json({ order: updatedOrder, message: 'Payment successful' });
  } catch (error) {
    console.error('Checkout error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
