import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { label, content } = await req.json();
  const snapshot = await prisma.documentSnapshot.create({
    data: {
      documentId: id,
      label: label || `Snapshot ${new Date().toLocaleTimeString()}`,
      content,
    },
  });
  return NextResponse.json(snapshot);
}
