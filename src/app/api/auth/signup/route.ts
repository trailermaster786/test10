import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { hashPassword, createToken, setTokenCookie } from '@/lib/auth';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { name, email, password, phone, address, city } = body;

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 });
    }
    if (!email || typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: 'Valid email is required' }, { status: 400 });
    }
    if (!password || typeof password !== 'string' || password.length < 6) {
      return NextResponse.json({ error: 'Password must be at least 6 characters' }, { status: 400 });
    }

    const normalizedEmail = email.trim().toLowerCase();

    const existingUser = await prisma.user.findUnique({ where: { email: normalizedEmail } });
    if (existingUser) {
      return NextResponse.json({ error: 'Email already exists' }, { status: 400 });
    }

    const hashedPassword = await hashPassword(password);
    const user = await prisma.user.create({
      data: { name: name.trim(), email: normalizedEmail, password: hashedPassword, phone: phone || null, role: 'customer' },
      select: { id: true, name: true, email: true, role: true, phone: true },
    });

    // Create address if provided
    if (address) {
      await prisma.address.create({
        data: {
          userId: user.id,
          label: 'Home',
          street: address,
          city: city || 'Dubai',
          isDefault: true,
        },
      });
    }

    const token = await createToken({ userId: user.id, email: user.email, role: user.role });
    await setTokenCookie(token);

    return NextResponse.json({ user });
  } catch (error) {
    console.error('Signup error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
