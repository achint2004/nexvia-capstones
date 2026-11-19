import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function POST(req: NextRequest) {
  const { workspaceId, title } = await req.json();
  const doc = await prisma.document.create({
    data: {
      workspaceId,
      title: title || 'Untitled Page',
      content: '<p></p>',
    },
  });
  return NextResponse.json(doc);
}
