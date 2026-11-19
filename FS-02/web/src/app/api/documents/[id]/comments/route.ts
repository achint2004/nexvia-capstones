import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { body, authorId } = await req.json();
  const comment = await prisma.comment.create({
    data: { documentId: id, body, authorId },
    include: { author: true },
  });
  return NextResponse.json(comment);
}
