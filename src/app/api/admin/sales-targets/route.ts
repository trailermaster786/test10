import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user || user.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const targets = await prisma.salesTarget.findMany({
      include: {
        user: { select: { id: true, name: true, email: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({ targets });
  } catch (error) {
    console.error('Get sales targets error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user || user.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { userId, targetType, period, targetAmount, month, year } = body;

    if (!userId) {
      return NextResponse.json({ error: 'Driver is required' }, { status: 400 });
    }

    const userExists = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, role: true } });
    if (!userExists) {
      return NextResponse.json({ error: 'User not found' }, { status: 400 });
    }
    if (userExists.role !== 'driver') {
      return NextResponse.json({ error: 'Sales targets can only be assigned to drivers' }, { status: 400 });
    }

    const parsedMonth = parseInt(month);
    const parsedYear = parseInt(year);
    if (isNaN(parsedMonth) || parsedMonth < 1 || parsedMonth > 12) {
      return NextResponse.json({ error: 'Month must be between 1 and 12' }, { status: 400 });
    }
    if (isNaN(parsedYear) || parsedYear < 2020) {
      return NextResponse.json({ error: 'Invalid year' }, { status: 400 });
    }

    const parsedAmount = parseFloat(targetAmount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      return NextResponse.json({ error: 'Target amount must be a positive number' }, { status: 400 });
    }

    const target = await prisma.salesTarget.create({
      data: {
        userId,
        targetType: targetType || 'monthly',
        period: period || `${parsedMonth}/${parsedYear}`,
        targetAmount: parsedAmount,
        month: parsedMonth,
        year: parsedYear,
      },
      include: {
        user: { select: { id: true, name: true, email: true } },
      },
    });

    return NextResponse.json({ target }, { status: 201 });
  } catch (error) {
    console.error('Create sales target error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
