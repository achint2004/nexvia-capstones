import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function POST(req: NextRequest) {
  try {
    const { email, name, color } = await req.json();
    if (!email || !name) {
      return NextResponse.json({ error: 'Name and email are required' }, { status: 400 });
    }

    const user = await prisma.user.upsert({
      where: { email },
      update: { name, color: color || '#3b82f6' },
      create: { email, name, color: color || '#3b82f6' },
    });

    // Find or create the shared team workspace
    let workspace = await prisma.workspace.findFirst({
      include: { documents: { orderBy: { createdAt: 'asc' } }, members: { include: { user: true } } },
    });

    if (!workspace) {
      workspace = await prisma.workspace.create({
        data: {
          name: 'Product Engineering Workspace',
          documents: {
            create: {
              title: 'Q4 Architecture & RFC',
              content: '<p>Welcome to the real-time collaborative workspace. Start typing to sync live across tabs!</p>',
            },
          },
        },
        include: { documents: { orderBy: { createdAt: 'asc' } }, members: { include: { user: true } } },
      });
    }

    // Ensure user has a membership role in this workspace
    const existingMember = await prisma.workspaceMember.findUnique({
      where: { userId_workspaceId: { userId: user.id, workspaceId: workspace.id } },
    });

    if (!existingMember) {
      await prisma.workspaceMember.create({
        data: { userId: user.id, workspaceId: workspace.id, role: 'EDITOR' },
      });
    }

    const updatedWorkspace = await prisma.workspace.findUnique({
      where: { id: workspace.id },
      include: {
        documents: { orderBy: { createdAt: 'asc' } },
        members: { include: { user: true } },
      },
    });

    return NextResponse.json({ user, workspace: updatedWorkspace });
  } catch (error) {
    console.error('Workspace bootstrap error:', error);
    return NextResponse.json({ error: 'Failed to load workspace' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const { memberId, role } = await req.json();
    const updated = await prisma.workspaceMember.update({
      where: { id: memberId },
      data: { role },
      include: { user: true },
    });
    return NextResponse.json(updated);
  } catch (error) {
    return NextResponse.json({ error: 'Failed to update role' }, { status: 500 });
  }
}
