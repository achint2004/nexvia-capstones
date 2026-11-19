import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const doc = await prisma.document.findUnique({
    where: { id },
    include: {
      comments: { include: { author: true }, orderBy: { createdAt: 'desc' } },
      snapshots: { orderBy: { createdAt: 'desc' } },
    },
  });
  if (!doc) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(doc);
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { title, content } = await req.json();
  const updated = await prisma.document.update({
    where: { id },
    data: {
      ...(title !== undefined ? { title } : {}),
      ...(content !== undefined ? { content } : {}),
    },
  });
  return NextResponse.json(updated);
}
