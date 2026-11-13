'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ReactFlow, {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  Connection,
  Edge,
  EdgeChange,
  Node,
  NodeChange,
  ReactFlowProvider,
  useReactFlow,
  useViewport,
  MarkerType,
  ConnectionLineType,
  Panel,
} from 'reactflow';
import 'reactflow/dist/style.css';
import {
  Play, Square, Globe, Database, Terminal, Code2, Hash,
  Container as Docker, Slack, Mail, GitBranch, Clock, RotateCcw, Variable,
  GitMerge, Split, FileText, PenLine, Workflow, Webhook, Hourglass, Inbox, BellRing, Sparkles,
  Save, TestTube2, Wand2, Plus, Minus, Maximize, Settings, Trash2, X, AlertCircle, Search, ChevronDown,
} from 'lucide-react';
import { nodeTypes as importedNodeTypes } from './nodes';
import { propertiesComponents } from './properties';
import { validateFlow, autoLayout, FlowValidationError } from '@/lib/flow-validator';

// ---------- Node palette ----------
const PALETTE = [
  { category: 'Flow Control', items: [
    { type: 'startNode', label: 'Start', nodeType: 'start', icon: Play, color: '#10B981' },
    { type: 'endNode', label: 'End', nodeType: 'end', icon: Square, color: '#EF4444' },
    { type: 'conditionNode', label: 'Condition', nodeType: 'condition', icon: GitBranch, color: '#EC4899' },
    { type: 'loopNode', label: 'Loop', nodeType: 'loop', icon: RotateCcw, color: '#6366F1' },
    { type: 'delayNode', label: 'Delay', nodeType: 'delay', icon: Clock, color: '#6B7280' },
    { type: 'transformNode', label: 'Transform', nodeType: 'transform', icon: Variable, color: '#14B8A6' },
    { type: 'switchNode', label: 'Switch', nodeType: 'switch', icon: Split, color: '#D946EF' },
    { type: 'mergeNode', label: 'Merge', nodeType: 'merge', icon: GitMerge, color: '#0891B2' },
  ]},
  { category: 'Executors', items: [
    { type: 'httpNode', label: 'HTTP', nodeType: 'http', icon: Globe, color: '#3B82F6' },
    { type: 'databaseNode', label: 'Database', nodeType: 'database', icon: Database, color: '#06B6D4' },
    { type: 'shellNode', label: 'Shell', nodeType: 'shell', icon: Terminal, color: '#F59E0B' },
    { type: 'pythonNode', label: 'Python', nodeType: 'python', icon: Code2, color: '#EAB308' },
    { type: 'nodejsNode', label: 'Node.js', nodeType: 'nodejs', icon: Hash, color: '#22C55E' },
    { type: 'dockerNode', label: 'Docker', nodeType: 'docker', icon: Docker, color: '#0EA5E9' },
  ]},
  { category: 'AI', items: [
    { type: 'aiNode', label: 'AI', nodeType: 'ai', icon: Sparkles, color: '#8B5CF6' },
  ]},
  { category: 'Notifications', items: [
    { type: 'slackNode', label: 'Slack', nodeType: 'slack', icon: Slack, color: '#A855F7' },
    { type: 'emailNode', label: 'Email', nodeType: 'email', icon: Mail, color: '#F97316' },
    { type: 'webhookNode', label: 'Webhook', nodeType: 'webhook_out', icon: Webhook, color: '#F43F5E' },
  ]},
  { category: 'Utilities', items: [
    { type: 'logNode', label: 'Log', nodeType: 'log', icon: FileText, color: '#78716C' },
    { type: 'setVarNode', label: 'Set Variable', nodeType: 'set_variable', icon: PenLine, color: '#0D9488' },
    { type: 'subflowNode', label: 'Sub-flow', nodeType: 'subflow', icon: Workflow, color: '#7C3AED' },
    { type: 'waitWebhookNode', label: 'Wait Webhook', nodeType: 'wait_webhook', icon: Hourglass, color: '#FB923C' },
    { type: 'enqueueNode', label: 'Enqueue', nodeType: 'enqueue', icon: Inbox, color: '#0EA5E9' },
    { type: 'notifyNode', label: 'Notify (push)', nodeType: 'notify', icon: BellRing, color: '#F59E0B' },
  ]},
];

export interface FlowCanvasProps {
  initialNodes?: Node[];
  initialEdges?: Edge[];
  onSave?: (nodes: Node[], edges: Edge[], name: string, description: string) => Promise<void>;
  onTest?: (nodes: Node[], edges: Edge[]) => Promise<void>;
  initialName?: string;
  initialDescription?: string;
  readOnly?: boolean;
  saving?: boolean;
  testing?: boolean;
  saveLabel?: string;
  showTestButton?: boolean;
}

// Edges read as technical-drawing connectors. Thinner stroke, angular
// rather than soft, coloured by edge condition so the eye catches
// failure branches immediately.
const DEFAULT_EDGE_STYLE = {
  style: { stroke: '#8d8d8d', strokeWidth: 1.5 },
  markerEnd: { type: MarkerType.ArrowClosed, color: '#8d8d8d', width: 14, height: 14 },
  type: 'default' as const,
};

// Carbon support colours. Plain success edges stay neutral grey so only
// the branches that differ draw the eye.
const CONDITION_COLORS: Record<string, string> = {
  ON_SUCCESS: '#8d8d8d',
  ON_FAILURE: '#da1e28',
  ON_ALWAYS: '#8a3ffc',
};

const MONO = "'IBM Plex Sans Thai', 'IBM Plex Sans', system-ui, sans-serif";

function styleForCondition(condition?: string) {
  const cond = condition ?? 'ON_SUCCESS';
  const color = CONDITION_COLORS[cond] ?? '#94A3B8';
  const isDefault = cond === 'ON_SUCCESS';
  return {
    style: {
      stroke: color,
      strokeWidth: 1.5,
      strokeDasharray: cond === 'ON_FAILURE' ? '5 3' : undefined,
    },
    markerEnd: { type: MarkerType.ArrowClosed, color, width: 14, height: 14 },
    type: 'default' as const,
    animated: cond === 'ON_ALWAYS',
    label: isDefault ? undefined : cond === 'ON_FAILURE' ? 'on fail' : 'always',
    labelStyle: { fill: color, fontSize: 11, fontWeight: 600, fontFamily: MONO },
    labelBgStyle: { fill: 'var(--flow-canvas-bg)' },
    labelBgPadding: [4, 2] as [number, number],
    labelBgBorderRadius: 0,
  };
}

function InnerFlow({
  initialNodes = [],
  initialEdges = [],
  onSave,
  onTest,
  initialName = '',
  initialDescription = '',
  readOnly = false,
  saving = false,
  testing = false,
  saveLabel = 'Save Flow',
  showTestButton = true,
}: FlowCanvasProps) {
  const [nodes, setNodes] = useState<Node[]>(initialNodes);
  const [edges, setEdges] = useState<Edge[]>(initialEdges);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [name, setName] = useState(initialName);
  const [description, setDescription] = useState(initialDescription);
  const [errors, setErrors] = useState<FlowValidationError[]>([]);
  const [editingEdgeId, setEditingEdgeId] = useState<string | null>(null);
  // Installed plugins become a fifth palette category ("Plugins") appended
  // after the built-ins. Fetched once on mount; a UI refresh or install
  // toast should re-trigger a fetch.
  const [pluginCategory, setPluginCategory] = useState<{ category: string; items: any[] } | null>(null);
  useEffect(() => {
    fetch('/runloop/api/plugins')
      .then((r) => r.json())
      .then((d) => {
        const items = (d.data || [])
          .filter((p: any) => p.enabled)
          .map((p: any) => ({
            type: `plugin:${p.name}`,                  // ReactFlow node type — custom renderer decides visuals
            label: p.manifest?.displayName || p.name,
            nodeType: p.name,                          // engine dispatch key
            // Icons come from lucide — for now use a generic block; advanced: map manifest.icon
            icon: GitBranch,                           // placeholder icon
            color: p.manifest?.color || '#6B7280',
            isPlugin: true,
            manifest: p.manifest,
          }));
        if (items.length > 0) setPluginCategory({ category: 'Plugins', items });
      })
      .catch(() => {});
  }, []);
  // Final palette = built-ins + Plugins (if any)
  const mergedPalette = pluginCategory ? [...PALETTE, pluginCategory] : PALETTE;

  const reactFlow = useReactFlow();
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Sync initial state when parent loads async data
  useEffect(() => {
    if (initialNodes.length > 0) setNodes(initialNodes);
    if (initialEdges.length > 0) setEdges(initialEdges);
    if (initialName) setName(initialName);
    if (initialDescription) setDescription(initialDescription);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialNodes.length, initialEdges.length]);

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => setNodes((nds) => applyNodeChanges(changes, nds)),
    [],
  );
  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => setEdges((eds) => applyEdgeChanges(changes, eds)),
    [],
  );

  const onConnect = useCallback((connection: Connection) => {
    setEdges((eds) => addEdge(
      {
        ...connection,
        id: `edge_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        data: { condition: 'ON_SUCCESS' },
        ...styleForCondition('ON_SUCCESS'),
      },
      eds,
    ));
  }, []);

  const onNodeClick = useCallback((_: any, node: Node) => {
    setSelectedNodeId(node.id);
    setEditingEdgeId(null);
  }, []);

  const onEdgeDoubleClick = useCallback((_: any, edge: Edge) => {
    setEditingEdgeId(edge.id);
    setSelectedNodeId(null);
  }, []);

  const onPaneClick = useCallback(() => {
    setSelectedNodeId(null);
    setEditingEdgeId(null);
  }, []);

  // Drag from palette
  const onDragStart = (event: React.DragEvent, paletteItem: any) => {
    event.dataTransfer.setData('application/reactflow', JSON.stringify(paletteItem));
    event.dataTransfer.effectAllowed = 'move';
  };

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  const onDrop = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    const raw = event.dataTransfer.getData('application/reactflow');
    if (!raw) return;
    const palette = JSON.parse(raw);
    const bounds = wrapperRef.current?.getBoundingClientRect();
    if (!bounds) return;
    const position = reactFlow.project({
      x: event.clientX - bounds.left,
      y: event.clientY - bounds.top,
    });
    const id = `${palette.nodeType}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    // Plugin items drop as the generic `pluginNode` renderer so we don't
    // need to register a ReactFlow node type per installed plugin. The
    // engine routes on `data.type` (the plugin's logical name).
    const isPlugin = palette.isPlugin === true;
    const newNode: Node = {
      id,
      type: isPlugin ? 'pluginNode' : palette.type,
      position,
      data: {
        label: palette.label,
        type: palette.nodeType,
        config: {},
        pluginColor: isPlugin ? palette.color : undefined,
        manifest: isPlugin ? palette.manifest : undefined,
      },
    };
    setNodes((nds) => [...nds, newNode]);
    setSelectedNodeId(id);
  }, [reactFlow]);

  const deleteSelectedNode = useCallback(() => {
    if (!selectedNodeId) return;
    setNodes((nds) => nds.filter((n) => n.id !== selectedNodeId));
    setEdges((eds) => eds.filter((e) => e.source !== selectedNodeId && e.target !== selectedNodeId));
    setSelectedNodeId(null);
  }, [selectedNodeId]);

  const updateSelectedNodeConfig = useCallback((config: Record<string, any>) => {
    setNodes((nds) => nds.map((n) => n.id === selectedNodeId
      ? { ...n, data: { ...n.data, config, label: config.name || n.data.label } }
      : n,
    ));
  }, [selectedNodeId]);

  const updateEdgeCondition = useCallback((edgeId: string, condition: string) => {
    setEdges((eds) => eds.map((e) => e.id === edgeId
      ? { ...e, data: { ...e.data, condition }, ...styleForCondition(condition) }
      : e,
    ));
  }, []);

  const deleteEdge = useCallback((edgeId: string) => {
    setEdges((eds) => eds.filter((e) => e.id !== edgeId));
    setEditingEdgeId(null);
  }, []);

  const handleAutoLayout = useCallback(() => {
    const positions = autoLayout(
      nodes.map((n) => ({ id: n.id, position: n.position })),
      edges.map((e) => ({ source: e.source, target: e.target })),
    );
    const byId = new Map(positions.map((p) => [p.id, p.position]));
    setNodes((nds) => nds.map((n) => byId.has(n.id) ? { ...n, position: byId.get(n.id)! } : n));
    setTimeout(() => reactFlow.fitView({ padding: 0.2 }), 50);
  }, [nodes, edges, reactFlow]);

  const handleSave = useCallback(async () => {
    if (!onSave) return;
    if (!name.trim()) {
      setErrors([{ code: 'NO_NAME', message: 'Flow name is required' }]);
      return;
    }
    const validation = validateFlow(
      nodes.map((n) => ({ id: n.id, type: n.type || 'default', data: n.data })),
      edges.map((e) => ({ id: e.id, source: e.source, target: e.target })),
    );
    if (validation.length > 0) {
      setErrors(validation);
      return;
    }
    setErrors([]);
    await onSave(nodes, edges, name.trim(), description.trim());
  }, [onSave, name, description, nodes, edges]);

  const handleTest = useCallback(async () => {
    if (!onTest) return;
    await onTest(nodes, edges);
  }, [onTest, nodes, edges]);

  // Keyboard shortcuts
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault();
        handleSave();
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        const target = e.target as HTMLElement;
        if (target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA') return;
        if (selectedNodeId) {
          e.preventDefault();
          deleteSelectedNode();
        }
      }
      if (e.key === 'Escape') {
        setSelectedNodeId(null);
        setEditingEdgeId(null);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [handleSave, deleteSelectedNode, selectedNodeId]);

  const selectedNode = useMemo(
    () => nodes.find((n) => n.id === selectedNodeId) || null,
    [nodes, selectedNodeId],
  );

  const PropertiesComponent = selectedNode && selectedNode.data?.type
    ? propertiesComponents[selectedNode.data.type as string]
    : null;

  const editingEdge = useMemo(
    () => edges.find((e) => e.id === editingEdgeId) || null,
    [edges, editingEdgeId],
  );

  // Palette UI state
  const [paletteQuery, setPaletteQuery] = useState('');
  const [collapsedCats, setCollapsedCats] = useState<Record<string, boolean>>({});
  const filteredPalette = useMemo(() => {
    const q = paletteQuery.trim().toLowerCase();
    if (!q) return mergedPalette;
    return mergedPalette
      .map((cat) => ({
        ...cat,
        items: cat.items.filter(
          (i: any) => i.label.toLowerCase().includes(q) || i.nodeType.toLowerCase().includes(q),
        ),
      }))
      .filter((cat) => cat.items.length > 0);
  }, [paletteQuery, mergedPalette]);

  // Properties panel tab state
  const [propsTab, setPropsTab] = useState<'config' | 'retry' | 'errors'>('config');
  useEffect(() => { setPropsTab('config'); }, [selectedNodeId]);

  const selectedPaletteMeta = useMemo(() => {
    if (!selectedNode?.data?.type) return null;
    return mergedPalette.flatMap((c) => c.items).find((i: any) => i.nodeType === selectedNode.data.type) || null;
  }, [selectedNode, mergedPalette]);

  return (
    <div className="flex flex-col h-full" style={{ fontFamily: "'IBM Plex Sans Thai', 'IBM Plex Sans', sans-serif" }}>
      {/* ===== Toolbar ===== */}
      <div
        className="flex items-center justify-between px-4 py-2.5 border-b"
        style={{ borderColor: 'var(--t-border)', background: 'var(--t-panel)' }}
      >
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <span
            className="flex-shrink-0"
            style={{ fontSize: 12, color: 'var(--t-text-secondary)' }}
          >
            Flow
          </span>
          <input
            type="text"
            placeholder="flow name…"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={readOnly}
            style={{
              background: 'transparent',
              color: 'var(--t-text)',
              border: 'none',
              outline: 'none',
              fontFamily: MONO,
              fontSize: 14,
              fontWeight: 600,
              width: 260,
              minWidth: 120,
              flexShrink: 1,
            }}
          />
          <input
            type="text"
            placeholder="description (optional)"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            disabled={readOnly}
            className="hidden xl:block"
            title={description}
            style={{
              minWidth: 0,
              textOverflow: 'ellipsis',
              background: 'transparent',
              color: 'var(--t-text-muted)',
              border: 'none',
              outline: 'none',
              fontSize: 12,
              fontFamily: MONO,
              flex: 1,
              letterSpacing: 0,
            }}
          />
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <span
            className="hidden lg:inline whitespace-nowrap"
            style={{ fontSize: 12, color: 'var(--t-text-secondary)', fontVariantNumeric: 'tabular-nums' }}
          >
            {nodes.length} nodes · {edges.length} edges
          </span>
          <button
            onClick={handleAutoLayout}
            className="flex items-center gap-2 whitespace-nowrap hover:bg-[var(--t-panel-hover)]"
            style={{
              height: 32,
              padding: '0 12px',
              background: 'transparent',
              border: 'none',
              color: 'var(--t-accent)',
              fontSize: 14,
              borderRadius: 0,
            }}
            title="Auto-layout"
          >
            <Wand2 className="w-4 h-4" />
            <span className="hidden lg:inline">Auto-layout</span>
          </button>
          {showTestButton && onTest && !readOnly && (
            <button
              onClick={handleTest}
              disabled={testing}
              className="flex items-center gap-1.5 disabled:opacity-50"
              style={{
                padding: '6px 10px',
                background: 'color-mix(in srgb, #10B981 12%, transparent)',
                border: '1px solid color-mix(in srgb, #10B981 40%, transparent)',
                color: '#10B981',
                fontFamily: MONO,
                fontSize: 11,
                letterSpacing: 0,
                borderRadius: 2,
              }}
            >
              <TestTube2 className="w-3.5 h-3.5" />
              {testing ? 'testing…' : 'test run'}
            </button>
          )}
          {!readOnly && onSave && (
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-1.5 disabled:opacity-50"
              style={{
                height: 32,
                padding: '0 16px 0 12px',
                background: 'var(--t-accent)',
                color: '#fff',
                fontSize: 14,
                borderRadius: 0,
              }}
            >
              <Save className="w-4 h-4" />
              {saving ? 'Saving…' : saveLabel}
            </button>
          )}
        </div>
      </div>

      {/* ===== Error Bar ===== */}
      {errors.length > 0 && (
        <div className="px-4 py-2 flex items-start gap-2" style={{ background: '#EF444415', borderBottom: '1px solid #EF444440' }}>
          <AlertCircle className="w-4 h-4 mt-0.5" style={{ color: '#EF4444' }} />
          <div className="flex-1 text-xs" style={{ color: '#EF4444' }}>
            {errors.map((err, i) => <div key={i}>{err.message}</div>)}
          </div>
          <button onClick={() => setErrors([])} style={{ color: '#EF4444' }}>
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* ===== Body ===== */}
      <div className="flex flex-1 overflow-hidden">
        {/* ===== LEFT: Palette ===== */}
        {!readOnly && (
          <div
            className="flex-shrink-0 flex flex-col"
            style={{
              width: 224,
              background: 'var(--t-panel)',
              borderRight: '1px solid var(--t-border)',
            }}
          >
            {/* Sticky search header */}
            <div
              className="px-3 pt-3 pb-2.5"
              style={{ borderBottom: '1px solid var(--t-border)' }}
            >
              <div className="flex items-center justify-between mb-2">
                <p
                  style={{
                    fontFamily: MONO,
                    fontSize: 10,
                    color: 'var(--t-text-muted)',
                    letterSpacing: 0,
                  }}
                >
                  Nodes
                </p>
                <span
                  style={{
                    color: 'var(--tag-gray-text)',
                    background: 'var(--tag-gray-bg)',
                    padding: '0 8px',
                    borderRadius: 24,
                    fontSize: 12,
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {mergedPalette.reduce((n, c) => n + c.items.length, 0)}
                </span>
              </div>
              <div
                className="relative flex items-center"
                style={{
                  background: 'var(--t-input)',
                  border: '1px solid var(--t-border)',
                  borderRadius: 2,
                }}
              >
                <Search
                  className="w-3.5 h-3.5 absolute left-2.5"
                  style={{ color: 'var(--t-text-muted)' }}
                />
                <input
                  type="text"
                  value={paletteQuery}
                  onChange={(e) => setPaletteQuery(e.target.value)}
                  placeholder="Search nodes"
                  className="w-full bg-transparent pl-8 pr-7 py-1.5 outline-none"
                  style={{ color: 'var(--t-text)', fontFamily: MONO, fontSize: 11.5 }}
                />
                {paletteQuery && (
                  <button
                    onClick={() => setPaletteQuery('')}
                    className="absolute right-2 p-0.5 hover:opacity-80"
                    style={{ color: 'var(--t-text-muted)' }}
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>
            </div>

            {/* Scrollable list */}
            <div className="flex-1 overflow-y-auto px-2 py-2.5">
              {filteredPalette.length === 0 && (
                <div
                  className="text-center text-[11px] py-6"
                  style={{ color: 'var(--t-text-muted)' }}
                >
                  No nodes match “{paletteQuery}”
                </div>
              )}
              {filteredPalette.map((category) => {
                const isCollapsed = !paletteQuery && collapsedCats[category.category];
                return (
                  <div key={category.category} className="mb-1">
                    <button
                      onClick={() =>
                        setCollapsedCats((s) => ({
                          ...s,
                          [category.category]: !s[category.category],
                        }))
                      }
                      className="w-full flex items-center justify-between px-2 py-1.5 group"
                      style={{ color: 'var(--t-text-muted)' }}
                    >
                      <div className="flex items-center gap-1.5">
                        <ChevronDown
                          className="w-3 h-3 transition-transform"
                          style={{ transform: isCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)' }}
                        />
                        <span
                          style={{
                            fontFamily: MONO,
                            fontSize: 9.5,
                            letterSpacing: 0,
                          }}
                        >
                          {category.category}
                        </span>
                      </div>
                      <span
                        style={{
                          color: 'var(--tag-gray-text)',
                          background: 'var(--tag-gray-bg)',
                          padding: '0 8px',
                          borderRadius: 24,
                          fontSize: 12,
                          fontVariantNumeric: 'tabular-nums',
                        }}
                      >
                        {category.items.length}
                      </span>
                    </button>
                    {!isCollapsed && (
                      <div className="mt-0.5 mb-1.5">
                        {category.items.map((item) => {
                          const Icon = item.icon;
                          return (
                            <div
                              key={item.type}
                              draggable
                              onDragStart={(e) => onDragStart(e, item)}
                              tabIndex={0}
                              className="group flex items-center gap-2.5 pl-2.5 pr-2 py-1.5 cursor-grab active:cursor-grabbing outline-none"
                              style={{
                                borderRadius: 2,
                                background: 'transparent',
                                border: '1px solid transparent',
                                transition:
                                  'background 140ms ease, border-color 140ms ease',
                              }}
                              onMouseEnter={(e) => {
                                e.currentTarget.style.background = `color-mix(in srgb, ${item.color} 10%, transparent)`;
                                e.currentTarget.style.borderColor = `color-mix(in srgb, ${item.color} 38%, transparent)`;
                              }}
                              onMouseLeave={(e) => {
                                e.currentTarget.style.background = 'transparent';
                                e.currentTarget.style.borderColor = 'transparent';
                              }}
                              onFocus={(e) => {
                                e.currentTarget.style.background = `color-mix(in srgb, ${item.color} 12%, transparent)`;
                                e.currentTarget.style.borderColor = `color-mix(in srgb, ${item.color} 50%, transparent)`;
                              }}
                              onBlur={(e) => {
                                e.currentTarget.style.background = 'transparent';
                                e.currentTarget.style.borderColor = 'transparent';
                              }}
                            >
                              <div
                                className="flex items-center justify-center flex-shrink-0"
                                style={{
                                  width: 22,
                                  height: 22,
                                  borderRadius: 2,
                                  background: `color-mix(in srgb, ${item.color} 14%, transparent)`,
                                  border: `1px solid color-mix(in srgb, ${item.color} 36%, transparent)`,
                                }}
                              >
                                <Icon style={{ color: item.color, width: 12, height: 12 }} strokeWidth={1.75} />
                              </div>
                              <span
                                className="truncate flex-1"
                                style={{
                                  color: 'var(--t-text)',
                                  fontFamily: MONO,
                                  fontSize: 11,
                                  letterSpacing: 0,
                                }}
                              >
                                {item.label}
                              </span>
                              <span
                                className="opacity-0 group-hover:opacity-100 transition-opacity"
                                style={{
                                  color: item.color,
                                  fontFamily: MONO,
                                  fontSize: 9,
                                  letterSpacing: 0,
                                }}
                              >
                                drag
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Footer hint */}
            <div
              className="px-3 py-2"
              style={{
                borderTop: '1px solid var(--t-border)',
                color: 'var(--t-text-muted)',
                fontFamily: MONO,
                fontSize: 9.5,
                letterSpacing: 0,
              }}
            >
              Drag a node onto the canvas
            </div>
          </div>
        )}

        {/* ===== CENTER: Canvas ===== */}
        <div
          className="flex-1 relative"
          ref={wrapperRef}
          onDrop={onDrop}
          onDragOver={onDragOver}
          style={{ background: 'var(--t-bg)' }}
        >
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeClick={onNodeClick}
            onEdgeDoubleClick={onEdgeDoubleClick}
            onPaneClick={onPaneClick}
            nodeTypes={importedNodeTypes}
            defaultEdgeOptions={DEFAULT_EDGE_STYLE}
            connectionLineType={ConnectionLineType.Bezier}
            connectionLineStyle={{ stroke: 'var(--t-accent)', strokeWidth: 2 }}
            fitView
            fitViewOptions={{ padding: 0.2, minZoom: 0.4, maxZoom: 1 }}
            snapToGrid
            snapGrid={[20, 20]}
            nodesDraggable={!readOnly}
            nodesConnectable={!readOnly}
            edgesUpdatable={!readOnly}
            elementsSelectable={true}
            deleteKeyCode={null}
            proOptions={{ hideAttribution: true }}
          >
            <Background
              variant={BackgroundVariant.Dots}
              gap={20}
              size={1.4}
              color="var(--flow-canvas-dots)"
            />
            <Panel position="bottom-left">
              <ZoomBar />
            </Panel>
            <MiniMap
              maskColor="color-mix(in srgb, var(--t-bg) 70%, transparent)"
              pannable
              zoomable
              style={{
                width: 168,
                height: 104,
                background: 'var(--t-panel)',
                border: '1px solid var(--t-border)',
                borderRadius: 0,
                marginBottom: 76,
              }}
              nodeColor={(n) => {
                const type = n.data?.type as string;
                const found = mergedPalette.flatMap((c) => c.items).find((i: any) => i.nodeType === type);
                return found?.color || 'var(--t-text-muted)';
              }}
              nodeStrokeWidth={2}
              nodeBorderRadius={2}
            />

            {nodes.length === 0 && !readOnly && (
              <Panel position="top-center">
                <div
                  className="px-8 py-5 mt-24 flex flex-col items-center gap-2 relative"
                  style={{
                    background: 'var(--t-panel)',
                    border: '1px dashed var(--t-border)',
                    borderRadius: 2,
                  }}
                >
                  <div
                    className="w-10 h-10 flex items-center justify-center"
                    style={{
                      borderRadius: 2,
                      background: 'color-mix(in srgb, var(--t-accent) 14%, transparent)',
                      border: '1px solid color-mix(in srgb, var(--t-accent) 36%, transparent)',
                    }}
                  >
                    <Plus className="w-5 h-5" style={{ color: 'var(--t-accent)' }} strokeWidth={2} />
                  </div>
                  <p
                    style={{
                      color: 'var(--t-text)',
                      fontFamily: MONO,
                      fontSize: 12,
                      letterSpacing: 0,
                    }}
                  >
                    drag nodes from the left to start building
                  </p>
                  <p className="text-xs" style={{ color: 'var(--flow-node-text-muted, #6B7280)' }}>
                    Connect output → input · Double-click an edge to change condition
                  </p>
                </div>
              </Panel>
            )}
          </ReactFlow>
        </div>

        {/* ===== RIGHT: Properties / Edge Editor ===== */}
        {(selectedNode || editingEdge) && (
          <div
            className="flex-shrink-0 flex flex-col"
            style={{
              width: 372,
              background: 'var(--t-panel)',
              borderLeft: '1px solid var(--t-border)',
            }}
          >
            {/* Header: icon tile, type label, step name, close; then tabs */}
            <div style={{ borderBottom: '1px solid var(--t-border)' }}>
              <div className="flex items-center gap-3 px-4 pt-4 pb-3">
                <div
                  className="flex items-center justify-center flex-shrink-0"
                  style={{
                    width: 40,
                    height: 40,
                    background: selectedPaletteMeta
                      ? `color-mix(in srgb, ${selectedPaletteMeta.color} 16%, transparent)`
                      : 'var(--t-input)',
                    color: selectedPaletteMeta ? selectedPaletteMeta.color : 'var(--t-text-secondary)',
                  }}
                >
                  {selectedNode && selectedPaletteMeta ? (
                    <selectedPaletteMeta.icon style={{ width: 20, height: 20 }} strokeWidth={1.7} />
                  ) : (
                    <Settings className="w-5 h-5" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div
                    style={{ fontSize: 11, lineHeight: '15px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.02em', color: 'var(--t-text-secondary)' }}
                  >
                    {editingEdge ? 'Connection' : selectedPaletteMeta?.label || selectedNode?.data?.type || 'Step'}
                  </div>
                  <div
                    className="truncate"
                    style={{ fontSize: 18, lineHeight: '24px', fontWeight: 600, color: 'var(--t-text)' }}
                    title={selectedNode?.id}
                  >
                    {editingEdge
                      ? 'Edge'
                      : selectedNode?.data?.config?.name || selectedNode?.data?.label || 'Node'}
                  </div>
                </div>
                <button
                  onClick={() => {
                    setSelectedNodeId(null);
                    setEditingEdgeId(null);
                  }}
                  className="flex-shrink-0 flex items-center justify-center hover:bg-[var(--t-panel-hover)]"
                  style={{ width: 32, height: 32, color: 'var(--t-text)' }}
                  title="Close"
                  aria-label="Close"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Carbon tabs: text with a 2px underline on the open one */}
              {selectedNode && !editingEdge && PropertiesComponent && (
                <div className="flex px-4" role="tablist">
                  {(['config', 'retry', 'errors'] as const).map((t) => {
                    const on = propsTab === t;
                    return (
                      <button
                        key={t}
                        role="tab"
                        aria-selected={on}
                        onClick={() => setPropsTab(t)}
                        className="hover:text-[var(--t-text)]"
                        style={{
                          height: 40,
                          padding: '0 16px 0 0',
                          marginRight: 16,
                          fontSize: 14,
                          fontWeight: on ? 600 : 400,
                          color: on ? 'var(--t-text)' : 'var(--t-text-secondary)',
                          background: 'transparent',
                          border: 'none',
                          boxShadow: on ? 'inset 0 -2px 0 var(--t-accent)' : 'none',
                        }}
                      >
                        {t === 'errors' ? 'On error' : t === 'retry' ? 'Retry' : 'Settings'}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="flex-1 overflow-y-auto">
              {editingEdge && (
                <div className="p-4 space-y-4">
                  <div>
                    <label
                      className="text-[11px] font-semibold  block mb-2.5"
                      style={{ color: 'var(--t-text-secondary)', letterSpacing: 0 }}
                    >
                      Edge condition
                    </label>
                    <div className="space-y-1.5">
                      {['ON_SUCCESS', 'ON_FAILURE', 'ON_ALWAYS'].map((cond) => {
                        const active = editingEdge.data?.condition === cond;
                        const c = CONDITION_COLORS[cond];
                        return (
                          <button
                            key={cond}
                            onClick={() => updateEdgeCondition(editingEdge.id, cond)}
                            className="w-full px-3 py-2 rounded-lg flex items-center gap-2.5 text-[12px] font-medium transition-all"
                            style={{
                              background: active ? c + '18' : 'var(--t-input)',
                              border: `1px solid ${active ? c : 'var(--t-border)'}`,
                              color: active ? c : 'var(--t-text-secondary)',
                              boxShadow: active ? `0 0 0 3px ${c}15` : 'none',
                            }}
                            disabled={readOnly}
                          >
                            <span
                              className="w-2 h-2 rounded-full flex-shrink-0"
                              style={{
                                background: c,
                                boxShadow: active ? `0 0 0 3px ${c}40` : 'none',
                              }}
                            />
                            <span className="flex-1 text-left">
                              {cond === 'ON_SUCCESS'
                                ? 'On success'
                                : cond === 'ON_FAILURE'
                                ? 'On failure'
                                : 'Always'}
                            </span>
                            {active && (
                              <span
                                className="text-[9px]  font-bold "
                                style={{ color: c }}
                              >
                                active
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  {!readOnly && (
                    <button
                      onClick={() => deleteEdge(editingEdge.id)}
                      className="w-full text-[12px] font-medium py-2 rounded-lg transition-colors"
                      style={{
                        background: '#EF444412',
                        color: '#EF4444',
                        border: '1px solid #EF444430',
                      }}
                    >
                      Delete edge
                    </button>
                  )}
                </div>
              )}

              {selectedNode && !editingEdge && PropertiesComponent && (
                <div
                  className="p-4 properties-tabbed"
                  data-active-tab={propsTab}
                >
                  <style jsx>{`
                    .properties-tabbed[data-active-tab='config']
                      :global([data-section='retry']),
                    .properties-tabbed[data-active-tab='config']
                      :global([data-section='errors']) {
                      display: none;
                    }
                    .properties-tabbed[data-active-tab='retry']
                      :global([data-section='config']),
                    .properties-tabbed[data-active-tab='retry']
                      :global([data-section='errors']) {
                      display: none;
                    }
                    .properties-tabbed[data-active-tab='errors']
                      :global([data-section='config']),
                    .properties-tabbed[data-active-tab='errors']
                      :global([data-section='retry']) {
                      display: none;
                    }
                    .properties-tabbed :global([data-section]:last-of-type) {
                      border-bottom: none !important;
                      padding-bottom: 0 !important;
                      margin-bottom: 0 !important;
                    }
                  `}</style>
                  <PropertiesComponent
                    config={selectedNode.data?.config || {}}
                    onChange={updateSelectedNodeConfig}
                  />
                </div>
              )}

              {selectedNode && !editingEdge && !PropertiesComponent && (
                <div className="p-4">
                  <div
                    className="rounded-lg p-3 text-[12px]"
                    style={{
                      background: 'var(--t-input)',
                      border: '1px dashed var(--t-border)',
                      color: 'var(--t-text-muted)',
                    }}
                  >
                    <p className="mb-1">
                      Type: <code style={{ color: 'var(--t-text)' }}>{selectedNode.data?.type}</code>
                    </p>
                    <p>No properties editor available for this node type yet.</p>
                  </div>
                </div>
              )}
            </div>

            {/* Footer with delete action */}
            {selectedNode && !editingEdge && !readOnly && (
              <div
                className="px-2 py-2 flex items-center"
                style={{ borderTop: '1px solid var(--t-border)' }}
              >
                <button
                  onClick={deleteSelectedNode}
                  className="flex items-center gap-2 hover:bg-[var(--tag-red-bg)]"
                  style={{ height: 32, padding: '0 12px', fontSize: 14, color: 'var(--t-error)', background: 'transparent', border: 'none' }}
                  title="Delete step (Del)"
                >
                  <Trash2 className="w-4 h-4" />
                  Delete step
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * FlowCanvas — Visual DAG editor for RunLoop.
 *
 * Features:
 * - Drag nodes from left palette onto canvas
 * - Connect nodes by dragging from output handle to input handle
 * - Double-click edge to set condition (ON_SUCCESS / ON_FAILURE / ON_ALWAYS)
 * - Right panel shows per-node properties (retry policy, config, etc.)
 * - Auto-layout, MiniMap, snap-to-grid
 * - Keyboard shortcuts: Cmd/Ctrl+S save, Del/Backspace delete selected, Esc deselect
 */
// Zoom bar: − 70% + and fit; the readout tells the user where they are.
function ZoomBar() {
  const rf = useReactFlow();
  const { zoom } = useViewport();
  const btn: React.CSSProperties = {
    width: 32, height: 32, display: 'grid', placeItems: 'center',
    background: 'transparent', color: 'var(--t-text)', border: 'none', cursor: 'pointer',
  };
  return (
    <div
      className="flex items-center"
      style={{ background: 'var(--t-panel)', boxShadow: 'inset 0 0 0 1px var(--t-border)' }}
    >
      <button style={btn} className="hover:bg-[var(--t-panel-hover)]" onClick={() => rf.zoomOut()} title="Zoom out" aria-label="Zoom out">
        <Minus className="w-4 h-4" />
      </button>
      <span style={{ minWidth: 48, textAlign: 'center', fontSize: 12, fontVariantNumeric: 'tabular-nums', color: 'var(--t-text)' }}>
        {Math.round(zoom * 100)}%
      </span>
      <button style={btn} className="hover:bg-[var(--t-panel-hover)]" onClick={() => rf.zoomIn()} title="Zoom in" aria-label="Zoom in">
        <Plus className="w-4 h-4" />
      </button>
      <span aria-hidden style={{ width: 1, height: 20, background: 'var(--t-border)' }} />
      <button style={btn} className="hover:bg-[var(--t-panel-hover)]" onClick={() => rf.fitView({ padding: 0.2 })} title="Fit to screen" aria-label="Fit to screen">
        <Maximize className="w-4 h-4" />
      </button>
    </div>
  );
}

export function FlowCanvas(props: FlowCanvasProps) {
  return (
    <ReactFlowProvider>
      <InnerFlow {...props} />
    </ReactFlowProvider>
  );
}
