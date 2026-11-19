'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import {
  FileText,
  Plus,
  MessageSquare,
  History,
  Users,
  RotateCcw,
  Send,
  LogOut,
  Layers,
} from 'lucide-react';

const CollaborativeEditor = dynamic(() => import('@/components/CollaborativeEditor'), {
  ssr: false,
});

const CURSOR_COLORS = ['#ef4444', '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899'];

interface User {
  id: string;
  email: string;
  name: string;
  color: string;
}

interface Member {
  id: string;
  role: 'VIEWER' | 'COMMENTER' | 'EDITOR';
  userId: string;
  user: User;
}

interface CommentItem {
  id: string;
  body: string;
  createdAt: string;
  author: User;
}

interface SnapshotItem {
  id: string;
  label: string;
  content: string;
  createdAt: string;
}

interface DocumentSummary {
  id: string;
  title: string;
  content: string;
}

interface WorkspaceData {
  id: string;
  name: string;
  documents: DocumentSummary[];
  members: Member[];
}

export default function WorkspacePage() {
  const [user, setUser] = useState<User | null>(null);
  const [nameInput, setNameInput] = useState('');
  const [emailInput, setEmailInput] = useState('');
  const [colorInput, setColorInput] = useState(CURSOR_COLORS[1]);
  const [loading, setLoading] = useState(false);

  const [workspace, setWorkspace] = useState<WorkspaceData | null>(null);
  const [activeDocId, setActiveDocId] = useState<string | null>(null);
  const [docTitle, setDocTitle] = useState('');
  const [docContent, setDocContent] = useState('');
  const [comments, setComments] = useState<CommentItem[]>([]);
  const [snapshots, setSnapshots] = useState<SnapshotItem[]>([]);
  const [commentText, setCommentText] = useState('');
  const [rightTab, setRightTab] = useState<'comments' | 'history' | 'members'>('comments');
  const [restoreHtml, setRestoreHtml] = useState<string | null>(null);

  const saveTimerRef = useRef<NodeJS.Timeout | null>(null);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nameInput.trim() || !emailInput.trim()) return;
    setLoading(true);
    try {
      const res = await fetch('/api/workspaces', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: nameInput.trim(),
          email: emailInput.trim().toLowerCase(),
          color: colorInput,
        }),
      });
      const data = await res.json();
      if (data.user && data.workspace) {
        setUser(data.user);
        setWorkspace(data.workspace);
        if (data.workspace.documents.length > 0) {
          setActiveDocId(data.workspace.documents[0].id);
        }
      }
    } finally {
      setLoading(false);
    }
  };

  const loadDocumentDetails = useCallback(async (id: string) => {
    const res = await fetch(`/api/documents/${id}`);
    if (!res.ok) return;
    const data = await res.json();
    setDocTitle(data.title);
    setDocContent(data.content);
    setComments(data.comments || []);
    setSnapshots(data.snapshots || []);
  }, []);

  useEffect(() => {
    if (activeDocId) {
      loadDocumentDetails(activeDocId);
    }
  }, [activeDocId, loadDocumentDetails]);

  const currentMember = workspace?.members.find((m) => m.userId === user?.id);
  const currentRole: 'VIEWER' | 'COMMENTER' | 'EDITOR' = currentMember?.role || 'EDITOR';

  const handleCreatePage = async () => {
    if (!workspace || currentRole !== 'EDITOR') return;
    const res = await fetch('/api/documents', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        workspaceId: workspace.id,
        title: `Page #${workspace.documents.length + 1}`,
      }),
    });
    const newDoc = await res.json();
    setWorkspace({
      ...workspace,
      documents: [...workspace.documents, newDoc],
    });
    setActiveDocId(newDoc.id);
  };

  const handleTitleChange = async (newTitle: string) => {
    setDocTitle(newTitle);
    if (!activeDocId || !workspace || currentRole !== 'EDITOR') return;
    setWorkspace({
      ...workspace,
      documents: workspace.documents.map((d) =>
        d.id === activeDocId ? { ...d, title: newTitle } : d
      ),
    });
    await fetch(`/api/documents/${activeDocId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: newTitle }),
    });
  };

  const handleSyncToDb = useCallback(
    (html: string) => {
      if (!activeDocId || currentRole !== 'EDITOR') return;
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(async () => {
        await fetch(`/api/documents/${activeDocId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content: html }),
        });
      }, 1200);
    },
    [activeDocId, currentRole]
  );

  const handleSaveSnapshot = async (html: string) => {
    if (!activeDocId) return;
    const label = prompt('Enter a version label (e.g. v1.0 Draft):') || undefined;
    const res = await fetch(`/api/documents/${activeDocId}/snapshots`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ label, content: html }),
    });
    const snap = await res.json();
    setSnapshots((prev) => [snap, ...prev]);
    setRightTab('history');
  };

  const handleAddComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeDocId || !user || !commentText.trim() || currentRole === 'VIEWER') return;
    const res = await fetch(`/api/documents/${activeDocId}/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ body: commentText.trim(), authorId: user.id }),
    });
    const created = await res.json();
    setComments((prev) => [created, ...prev]);
    setCommentText('');
  };

  const handleRoleChange = async (memberId: string, role: 'VIEWER' | 'COMMENTER' | 'EDITOR') => {
    if (!workspace) return;
    const res = await fetch('/api/workspaces', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ memberId, role }),
    });
    const updated = await res.json();
    setWorkspace({
      ...workspace,
      members: workspace.members.map((m) => (m.id === memberId ? updated : m)),
    });
  };

  // Login Gate
  if (!user || !workspace) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-white rounded-2xl shadow-xl p-8">
          <div className="flex items-center gap-2.5 mb-2 text-indigo-600 font-bold text-sm uppercase tracking-wider">
            <Layers className="w-5 h-5" /> FS-02 Collaborative Workspace
          </div>
          <h1 className="text-2xl font-bold text-slate-900 mb-2">Join Live Workspace</h1>
          <p className="text-sm text-slate-600 mb-6">
            Sign in with a name and email. Open a second browser tab with another name to test live CRDT cursor syncing.
          </p>
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Display Name</label>
              <input
                type="text"
                required
                placeholder="e.g. Achint Raghuwanshi"
                value={nameInput}
                onChange={(e) => setNameInput(e.target.value)}
                className="w-full px-3.5 py-2 border border-slate-300 rounded-lg text-sm text-slate-900 focus:ring-2 focus:ring-indigo-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Work Email</label>
              <input
                type="email"
                required
                placeholder="achint@example.com"
                value={emailInput}
                onChange={(e) => setEmailInput(e.target.value)}
                className="w-full px-3.5 py-2 border border-slate-300 rounded-lg text-sm text-slate-900 focus:ring-2 focus:ring-indigo-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">Cursor Color</label>
              <div className="flex gap-2">
                {CURSOR_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setColorInput(c)}
                    style={{ backgroundColor: c }}
                    className={`w-7 h-7 rounded-full transition ${
                      colorInput === c ? 'ring-2 ring-offset-2 ring-slate-900 scale-110' : ''
                    }`}
                  />
                ))}
              </div>
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-lg text-sm transition disabled:opacity-50"
            >
              {loading ? 'Connecting to Workspace...' : 'Enter Workspace'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col md:flex-row">
      {/* Left Sidebar: Workspace Pages */}
      <aside className="w-full md:w-64 bg-slate-900 text-slate-200 flex flex-col justify-between p-4 shrink-0">
        <div>
          <div className="flex items-center gap-2 font-bold text-white text-base pb-4 border-b border-slate-800">
            <Layers className="w-5 h-5 text-indigo-400" />
            <span className="truncate">{workspace.name}</span>
          </div>

          <div className="mt-4 flex items-center justify-between text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
            <span>Pages</span>
            {currentRole === 'EDITOR' && (
              <button
                onClick={handleCreatePage}
                className="p-1 hover:bg-slate-800 rounded text-slate-300"
                title="New Page"
              >
                <Plus className="w-4 h-4" />
              </button>
            )}
          </div>

          <nav className="space-y-1">
            {workspace.documents.map((doc) => (
              <button
                key={doc.id}
                onClick={() => setActiveDocId(doc.id)}
                className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-left transition ${
                  doc.id === activeDocId
                    ? 'bg-indigo-600 text-white font-medium'
                    : 'text-slate-300 hover:bg-slate-800'
                }`}
              >
                <FileText className="w-4 h-4 shrink-0" />
                <span className="truncate">{doc.title}</span>
              </button>
            ))}
          </nav>
        </div>

        {/* Logged-in User Footer */}
        <div className="pt-4 border-t border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5 min-w-0">
            <div
              style={{ backgroundColor: user.color }}
              className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0"
            >
              {user.name.slice(0, 2).toUpperCase()}
            </div>
            <div className="truncate">
              <div className="text-sm font-medium text-white truncate">{user.name}</div>
              <div className="text-xs text-slate-400 truncate">{currentRole}</div>
            </div>
          </div>
          <button
            onClick={() => setUser(null)}
            className="p-1.5 text-slate-400 hover:text-white rounded"
            title="Switch User"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </aside>

      {/* Main Editor Column */}
      <main className="flex-1 p-6 max-w-4xl mx-auto w-full">
        {activeDocId ? (
          <>
            <input
              type="text"
              disabled={currentRole !== 'EDITOR'}
              value={docTitle}
              onChange={(e) => handleTitleChange(e.target.value)}
              className="w-full text-3xl font-bold text-slate-900 bg-transparent border-none outline-none mb-4 placeholder-slate-400"
              placeholder="Document Title..."
            />
            <CollaborativeEditor
              key={activeDocId}
              documentId={activeDocId}
              initialContent={docContent}
              currentUser={user}
              role={currentRole}
              onSaveSnapshot={handleSaveSnapshot}
              onSyncToDb={handleSyncToDb}
              restoreHtml={restoreHtml}
              onRestored={() => setRestoreHtml(null)}
            />
          </>
        ) : (
          <div className="text-slate-500">Select or create a page to start collaborating.</div>
        )}
      </main>

      {/* Right Collaboration Panel: Comments, Version History, Permissions */}
      <aside className="w-full md:w-80 bg-white border-l border-slate-200 flex flex-col shrink-0">
        <div className="grid grid-cols-3 border-b border-slate-200 text-xs font-semibold">
          <button
            onClick={() => setRightTab('comments')}
            className={`py-3 flex items-center justify-center gap-1 border-b-2 transition ${
              rightTab === 'comments'
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <MessageSquare className="w-3.5 h-3.5" /> Comments
          </button>
          <button
            onClick={() => setRightTab('history')}
            className={`py-3 flex items-center justify-center gap-1 border-b-2 transition ${
              rightTab === 'history'
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <History className="w-3.5 h-3.5" /> Versions
          </button>
          <button
            onClick={() => setRightTab('members')}
            className={`py-3 flex items-center justify-center gap-1 border-b-2 transition ${
              rightTab === 'members'
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Users className="w-3.5 h-3.5" /> Access
          </button>
        </div>

        <div className="p-4 flex-1 overflow-y-auto space-y-4">
          {rightTab === 'comments' && (
            <>
              {currentRole !== 'VIEWER' ? (
                <form onSubmit={handleAddComment} className="flex gap-2">
                  <input
                    type="text"
                    value={commentText}
                    onChange={(e) => setCommentText(e.target.value)}
                    placeholder="Add a comment..."
                    className="flex-1 px-3 py-1.5 text-sm border border-slate-300 rounded-lg text-slate-900 outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                  <button
                    type="submit"
                    className="p-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
                  >
                    <Send className="w-4 h-4" />
                  </button>
                </form>
              ) : (
                <p className="text-xs text-slate-500 bg-slate-50 p-2.5 rounded">
                  Viewers cannot post comments.
                </p>
              )}

              <div className="space-y-3">
                {comments.length === 0 && (
                  <p className="text-xs text-slate-400 text-center py-6">No comments yet.</p>
                )}
                {comments.map((c) => (
                  <div key={c.id} className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-semibold text-slate-800">{c.author.name}</span>
                      <span className="text-[10px] text-slate-400">
                        {new Date(c.createdAt).toLocaleTimeString()}
                      </span>
                    </div>
                    <p className="text-sm text-slate-700">{c.body}</p>
                  </div>
                ))}
              </div>
            </>
          )}

          {rightTab === 'history' && (
            <div className="space-y-3">
              {snapshots.length === 0 && (
                <p className="text-xs text-slate-400 text-center py-6">
                  Click &ldquo;Save Version Snapshot&rdquo; in the toolbar to create a restore point.
                </p>
              )}
              {snapshots.map((s) => (
                <div key={s.id} className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                  <div className="text-sm font-semibold text-slate-800">{s.label}</div>
                  <div className="text-xs text-slate-500 mb-2">
                    {new Date(s.createdAt).toLocaleString()}
                  </div>
                  {currentRole === 'EDITOR' && (
                    <button
                      onClick={() => setRestoreHtml(s.content)}
                      className="inline-flex items-center gap-1 text-xs font-medium text-indigo-600 hover:text-indigo-800"
                    >
                      <RotateCcw className="w-3.5 h-3.5" /> Restore this version
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

          {rightTab === 'members' && (
            <div className="space-y-3">
              <p className="text-xs text-slate-500">
                Manage workspace permissions (`VIEWER`, `COMMENTER`, `EDITOR`):
              </p>
              {workspace.members.map((m) => (
                <div
                  key={m.id}
                  className="flex items-center justify-between p-2.5 bg-slate-50 rounded-lg border border-slate-200"
                >
                  <div className="min-w-0 pr-2">
                    <div className="text-xs font-semibold text-slate-800 truncate">{m.user.name}</div>
                    <div className="text-[11px] text-slate-500 truncate">{m.user.email}</div>
                  </div>
                  <select
                    value={m.role}
                    onChange={(e) =>
                      handleRoleChange(m.id, e.target.value as 'VIEWER' | 'COMMENTER' | 'EDITOR')
                    }
                    className="text-xs border border-slate-300 rounded px-2 py-1 bg-white text-slate-800"
                  >
                    <option value="EDITOR">EDITOR</option>
                    <option value="COMMENTER">COMMENTER</option>
                    <option value="VIEWER">VIEWER</option>
                  </select>
                </div>
              ))}
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}
