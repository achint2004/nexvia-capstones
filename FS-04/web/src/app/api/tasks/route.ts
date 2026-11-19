import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function POST(req: NextRequest) {
  const { organizationId, projectId, sprintId, title, priority, storyPoints, assigneeId } = await req.json();
  const task = await prisma.task.create({
    data: {
      organizationId,
      projectId,
      sprintId: sprintId || null,
      title,
      priority: priority || 'MEDIUM',
      storyPoints: Number(storyPoints) || 3,
      assigneeId: assigneeId || null,
      status: 'TODO',
    },
    include: { assignee: true },
  });
  return NextResponse.json(task);
}

export async function PATCH(req: NextRequest) {
  const { taskId, organizationId, status, sprintId, assigneeId, priority } = await req.json();

  // Tenant isolation guard
  const existing = await prisma.task.findFirst({
    where: { id: taskId, organizationId },
  });
  if (!existing) return NextResponse.json({ error: 'Task not found in tenant' }, { status: 404 });

  const updated = await prisma.task.update({
    where: { id: taskId },
    data: {
      ...(status !== undefined ? { status } : {}),
      ...(sprintId !== undefined ? { sprintId } : {}),
      ...(assigneeId !== undefined ? { assigneeId } : {}),
      ...(priority !== undefined ? { priority } : {}),
    },
    include: { assignee: true },
  });

  return NextResponse.json(updated);
}

export async function DELETE(req: NextRequest) {
  const taskId = req.nextUrl.searchParams.get('taskId');
  const organizationId = req.nextUrl.searchParams.get('organizationId');
  if (!taskId || !organizationId) {
    return NextResponse.json({ error: 'Missing parameters' }, { status: 400 });
  }

  await prisma.task.deleteMany({
    where: { id: taskId, organizationId },
  });
  return NextResponse.json({ deleted: true });
}
