import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user || user.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const promos = await prisma.promoOffer.findMany({
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({ promos });
  } catch (error) {
    console.error('Get promos error:', error);
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
    const { code, description, type, value, minOrder, maxUses, startsAt, endsAt } = body;

    if (!code || typeof code !== 'string' || code.trim().length === 0) {
      return NextResponse.json({ error: 'Promo code is required' }, { status: 400 });
    }
    if (!type || !['percentage', 'fixed'].includes(type)) {
      return NextResponse.json({ error: 'Type must be "percentage" or "fixed"' }, { status: 400 });
    }
    const parsedValue = parseFloat(value);
    if (isNaN(parsedValue) || parsedValue <= 0) {
      return NextResponse.json({ error: 'Value must be a positive number' }, { status: 400 });
    }

    const normalizedCode = code.trim().toUpperCase();

    const existingPromo = await prisma.promoOffer.findUnique({ where: { code: normalizedCode } });
    if (existingPromo) {
      return NextResponse.json({ error: 'Code already exists' }, { status: 400 });
    }

    const promo = await prisma.promoOffer.create({
      data: {
        code: normalizedCode,
        description: description || null,
        type,
        value: parsedValue,
        minOrder: parseFloat(minOrder) || 0,
        maxUses: parseInt(maxUses) || 100,
        startsAt: startsAt ? new Date(startsAt) : null,
        endsAt: endsAt ? new Date(endsAt) : null,
      },
    });

    return NextResponse.json({ promo }, { status: 201 });
  } catch (error) {
    console.error('Create promo error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user || user.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { id, code, description, type, value, minOrder, maxUses, isActive, startsAt, endsAt } = body;

    if (!id) {
      return NextResponse.json({ error: 'Promo ID required' }, { status: 400 });
    }

    const updateData: Record<string, unknown> = {};
    if (code !== undefined) {
      if (typeof code !== 'string' || code.trim().length === 0) {
        return NextResponse.json({ error: 'Promo code cannot be empty' }, { status: 400 });
      }
      updateData.code = code.trim().toUpperCase();
    }
    if (description !== undefined) updateData.description = description || null;
    if (type !== undefined) {
      if (!['percentage', 'fixed'].includes(type)) {
        return NextResponse.json({ error: 'Type must be "percentage" or "fixed"' }, { status: 400 });
      }
      updateData.type = type;
    }
    if (value !== undefined) {
      const parsedValue = parseFloat(value);
      if (isNaN(parsedValue) || parsedValue <= 0) {
        return NextResponse.json({ error: 'Value must be a positive number' }, { status: 400 });
      }
      updateData.value = parsedValue;
    }
    if (minOrder !== undefined) updateData.minOrder = parseFloat(minOrder) || 0;
    if (maxUses !== undefined) updateData.maxUses = parseInt(maxUses) || 100;
    if (isActive !== undefined) updateData.isActive = isActive;
    if (startsAt !== undefined) updateData.startsAt = startsAt ? new Date(startsAt) : null;
    if (endsAt !== undefined) updateData.endsAt = endsAt ? new Date(endsAt) : null;

    const promo = await prisma.promoOffer.update({
      where: { id },
      data: updateData,
    });

    return NextResponse.json({ promo });
  } catch (error) {
    console.error('Update promo error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user || user.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { id } = body;

    if (!id) {
      return NextResponse.json({ error: 'Promo ID required' }, { status: 400 });
    }

    await prisma.promoOffer.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Delete promo error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
