'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd';
import {
  Building2,
  FolderKanban,
  ListTodo,
  CreditCard,
  Users,
  Plus,
  Play,
  CheckCircle2,
  Sparkles,
  LogOut,
  Trash2,
  ArrowRightCircle,
  ShieldCheck,
} from 'lucide-react';

type TaskStatus = 'TODO' | 'IN_PROGRESS' | 'IN_REVIEW' | 'DONE';
type TaskPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';

interface User {
  id: string;
  email: string;
  name: string;
}

interface OrgSummary {
  id: string;
  name: string;
  slug: string;
  plan: 'FREE' | 'PRO';
  role: 'OWNER' | 'ADMIN' | 'MEMBER';
}

interface TaskItem {
  id: string;
  title: string;
  status: TaskStatus;
  priority: TaskPriority;
  storyPoints: number;
  sprintId: string | null;
  assignee: User | null;
}

interface SprintItem {
  id: string;
  name: string;
  goal: string;
  status: 'PLANNING' | 'ACTIVE' | 'COMPLETED';
}

interface ProjectItem {
  id: string;
  name: string;
  key: string;
  description: string;
  sprints: SprintItem[];
  tasks: TaskItem[];
}

interface TenantDetail {
  id: string;
  name: string;
  slug: string;
  plan: 'FREE' | 'PRO';
  billingCycleEnd: string | null;
  members: { id: string; role: string; user: User }[];
  projects: ProjectItem[];
}

const COLUMNS: { id: TaskStatus; label: string; color: string }[] = [
  { id: 'TODO', label: 'To Do', color: 'bg-slate-200 text-slate-800' },
  { id: 'IN_PROGRESS', label: 'In Progress', color: 'bg-blue-100 text-blue-800' },
  { id: 'IN_REVIEW', label: 'In Review', color: 'bg-amber-100 text-amber-800' },
  { id: 'DONE', label: 'Done', color: 'bg-emerald-100 text-emerald-800' },
];

const PRIORITY_BADGE: Record<TaskPriority, string> = {
  LOW: 'bg-slate-100 text-slate-600',
  MEDIUM: 'bg-sky-100 text-sky-700',
  HIGH: 'bg-orange-100 text-orange-700',
  URGENT: 'bg-rose-100 text-rose-700',
};

export default function MultiTenantPlatform() {
  const [user, setUser] = useState<User | null>(null);
  const [nameInput, setNameInput] = useState('');
  const [emailInput, setEmailInput] = useState('');
  const [authLoading, setAuthLoading] = useState(false);

  const [orgList, setOrgList] = useState<OrgSummary[]>([]);
  const [activeOrgId, setActiveOrgId] = useState<string | null>(null);
  const [tenant, setTenant] = useState<TenantDetail | null>(null);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [tab, setTab] = useState<'board' | 'sprints' | 'team' | 'billing'>('board');
  const [bannerError, setBannerError] = useState<string | null>(null);

  // Form states
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskPriority, setNewTaskPriority] = useState<TaskPriority>('MEDIUM');
  const [newTaskPoints, setNewTaskPoints] = useState(3);
  const [newTaskSprintId, setNewTaskSprintId] = useState<string>('');
  const [newSprintName, setNewSprintName] = useState('');
  const [newSprintGoal, setNewSprintGoal] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteName, setInviteName] = useState('');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nameInput.trim() || !emailInput.trim()) return;
    setAuthLoading(true);
    try {
      const res = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: nameInput, email: emailInput }),
      });
      const data = await res.json();
      if (data.user && data.organizations) {
        setUser(data.user);
        setOrgList(data.organizations);
        if (data.organizations.length > 0) {
          setActiveOrgId(data.organizations[0].id);
        }
      }
    } finally {
      setAuthLoading(false);
    }
  };

  const loadTenant = useCallback(async (orgId: string) => {
    setBannerError(null);
    const res = await fetch(`/api/organizations?organizationId=${orgId}`);
    if (!res.ok) return;
    const data: TenantDetail = await res.json();
    setTenant(data);
    setActiveProjectId((prev) =>
      data.projects.some((p) => p.id === prev) ? prev : data.projects[0]?.id || null
    );
  }, []);

  useEffect(() => {
    if (activeOrgId) {
      loadTenant(activeOrgId);
    }
  }, [activeOrgId, loadTenant]);

  const activeProject = tenant?.projects.find((p) => p.id === activeProjectId) || null;
  const activeSprint = activeProject?.sprints.find((s) => s.status === 'ACTIVE') || null;

  const handleCreateTenant = async () => {
    if (!user) return;
    const orgName = prompt('Enter new company / tenant workspace name:');
    if (!orgName?.trim()) return;
    const res = await fetch('/api/organizations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: orgName.trim(), userId: user.id }),
    });
    const created: OrgSummary = await res.json();
    setOrgList((prev) => [...prev, created]);
    setActiveOrgId(created.id);
  };

  const handleCreateProject = async () => {
    if (!tenant) return;
    setBannerError(null);
    const name = prompt('Enter new project name:');
    if (!name?.trim()) return;
    const res = await fetch('/api/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        organizationId: tenant.id,
        name: name.trim(),
        key: name.trim().slice(0, 3).toUpperCase(),
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setBannerError(data.error);
      return;
    }
    await loadTenant(tenant.id);
    setActiveProjectId(data.id);
  };

  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tenant || !activeProject || !newTaskTitle.trim()) return;
    await fetch('/api/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        organizationId: tenant.id,
        projectId: activeProject.id,
        sprintId: newTaskSprintId || activeSprint?.id || null,
        title: newTaskTitle.trim(),
        priority: newTaskPriority,
        storyPoints: newTaskPoints,
        assigneeId: user?.id,
      }),
    });
    setNewTaskTitle('');
    await loadTenant(tenant.id);
  };

  const onDragEnd = async (result: DropResult) => {
    if (!result.destination || !tenant || !activeProject) return;
    const newStatus = result.destination.droppableId as TaskStatus;
    const taskId = result.draggableId;

    // Optimistic UI update
    setTenant({
      ...tenant,
      projects: tenant.projects.map((p) =>
        p.id === activeProject.id
          ? {
              ...p,
              tasks: p.tasks.map((t) => (t.id === taskId ? { ...t, status: newStatus } : t)),
            }
          : p
      ),
    });

    await fetch('/api/tasks', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        taskId,
        organizationId: tenant.id,
        status: newStatus,
      }),
    });
  };

  const handleDeleteTask = async (taskId: string) => {
    if (!tenant) return;
    await fetch(`/api/tasks?taskId=${taskId}&organizationId=${tenant.id}`, { method: 'DELETE' });
    await loadTenant(tenant.id);
  };

  const handleCreateSprint = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tenant || !activeProject || !newSprintName.trim()) return;
    await fetch('/api/sprints', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        organizationId: tenant.id,
        projectId: activeProject.id,
        name: newSprintName.trim(),
        goal: newSprintGoal.trim(),
      }),
    });
    setNewSprintName('');
    setNewSprintGoal('');
    await loadTenant(tenant.id);
  };

  const handleSprintStatus = async (sprintId: string, status: 'ACTIVE' | 'COMPLETED') => {
    if (!tenant) return;
    await fetch('/api/sprints', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sprintId, organizationId: tenant.id, status }),
    });
    await loadTenant(tenant.id);
  };

  const handleMoveTaskSprint = async (taskId: string, sprintId: string | null) => {
    if (!tenant) return;
    await fetch('/api/tasks', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ taskId, organizationId: tenant.id, sprintId }),
    });
    await loadTenant(tenant.id);
  };

  const handleInviteMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tenant || !inviteEmail.trim()) return;
    setBannerError(null);
    const res = await fetch('/api/organizations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'INVITE_MEMBER',
        organizationId: tenant.id,
        email: inviteEmail.trim(),
        name: inviteName.trim(),
        role: 'MEMBER',
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setBannerError(data.error);
      return;
    }
    setInviteEmail('');
    setInviteName('');
    await loadTenant(tenant.id);
  };

  const handlePlanSwitch = async (plan: 'FREE' | 'PRO') => {
    if (!tenant) return;
    const res = await fetch('/api/billing', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ organizationId: tenant.id, plan, mode: 'demo' }),
    });
    if (res.ok) {
      setOrgList((prev) => prev.map((o) => (o.id === tenant.id ? { ...o, plan } : o)));
      await loadTenant(tenant.id);
    }
  };

  if (!user || !tenant) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-white rounded-2xl shadow-xl p-8">
          <div className="flex items-center gap-2 text-blue-600 font-bold text-xs uppercase tracking-wider mb-2">
            <Building2 className="w-4 h-4" /> FS-04 Multi-Tenant SaaS Platform
          </div>
          <h1 className="text-2xl font-bold text-slate-900 mb-2">Sign in to Your Workspace</h1>
          <p className="text-sm text-slate-600 mb-6">
            Each company gets an isolated tenant database scope, Kanban boards, sprint planning, and subscription billing.
          </p>
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Full Name</label>
              <input
                type="text"
                required
                placeholder="Achint Raghuwanshi"
                value={nameInput}
                onChange={(e) => setNameInput(e.target.value)}
                className="w-full px-3.5 py-2 border border-slate-300 rounded-lg text-sm text-slate-900 outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Work Email</label>
              <input
                type="email"
                required
                placeholder="achint@company.com"
                value={emailInput}
                onChange={(e) => setEmailInput(e.target.value)}
                className="w-full px-3.5 py-2 border border-slate-300 rounded-lg text-sm text-slate-900 outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <button
              type="submit"
              disabled={authLoading}
              className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg text-sm transition"
            >
              {authLoading ? 'Provisioning Tenant...' : 'Launch SaaS Workspace'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  const boardTasks = activeProject
    ? activeProject.tasks.filter((t) => (activeSprint ? t.sprintId === activeSprint.id : true))
    : [];

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col md:flex-row">
      {/* Left Multi-Tenant Sidebar */}
      <aside className="w-full md:w-64 bg-slate-900 text-slate-200 flex flex-col justify-between p-4 shrink-0">
        <div className="space-y-5">
          {/* Tenant / Company Switcher */}
          <div>
            <div className="flex items-center justify-between text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
              <span>Tenant Organization</span>
              <button
                onClick={handleCreateTenant}
                className="text-blue-400 hover:text-blue-300 flex items-center gap-0.5"
                title="Create New Isolated Company"
              >
                <Plus className="w-3.5 h-3.5" /> New
              </button>
            </div>
            <select
              value={tenant.id}
              onChange={(e) => setActiveOrgId(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 text-white text-sm font-medium rounded-lg px-3 py-2 outline-none"
            >
              {orgList.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name} ({o.plan})
                </option>
              ))}
            </select>
            <div className="mt-1.5 flex items-center gap-1.5 text-[11px] text-emerald-400">
              <ShieldCheck className="w-3.5 h-3.5" /> Isolated ID: {tenant.id.slice(0, 10)}...
            </div>
          </div>

          {/* Tenant Projects */}
          <div>
            <div className="flex items-center justify-between text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
              <span>
                Projects ({tenant.projects.length}/{tenant.plan === 'FREE' ? '2' : '∞'})
              </span>
              <button
                onClick={handleCreateProject}
                className="p-1 hover:bg-slate-800 rounded text-slate-300"
                title="New Project"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="space-y-1">
              {tenant.projects.map((p) => (
                <button
                  key={p.id}
                  onClick={() => setActiveProjectId(p.id)}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm transition ${
                    p.id === activeProjectId
                      ? 'bg-blue-600 text-white font-medium'
                      : 'text-slate-300 hover:bg-slate-800'
                  }`}
                >
                  <span className="truncate">{p.name}</span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-black/20">{p.key}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Navigation Tabs */}
          <nav className="space-y-1 pt-2 border-t border-slate-800">
            <button
              onClick={() => setTab('board')}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm ${
                tab === 'board' ? 'bg-slate-800 text-white font-medium' : 'text-slate-400 hover:text-white'
              }`}
            >
              <FolderKanban className="w-4 h-4" /> Kanban Board
            </button>
            <button
              onClick={() => setTab('sprints')}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm ${
                tab === 'sprints' ? 'bg-slate-800 text-white font-medium' : 'text-slate-400 hover:text-white'
              }`}
            >
              <ListTodo className="w-4 h-4" /> Sprints & Backlog
            </button>
            <button
              onClick={() => setTab('team')}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm ${
                tab === 'team' ? 'bg-slate-800 text-white font-medium' : 'text-slate-400 hover:text-white'
              }`}
            >
              <Users className="w-4 h-4" /> Team Members
            </button>
            <button
              onClick={() => setTab('billing')}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm ${
                tab === 'billing' ? 'bg-slate-800 text-white font-medium' : 'text-slate-400 hover:text-white'
              }`}
            >
              <CreditCard className="w-4 h-4" /> SaaS Billing & Plan
            </button>
          </nav>
        </div>

        {/* User Footer */}
        <div className="pt-4 border-t border-slate-800 flex items-center justify-between">
          <div className="truncate">
            <div className="text-sm font-medium text-white truncate">{user.name}</div>
            <div className="text-xs text-slate-400 truncate">{user.email}</div>
          </div>
          <button
            onClick={() => setUser(null)}
            className="p-1.5 text-slate-400 hover:text-white"
            title="Sign Out"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 p-6 overflow-x-auto">
        {bannerError && (
          <div className="mb-4 p-3.5 bg-amber-50 border border-amber-300 text-amber-900 rounded-xl flex items-center justify-between text-sm">
            <span>{bannerError}</span>
            <button
              onClick={() => setTab('billing')}
              className="px-3 py-1 bg-amber-600 text-white rounded-lg text-xs font-semibold hover:bg-amber-700"
            >
              Upgrade to PRO
            </button>
          </div>
        )}

        {/* TAB 1: KANBAN BOARD */}
        {tab === 'board' && activeProject && (
          <div>
            <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
              <div>
                <div className="text-xs font-semibold text-blue-600 uppercase tracking-wider">
                  {tenant.name} / {activeProject.key}
                </div>
                <h1 className="text-2xl font-bold text-slate-900">{activeProject.name}</h1>
                <p className="text-xs text-slate-500 mt-0.5">
                  {activeSprint
                    ? `Active Sprint: ${activeSprint.name} — ${activeSprint.goal}`
                    : 'Showing all project issues (no active sprint started)'}
                </p>
              </div>

              {/* Quick Create Issue Form */}
              <form onSubmit={handleCreateTask} className="flex flex-wrap items-center gap-2">
                <input
                  type="text"
                  required
                  value={newTaskTitle}
                  onChange={(e) => setNewTaskTitle(e.target.value)}
                  placeholder="New issue summary..."
                  className="px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white text-slate-900 outline-none focus:ring-2 focus:ring-blue-500"
                />
                <select
                  value={newTaskPriority}
                  onChange={(e) => setNewTaskPriority(e.target.value as TaskPriority)}
                  className="px-2.5 py-2 text-sm border border-slate-300 rounded-lg bg-white text-slate-800"
                >
                  <option value="LOW">Low</option>
                  <option value="MEDIUM">Medium</option>
                  <option value="HIGH">High</option>
                  <option value="URGENT">Urgent</option>
                </select>
                <input
                  type="number"
                  min={1}
                  max={21}
                  value={newTaskPoints}
                  onChange={(e) => setNewTaskPoints(Number(e.target.value))}
                  className="w-16 px-2.5 py-2 text-sm border border-slate-300 rounded-lg bg-white text-slate-800"
                  title="Story Points"
                />
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg"
                >
                  + Add Issue
                </button>
              </form>
            </div>

            {/* 4-Column Drag & Drop Kanban Board */}
            <DragDropContext onDragEnd={onDragEnd}>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                {COLUMNS.map((col) => {
                  const colTasks = boardTasks.filter((t) => t.status === col.id);
                  return (
                    <Droppable droppableId={col.id} key={col.id}>
                      {(provided) => (
                        <div
                          ref={provided.innerRef}
                          {...provided.droppableProps}
                          className="bg-slate-200/70 rounded-xl p-3 min-h-[460px] flex flex-col"
                        >
                          <div className="flex items-center justify-between mb-3 px-1">
                            <span className={`text-xs font-bold px-2.5 py-0.5 rounded-full ${col.color}`}>
                              {col.label}
                            </span>
                            <span className="text-xs font-semibold text-slate-500">{colTasks.length}</span>
                          </div>

                          <div className="space-y-2.5 flex-1">
                            {colTasks.map((task, idx) => (
                              <Draggable draggableId={task.id} index={idx} key={task.id}>
                                {(dragProvided) => (
                                  <div
                                    ref={dragProvided.innerRef}
                                    {...dragProvided.draggableProps}
                                    {...dragProvided.dragHandleProps}
                                    className="bg-white p-3.5 rounded-lg shadow-xs border border-slate-200 hover:border-blue-400 transition"
                                  >
                                    <div className="flex items-start justify-between gap-2 mb-2">
                                      <span className="text-sm font-medium text-slate-900">{task.title}</span>
                                      <button
                                        onClick={() => handleDeleteTask(task.id)}
                                        className="text-slate-400 hover:text-rose-600 shrink-0"
                                      >
                                        <Trash2 className="w-3.5 h-3.5" />
                                      </button>
                                    </div>
                                    <div className="flex items-center justify-between text-[11px]">
                                      <span
                                        className={`px-2 py-0.5 rounded font-semibold ${
                                          PRIORITY_BADGE[task.priority]
                                        }`}
                                      >
                                        {task.priority}
                                      </span>
                                      <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-semibold">
                                        {task.storyPoints} pts
                                      </span>
                                    </div>
                                  </div>
                                )}
                              </Draggable>
                            ))}
                            {provided.placeholder}
                          </div>
                        </div>
                      )}
                    </Droppable>
                  );
                })}
              </div>
            </DragDropContext>
          </div>
        )}

        {/* TAB 2: SPRINTS & BACKLOG */}
        {tab === 'sprints' && activeProject && (
          <div className="max-w-4xl space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h1 className="text-2xl font-bold text-slate-900">Sprints & Product Backlog</h1>
                <p className="text-sm text-slate-500">
                  Plan sprints, assign backlog tasks, and complete active iterations.
                </p>
              </div>
              <form onSubmit={handleCreateSprint} className="flex flex-wrap gap-2">
                <input
                  type="text"
                  required
                  value={newSprintName}
                  onChange={(e) => setNewSprintName(e.target.value)}
                  placeholder="Sprint 2 Name..."
                  className="px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white text-slate-900"
                />
                <input
                  type="text"
                  value={newSprintGoal}
                  onChange={(e) => setNewSprintGoal(e.target.value)}
                  placeholder="Sprint goal..."
                  className="px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white text-slate-900"
                />
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700"
                >
                  Create Sprint
                </button>
              </form>
            </div>

            {/* Sprint Cards */}
            <div className="space-y-4">
              {activeProject.sprints.map((sprint) => {
                const sTasks = activeProject.tasks.filter((t) => t.sprintId === sprint.id);
                return (
                  <div key={sprint.id} className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs">
                    <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <h2 className="text-lg font-bold text-slate-900">{sprint.name}</h2>
                          <span
                            className={`text-xs font-bold px-2.5 py-0.5 rounded-full ${
                              sprint.status === 'ACTIVE'
                                ? 'bg-emerald-100 text-emerald-800'
                                : sprint.status === 'COMPLETED'
                                ? 'bg-slate-200 text-slate-700'
                                : 'bg-blue-100 text-blue-800'
                            }`}
                          >
                            {sprint.status}
                          </span>
                        </div>
                        {sprint.goal && <p className="text-xs text-slate-500 mt-0.5">{sprint.goal}</p>}
                      </div>

                      <div className="flex gap-2">
                        {sprint.status === 'PLANNING' && (
                          <button
                            onClick={() => handleSprintStatus(sprint.id, 'ACTIVE')}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 text-white text-xs font-semibold rounded-lg hover:bg-emerald-700"
                          >
                            <Play className="w-3.5 h-3.5" /> Start Sprint
                          </button>
                        )}
                        {sprint.status === 'ACTIVE' && (
                          <button
                            onClick={() => handleSprintStatus(sprint.id, 'COMPLETED')}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 text-white text-xs font-semibold rounded-lg hover:bg-slate-900"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" /> Complete Sprint
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="divide-y divide-slate-100">
                      {sTasks.length === 0 && (
                        <p className="text-xs text-slate-400 py-3">No issues assigned to this sprint.</p>
                      )}
                      {sTasks.map((t) => (
                        <div key={t.id} className="py-2.5 flex items-center justify-between text-sm">
                          <span className="text-slate-800 font-medium">{t.title}</span>
                          <div className="flex items-center gap-3">
                            <span className="text-xs text-slate-500">{t.status}</span>
                            <button
                              onClick={() => handleMoveTaskSprint(t.id, null)}
                              className="text-xs text-slate-500 hover:text-rose-600"
                            >
                              Move to Backlog
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Backlog Section */}
            <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs">
              <h2 className="text-lg font-bold text-slate-900 mb-3">Product Backlog (Unscheduled)</h2>
              <div className="divide-y divide-slate-100">
                {activeProject.tasks
                  .filter((t) => !t.sprintId)
                  .map((t) => (
                    <div key={t.id} className="py-2.5 flex items-center justify-between text-sm">
                      <span className="text-slate-800">{t.title}</span>
                      {activeProject.sprints.filter((s) => s.status !== 'COMPLETED').length > 0 && (
                        <select
                          defaultValue=""
                          onChange={(e) => {
                            if (e.target.value) handleMoveTaskSprint(t.id, e.target.value);
                          }}
                          className="text-xs border border-slate-300 rounded px-2 py-1 bg-slate-50 text-slate-800"
                        >
                          <option value="" disabled>
                            Move to Sprint...
                          </option>
                          {activeProject.sprints
                            .filter((s) => s.status !== 'COMPLETED')
                            .map((s) => (
                              <option key={s.id} value={s.id}>
                                {s.name}
                              </option>
                            ))}
                        </select>
                      )}
                    </div>
                  ))}
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: TEAM MEMBERS */}
        {tab === 'team' && (
          <div className="max-w-2xl space-y-6">
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Tenant Members ({tenant.name})</h1>
              <p className="text-sm text-slate-500">
                Seats used: {tenant.members.length} / {tenant.plan === 'FREE' ? '3 (Free Tier)' : 'Unlimited (Pro)'}
              </p>
            </div>

            <form onSubmit={handleInviteMember} className="bg-white p-4 rounded-xl border border-slate-200 flex flex-wrap gap-2">
              <input
                type="text"
                placeholder="Teammate Name"
                value={inviteName}
                onChange={(e) => setInviteName(e.target.value)}
                className="px-3 py-2 text-sm border border-slate-300 rounded-lg text-slate-900"
              />
              <input
                type="email"
                required
                placeholder="teammate@company.com"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                className="flex-1 px-3 py-2 text-sm border border-slate-300 rounded-lg text-slate-900"
              />
              <button
                type="submit"
                className="px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700"
              >
                Invite Member
              </button>
            </form>

            <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100">
              {tenant.members.map((m) => (
                <div key={m.id} className="p-4 flex items-center justify-between">
                  <div>
                    <div className="text-sm font-semibold text-slate-900">{m.user.name}</div>
                    <div className="text-xs text-slate-500">{m.user.email}</div>
                  </div>
                  <span className="text-xs font-bold px-2.5 py-1 rounded bg-slate-100 text-slate-700">
                    {m.role}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* TAB 4: SAAS BILLING & SUBSCRIPTIONS */}
        {tab === 'billing' && (
          <div className="max-w-3xl space-y-6">
            <div>
              <h1 className="text-2xl font-bold text-slate-900">SaaS Subscription & Billing</h1>
              <p className="text-sm text-slate-500">
                Current Organization: <strong>{tenant.name}</strong> — Active Plan:{' '}
                <span className="font-bold text-blue-600">{tenant.plan}</span>
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* FREE PLAN */}
              <div
                className={`bg-white rounded-2xl p-6 border-2 ${
                  tenant.plan === 'FREE' ? 'border-blue-600' : 'border-slate-200'
                }`}
              >
                <div className="text-sm font-bold text-slate-500 uppercase">Starter</div>
                <div className="text-3xl font-extrabold text-slate-900 mt-1">
                  $0 <span className="text-sm font-normal text-slate-500">/ month</span>
                </div>
                <ul className="mt-4 space-y-2 text-sm text-slate-600">
                  <li>• Up to 2 isolated projects</li>
                  <li>• Up to 3 team members</li>
                  <li>• Kanban boards & active sprints</li>
                </ul>
                <button
                  disabled={tenant.plan === 'FREE'}
                  onClick={() => handlePlanSwitch('FREE')}
                  className="mt-6 w-full py-2.5 rounded-lg text-sm font-semibold border border-slate-300 text-slate-700 disabled:opacity-50"
                >
                  {tenant.plan === 'FREE' ? 'Current Plan' : 'Downgrade to Free'}
                </button>
              </div>

              {/* PRO PLAN */}
              <div
                className={`bg-slate-900 text-white rounded-2xl p-6 border-2 ${
                  tenant.plan === 'PRO' ? 'border-emerald-400' : 'border-slate-800'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-bold text-blue-400 uppercase flex items-center gap-1">
                    <Sparkles className="w-4 h-4" /> Enterprise Pro
                  </span>
                  {tenant.plan === 'PRO' && (
                    <span className="text-xs bg-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded-full font-semibold">
                      Active
                    </span>
                  )}
                </div>
                <div className="text-3xl font-extrabold mt-1">
                  $29 <span className="text-sm font-normal text-slate-400">/ month</span>
                </div>
                <ul className="mt-4 space-y-2 text-sm text-slate-300">
                  <li>• Unlimited tenant projects & boards</li>
                  <li>• Unlimited organization team members</li>
                  <li>• Priority sprint analytics & Stripe billing</li>
                </ul>
                <button
                  disabled={tenant.plan === 'PRO'}
                  onClick={() => handlePlanSwitch('PRO')}
                  className="mt-6 w-full py-2.5 rounded-lg text-sm font-semibold bg-blue-600 hover:bg-blue-500 text-white disabled:opacity-50 flex items-center justify-center gap-1.5"
                >
                  {tenant.plan === 'PRO' ? (
                    'Current Active Plan'
                  ) : (
                    <>
                      Upgrade Organization to Pro <ArrowRightCircle className="w-4 h-4" />
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
