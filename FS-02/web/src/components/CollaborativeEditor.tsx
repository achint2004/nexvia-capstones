'use client';

import React, { useEffect, useMemo, useState } from 'react';
import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Collaboration from '@tiptap/extension-collaboration';
import CollaborationCursor from '@tiptap/extension-collaboration-cursor';
import {
  Bold,
  Italic,
  Heading1,
  Heading2,
  List,
  ListOrdered,
  Code,
  Quote,
  History,
  Save,
  Wifi,
  WifiOff,
} from 'lucide-react';

interface OnlineUser {
  clientId: number;
  name: string;
  color: string;
}

interface Props {
  documentId: string;
  initialContent: string;
  currentUser: { id: string; name: string; color: string };
  role: 'VIEWER' | 'COMMENTER' | 'EDITOR';
  onSaveSnapshot: (html: string) => void;
  onSyncToDb: (html: string) => void;
  restoreHtml: string | null;
  onRestored: () => void;
}

export default function CollaborativeEditor({
  documentId,
  initialContent,
  currentUser,
  role,
  onSaveSnapshot,
  onSyncToDb,
  restoreHtml,
  onRestored,
}: Props) {
  const [status, setStatus] = useState<'connecting' | 'connected' | 'disconnected'>('connecting');
  const [onlineUsers, setOnlineUsers] = useState<OnlineUser[]>([]);
  const [latencyMs, setLatencyMs] = useState<number | null>(null);

  const ydoc = useMemo(() => new Y.Doc(), [documentId]);

  const provider = useMemo(() => {
    const wsUrl = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:1234';
    return new WebsocketProvider(wsUrl, `doc-${documentId}`, ydoc);
  }, [documentId, ydoc]);

  useEffect(() => {
    const handleStatus = (event: { status: 'connecting' | 'connected' | 'disconnected' }) => {
      setStatus(event.status);
    };
    provider.on('status', handleStatus);

    provider.awareness.setLocalStateField('user', {
      name: currentUser.name,
      color: currentUser.color,
    });

    const updateUsers = () => {
      const states = provider.awareness.getStates();
      const list: OnlineUser[] = [];
      states.forEach((state, clientId) => {
        if (state.user) {
          list.push({
            clientId,
            name: state.user.name,
            color: state.user.color,
          });
        }
      });
      setOnlineUsers(list);
    };

    provider.awareness.on('change', updateUsers);
    updateUsers();

    return () => {
      provider.off('status', handleStatus);
      provider.awareness.off('change', updateUsers);
      provider.destroy();
      ydoc.destroy();
    };
  }, [provider, ydoc, currentUser]);

  const editor = useEditor(
    {
      immediatelyRender: false,
      editable: role === 'EDITOR',
      extensions: [
        StarterKit.configure({
          history: false, // Yjs handles collaborative undo/redo
        }),
        Collaboration.configure({
          document: ydoc,
        }),
        CollaborationCursor.configure({
          provider,
          user: {
            name: currentUser.name,
            color: currentUser.color,
          },
        }),
      ],
      onUpdate: ({ editor: ed }) => {
        const start = performance.now();
        requestAnimationFrame(() => {
          setLatencyMs(Math.max(1, Math.round(performance.now() - start)));
        });
        onSyncToDb(ed.getHTML());
      },
    },
    [ydoc, provider, role]
  );

  // Seed initial DB content only if Yjs doc is empty after sync
  useEffect(() => {
    if (!editor) return;
    const handleSync = (isSynced: boolean) => {
      if (isSynced && editor.isEmpty && initialContent && initialContent !== '<p></p>') {
        editor.commands.setContent(initialContent);
      }
    };
    provider.on('sync', handleSync);
    return () => {
      provider.off('sync', handleSync);
    };
  }, [editor, provider, initialContent]);

  // Handle restoring a version snapshot
  useEffect(() => {
    if (editor && restoreHtml !== null) {
      editor.commands.setContent(restoreHtml);
      onSyncToDb(restoreHtml);
      onRestored();
    }
  }, [editor, restoreHtml, onSyncToDb, onRestored]);

  if (!editor) {
    return <div className="p-8 text-slate-400">Initializing collaborative editor...</div>;
  }

  return (
    <div className="flex flex-col border border-slate-200 rounded-xl bg-white shadow-sm overflow-hidden">
      {/* Top Status & Presence Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 bg-slate-50 border-b border-slate-200">
        <div className="flex items-center gap-2 text-xs font-medium">
          {status === 'connected' ? (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-800">
              <Wifi className="w-3.5 h-3.5" /> Live CRDT Synced
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-100 text-amber-800">
              <WifiOff className="w-3.5 h-3.5" /> {status}
            </span>
          )}
          {latencyMs !== null && (
            <span className="text-slate-500">Local render: {latencyMs}ms</span>
          )}
          <span className="px-2 py-0.5 rounded bg-slate-200 text-slate-700">
            Role: {role}
          </span>
        </div>

        {/* Active Presence Avatars */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500">Active ({onlineUsers.length}):</span>
          <div className="flex -space-x-1.5">
            {onlineUsers.map((u) => (
              <div
                key={u.clientId}
                title={u.name}
                style={{ backgroundColor: u.color }}
                className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold ring-2 ring-white shadow-xs"
              >
                {u.name.slice(0, 2).toUpperCase()}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Formatting Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2 border-b border-slate-200 bg-white">
        <div className="flex items-center gap-1">
          <button
            type="button"
            disabled={role !== 'EDITOR'}
            onClick={() => editor.chain().focus().toggleBold().run()}
            className={`p-1.5 rounded hover:bg-slate-100 disabled:opacity-40 ${
              editor.isActive('bold') ? 'bg-slate-200 text-blue-600' : 'text-slate-700'
            }`}
            title="Bold"
          >
            <Bold className="w-4 h-4" />
          </button>
          <button
            type="button"
            disabled={role !== 'EDITOR'}
            onClick={() => editor.chain().focus().toggleItalic().run()}
            className={`p-1.5 rounded hover:bg-slate-100 disabled:opacity-40 ${
              editor.isActive('italic') ? 'bg-slate-200 text-blue-600' : 'text-slate-700'
            }`}
            title="Italic"
          >
            <Italic className="w-4 h-4" />
          </button>
          <button
            type="button"
            disabled={role !== 'EDITOR'}
            onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
            className={`p-1.5 rounded hover:bg-slate-100 disabled:opacity-40 ${
              editor.isActive('heading', { level: 1 }) ? 'bg-slate-200 text-blue-600' : 'text-slate-700'
            }`}
            title="Heading 1"
          >
            <Heading1 className="w-4 h-4" />
          </button>
          <button
            type="button"
            disabled={role !== 'EDITOR'}
            onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
            className={`p-1.5 rounded hover:bg-slate-100 disabled:opacity-40 ${
              editor.isActive('heading', { level: 2 }) ? 'bg-slate-200 text-blue-600' : 'text-slate-700'
            }`}
            title="Heading 2"
          >
            <Heading2 className="w-4 h-4" />
          </button>
          <button
            type="button"
            disabled={role !== 'EDITOR'}
            onClick={() => editor.chain().focus().toggleBulletList().run()}
            className={`p-1.5 rounded hover:bg-slate-100 disabled:opacity-40 ${
              editor.isActive('bulletList') ? 'bg-slate-200 text-blue-600' : 'text-slate-700'
            }`}
            title="Bullet List"
          >
            <List className="w-4 h-4" />
          </button>
          <button
            type="button"
            disabled={role !== 'EDITOR'}
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
            className={`p-1.5 rounded hover:bg-slate-100 disabled:opacity-40 ${
              editor.isActive('orderedList') ? 'bg-slate-200 text-blue-600' : 'text-slate-700'
            }`}
            title="Numbered List"
          >
            <ListOrdered className="w-4 h-4" />
          </button>
          <button
            type="button"
            disabled={role !== 'EDITOR'}
            onClick={() => editor.chain().focus().toggleBlockquote().run()}
            className={`p-1.5 rounded hover:bg-slate-100 disabled:opacity-40 ${
              editor.isActive('blockquote') ? 'bg-slate-200 text-blue-600' : 'text-slate-700'
            }`}
            title="Quote"
          >
            <Quote className="w-4 h-4" />
          </button>
          <button
            type="button"
            disabled={role !== 'EDITOR'}
            onClick={() => editor.chain().focus().toggleCode().run()}
            className={`p-1.5 rounded hover:bg-slate-100 disabled:opacity-40 ${
              editor.isActive('code') ? 'bg-slate-200 text-blue-600' : 'text-slate-700'
            }`}
            title="Inline Code"
          >
            <Code className="w-4 h-4" />
          </button>
        </div>

        {role === 'EDITOR' && (
          <button
            type="button"
            onClick={() => onSaveSnapshot(editor.getHTML())}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition"
          >
            <History className="w-3.5 h-3.5" /> Save Version Snapshot
          </button>
        )}
      </div>

      {/* Main Editable Canvas */}
      <div className="p-6 bg-white text-slate-900">
        {role !== 'EDITOR' && (
          <div className="mb-4 px-3 py-2 text-xs bg-amber-50 border border-amber-200 text-amber-800 rounded-lg">
            Read-only mode ({role}). Switch your role to <strong>EDITOR</strong> in the sidebar to modify document text.
          </div>
        )}
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}
