import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user || user.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const totalOrders = await prisma.order.count();
    const totalRevenue = await prisma.order.aggregate({ _sum: { finalAmount: true }, where: { paymentStatus: 'paid' } });
    const totalCustomers = await prisma.user.count({ where: { role: 'customer' } });
    const totalDrivers = await prisma.user.count({ where: { role: 'driver' } });
    const totalBottles = await prisma.bottle.count();

    const recentOrders = await prisma.order.findMany({
      take: 10,
      include: {
        user: { select: { name: true, email: true } },
        items: { include: { product: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Order status distribution
    const statusCounts = await prisma.order.groupBy({
      by: ['status'],
      _count: true,
    });

    // Revenue by day (last 7 days)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const dailyRevenue = await prisma.order.findMany({
      where: {
        createdAt: { gte: sevenDaysAgo },
        paymentStatus: 'paid',
      },
      select: {
        finalAmount: true,
        createdAt: true,
      },
    });

    // Group by day
    const revenueByDay: Record<string, number> = {};
    dailyRevenue.forEach((order) => {
      const day = order.createdAt.toISOString().split('T')[0];
      const amount = typeof order.finalAmount === 'number' && !isNaN(order.finalAmount) ? order.finalAmount : 0;
      revenueByDay[day] = (revenueByDay[day] || 0) + amount;
    });

    const chartData = Object.entries(revenueByDay).map(([date, revenue]) => ({
      date,
      revenue: Math.round(revenue * 100) / 100,
    }));

    return NextResponse.json({
      stats: {
        totalOrders,
        totalRevenue: totalRevenue._sum.finalAmount || 0,
        totalCustomers,
        totalDrivers,
        totalBottles,
      },
      recentOrders,
      statusDistribution: statusCounts.map((s) => ({ status: s.status, count: s._count })),
      chartData,
    });
  } catch (error) {
    console.error('Get reports error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
