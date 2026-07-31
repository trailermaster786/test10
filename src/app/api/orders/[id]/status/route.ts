import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json();
    const { status } = body;

    if (!status || typeof status !== 'string') {
      return NextResponse.json({ error: 'Status is required' }, { status: 400 });
    }

    const order = await prisma.order.findUnique({ where: { id } });
    if (!order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }

    // Authorization: admin can update any order, customers only their own, drivers only assigned ones
    if (user.role === 'customer' && order.userId !== user.userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (user.role === 'driver' && order.driverId !== user.userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Validate status transition
    const validTransitions: Record<string, string[]> = {
      PENDING: ['CONFIRMED', 'CANCELLED'],
      CONFIRMED: ['ASSIGNED', 'CANCELLED'],
      ASSIGNED: ['IN_TRANSIT', 'CANCELLED'],
      IN_TRANSIT: ['DELIVERED'],
      DELIVERED: [],
      CANCELLED: [],
    };

    // Admin can skip steps (e.g., directly confirm and assign)
    const allowedAdminStatuses = ['CONFIRMED', 'ASSIGNED', 'IN_TRANSIT', 'DELIVERED', 'CANCELLED'];
    const isAdmin = user.role === 'admin';
    const isTransitionValid = validTransitions[order.status]?.includes(status) || (isAdmin && allowedAdminStatuses.includes(status));

    if (!isTransitionValid) {
      return NextResponse.json({ error: 'Invalid status transition' }, { status: 400 });
    }

    const updatedOrder = await prisma.order.update({
      where: { id },
      data: { status },
      include: { items: true, user: true },
    });

    // Save notification for customer and admin
    try {
      const statusLabels: Record<string, string> = {
        CONFIRMED: 'Order Confirmed',
        ASSIGNED: 'Driver Assigned',
        IN_TRANSIT: 'Out for Delivery',
        DELIVERED: 'Order Delivered',
        CANCELLED: 'Order Cancelled',
      };
      const statusMessages: Record<string, string> = {
        CONFIRMED: `Your order #${id.slice(-8).toUpperCase()} has been confirmed`,
        ASSIGNED: `A driver has been assigned to your order #${id.slice(-8).toUpperCase()}`,
        IN_TRANSIT: `Your order #${id.slice(-8).toUpperCase()} is on the way`,
        DELIVERED: `Your order #${id.slice(-8).toUpperCase()} has been delivered`,
        CANCELLED: `Your order #${id.slice(-8).toUpperCase()} has been cancelled`,
      };

      if (statusLabels[status]) {
        await prisma.notification.create({
          data: {
            userId: order.userId,
            type: `order_${status.toLowerCase()}`,
            title: statusLabels[status],
            message: statusMessages[status],
            orderId: id,
          },
        });
        await prisma.notification.create({
          data: {
            role: 'admin',
            type: `order_${status.toLowerCase()}`,
            title: statusLabels[status],
            message: `Order #${id.slice(-8).toUpperCase()} - ${statusLabels[status]}`,
            orderId: id,
          },
        });
        if (order.driverId && status === 'CANCELLED') {
          await prisma.notification.create({
            data: {
              userId: order.driverId,
              type: 'order_cancelled',
              title: 'Order Cancelled',
              message: `Order #${id.slice(-8).toUpperCase()} has been cancelled`,
              orderId: id,
            },
          });
        }
      }
    } catch (notifError) {
      console.error('Failed to create status notification:', notifError);
    }

    return NextResponse.json({ order: updatedOrder });
  } catch (error) {
    console.error('Update order status error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
