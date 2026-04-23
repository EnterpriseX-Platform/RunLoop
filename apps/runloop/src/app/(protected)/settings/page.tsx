'use client';

import { useState, useCallback } from 'react';
import {
  Settings,
  Server,
  Cpu,
  Bell,
  AlertTriangle,
  Save,
  Clock,
  RotateCcw,
  Trash2,
  Globe,
  Hash,
  Timer,
  RefreshCw,
  Mail,
  MessageSquare,
  Link,
  Loader2,
  Check,
  X,
  Info,
} from 'lucide-react';
import {
  ControlBreadcrumb, PageHeader, SharpButton, MONO,
} from '@/components/ControlChrome';

const FONT = "'IBM Plex Sans Thai', 'IBM Plex Sans', sans-serif";
const THEME = {
  bg: 'var(--t-bg)', panel: 'var(--t-panel)', panelHover: 'var(--t-panel-hover)',
  border: 'var(--t-border)', borderLight: 'var(--t-border-light)',
  text: { primary: 'var(--t-text)', secondary: 'var(--t-text-secondary)', muted: 'var(--t-text-muted)' },
  accent: 'var(--t-accent)', accentLight: 'var(--t-accent-light)', input: 'var(--t-input)',
  colors: { blue: '#3B82F6', emerald: '#10B981', purple: '#8B5CF6', amber: '#F59E0B', red: '#EF4444' }
};

interface ToastState {
  visible: boolean;
  message: string;
  type: 'success' | 'error';
}

interface ConfirmDialogState {
  visible: boolean;
  title: string;
  message: string;
  onConfirm: () => void;
}

function Toast({ toast, onClose }: { toast: ToastState; onClose: () => void }) {
  if (!toast.visible) return null;
  const bgColor = toast.type === 'success' ? THEME.colors.emerald : THEME.colors.red;
  return (
    <div
      style={{
        position: 'fixed', bottom: 24, right: 24, zIndex: 9999,
        background: bgColor, color: '#fff',
        padding: '12px 20px', borderRadius: 2,
        display: 'flex', alignItems: 'center', gap: 10,
        boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
        fontFamily: FONT, fontSize: 14, fontWeight: 500,
        animation: 'slideInUp 0.3s ease-out',
      }}
    >
      {toast.type === 'success' ? <Check size={16} /> : <AlertTriangle size={16} />}
      {toast.message}
      <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', marginLeft: 8, padding: 0, display: 'flex' }}>
        <X size={14} />
      </button>
    </div>
  );
}

function ConfirmDialog({ dialog, onClose }: { dialog: ConfirmDialogState; onClose: () => void }) {
  if (!dialog.visible) return null;
  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 9998,
        background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: FONT,
      }}
      onClick={onClose}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: THEME.panel, border: `1px solid ${THEME.border}`,
          borderRadius: 16, padding: 28, width: 440, maxWidth: '90vw',
          boxShadow: '0 20px 60px rgba(0,0,0,0.4)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
          <div style={{ background: `${THEME.colors.red}20`, borderRadius: 2, padding: 10, display: 'flex' }}>
            <AlertTriangle size={20} color={THEME.colors.red} />
          </div>
          <h3 style={{ color: THEME.text.primary, fontSize: 18, fontWeight: 600, margin: 0 }}>
            {dialog.title}
          </h3>
        </div>
        <p style={{ color: THEME.text.secondary, fontSize: 14, lineHeight: 1.6, margin: '0 0 24px 0' }}>
          {dialog.message}
        </p>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <button
            onClick={onClose}
            style={{
              padding: '9px 18px', borderRadius: 8, fontSize: 14, fontWeight: 500,
              background: 'transparent', color: THEME.text.secondary,
              border: `1px solid ${THEME.border}`, cursor: 'pointer',
              fontFamily: FONT, transition: 'all 0.15s',
            }}
          >
            Cancel
          </button>
          <button
            onClick={() => { dialog.onConfirm(); onClose(); }}
            style={{
              padding: '9px 18px', borderRadius: 8, fontSize: 14, fontWeight: 500,
              background: THEME.colors.red, color: '#fff',
              border: 'none', cursor: 'pointer',
              fontFamily: FONT, transition: 'all 0.15s',
            }}
          >
            Confirm
          </button>
        </div>
      </div>
    </div>
  );
}

function SectionHeader({ icon: Icon, title, description, color }: {
  icon: React.ComponentType<any>;
  title: string;
  description: string;
  color: string;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 20 }}>
      <div style={{ background: `${color}18`, borderRadius: 2, padding: 10, display: 'flex' }}>
        <Icon size={20} color={color} />
      </div>
      <div>
        <h2 style={{ color: THEME.text.primary, fontSize: 16, fontWeight: 600, margin: 0 }}>{title}</h2>
        <p style={{ color: THEME.text.muted, fontSize: 13, margin: '2px 0 0 0' }}>{description}</p>
      </div>
    </div>
  );
}

function SettingRow({ icon: Icon, label, description, children }: {
  icon: React.ComponentType<any>;
  label: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '14px 0',
      borderBottom: `1px solid ${THEME.borderLight}`,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1 }}>
        <Icon size={16} color={THEME.text.muted} />
        <div>
          <div style={{ color: THEME.text.primary, fontSize: 14, fontWeight: 500 }}>{label}</div>
          {description && (
            <div style={{ color: THEME.text.muted, fontSize: 12, marginTop: 2 }}>{description}</div>
          )}
        </div>
      </div>
      <div style={{ flexShrink: 0 }}>{children}</div>
    </div>
  );
}

function ReadOnlyValue({ value }: { value: string }) {
  return (
    <div style={{
      background: THEME.input, border: `1px solid ${THEME.borderLight}`,
      borderRadius: 8, padding: '7px 14px',
      color: THEME.text.secondary, fontSize: 13, fontFamily: "'IBM Plex Mono', monospace",
      minWidth: 200, textAlign: 'right',
    }}>
      {value}
    </div>
  );
}

function NumberInput({ value, onChange, min, max, suffix }: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  suffix?: string;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <input
        type="number"
        value={value}
        onChange={e => {
          let v = parseInt(e.target.value, 10);
          if (isNaN(v)) v = min ?? 0;
          if (min !== undefined && v < min) v = min;
          if (max !== undefined && v > max) v = max;
          onChange(v);
        }}
        min={min}
        max={max}
        style={{
          background: THEME.input, border: `1px solid ${THEME.borderLight}`,
          borderRadius: 8, padding: '7px 14px', width: 100, textAlign: 'right',
          color: THEME.text.primary, fontSize: 13, fontFamily: "'IBM Plex Mono', monospace",
          outline: 'none',
        }}
        onFocus={e => { e.target.style.borderColor = THEME.accent; }}
        onBlur={e => { e.target.style.borderColor = THEME.borderLight; }}
      />
      {suffix && <span style={{ color: THEME.text.muted, fontSize: 12 }}>{suffix}</span>}
    </div>
  );
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!checked)}
      style={{
        width: 44, height: 24, borderRadius: 2, border: 'none', cursor: 'pointer',
        background: checked ? THEME.accent : THEME.borderLight,
        position: 'relative', transition: 'background 0.2s', padding: 0,
      }}
    >
      <div style={{
        width: 18, height: 18, borderRadius: '50%', background: '#fff',
        position: 'absolute', top: 3,
        left: checked ? 23 : 3,
        transition: 'left 0.2s',
        boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
      }} />
    </button>
  );
}

function TextInput({ value, onChange, placeholder }: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <input
      type="text"
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      style={{
        background: THEME.input, border: `1px solid ${THEME.borderLight}`,
        borderRadius: 8, padding: '7px 14px', width: 280,
        color: THEME.text.primary, fontSize: 13,
        fontFamily: "'IBM Plex Mono', monospace",
        outline: 'none',
      }}
      onFocus={e => { e.target.style.borderColor = THEME.accent; }}
      onBlur={e => { e.target.style.borderColor = THEME.borderLight; }}
    />
  );
}

function DangerButton({ icon: Icon, label, onClick }: {
  icon: React.ComponentType<any>;
  label: string;
  onClick: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '10px 18px', borderRadius: 8, fontSize: 13, fontWeight: 500,
        background: hovered ? `${THEME.colors.red}18` : 'transparent',
        color: THEME.colors.red,
        border: `1px solid ${hovered ? THEME.colors.red : THEME.border}`,
        cursor: 'pointer', fontFamily: FONT, transition: 'all 0.15s',
      }}
    >
      <Icon size={15} />
      {label}
    </button>
  );
}

export default function SettingsPage() {
  // Engine configuration state
  const [defaultTimeout, setDefaultTimeout] = useState(30);
  const [defaultRetryCount, setDefaultRetryCount] = useState(3);
  const [defaultRetryDelay, setDefaultRetryDelay] = useState(5);

  // Notification settings state
  const [emailNotifications, setEmailNotifications] = useState(true);
  const [slackNotifications, setSlackNotifications] = useState(false);
  const [webhookUrl, setWebhookUrl] = useState('');

  // UI state
  const [toast, setToast] = useState<ToastState>({ visible: false, message: '', type: 'success' });
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogState>({
    visible: false, title: '', message: '', onConfirm: () => {},
  });
  const [saving, setSaving] = useState(false);

  const showToast = useCallback((message: string, type: 'success' | 'error' = 'success') => {
    setToast({ visible: true, message, type });
    setTimeout(() => setToast(prev => ({ ...prev, visible: false })), 3000);
  }, []);

  const handleSave = useCallback(async () => {
    setSaving(true);
    // Simulate save delay
    await new Promise(r => setTimeout(r, 600));
    setSaving(false);
    showToast('Settings saved');
  }, [showToast]);

  const handleClearExecutions = useCallback(() => {
    setConfirmDialog({
      visible: true,
      title: 'Clear All Executions',
      message: 'This will permanently delete all execution history and logs across all projects. This action cannot be undone. Are you sure you want to continue?',
      onConfirm: () => showToast('All executions cleared'),
    });
  }, [showToast]);

  const handleResetSchedulers = useCallback(() => {
    setConfirmDialog({
      visible: true,
      title: 'Reset All Schedulers',
      message: 'This will stop and reset all active schedulers to their default state. Running jobs will be cancelled. This action cannot be undone. Are you sure you want to continue?',
      onConfirm: () => showToast('All schedulers have been reset'),
    });
  }, [showToast]);

  const engineUrl = process.env.NEXT_PUBLIC_ENGINE_URL || 'http://localhost:8092';
  const basePath = '/runloop';
  const appVersion = '0.1.0';

  return (
    <div className="space-y-4" style={{ fontFamily: FONT, maxWidth: 820 }}>
      <ControlBreadcrumb path="SETTINGS" node="NODE.CONFIG" />
      <PageHeader
        title="Settings"
        subtitle="Manage your RunLoop platform configuration"
        right={
          <SharpButton onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            {saving ? '$ SAVING…' : '$ SAVE CHANGES →'}
          </SharpButton>
        }
      />

      {/* General Settings */}
      <div className="" style={{ background: THEME.panel, border: `1px solid ${THEME.border}`, padding: 24 }}>
        <SectionHeader
          icon={Settings}
          title="General Settings"
          description="Platform environment and version information"
          color={THEME.colors.blue}
        />
        <div>
          <SettingRow icon={Globe} label="Engine URL" description="Backend engine endpoint address">
            <ReadOnlyValue value={engineUrl} />
          </SettingRow>
          <SettingRow icon={Hash} label="Base Path" description="Application route prefix">
            <ReadOnlyValue value={basePath} />
          </SettingRow>
          <SettingRow icon={Info} label="Application Version" description="Current running version">
            <ReadOnlyValue value={`v${appVersion}`} />
          </SettingRow>
        </div>
      </div>

      {/* Engine Configuration */}
      <div className="" style={{ background: THEME.panel, border: `1px solid ${THEME.border}`, padding: 24 }}>
        <SectionHeader
          icon={Cpu}
          title="Engine Configuration"
          description="Worker pool and execution defaults"
          color={THEME.colors.purple}
        />
        <div>
          <SettingRow icon={Server} label="Worker Pool Size" description="Number of concurrent worker goroutines">
            <ReadOnlyValue value="10" />
          </SettingRow>
          <SettingRow icon={Timer} label="Default Timeout" description="Maximum execution time before timeout">
            <NumberInput value={defaultTimeout} onChange={setDefaultTimeout} min={1} max={3600} suffix="seconds" />
          </SettingRow>
          <SettingRow icon={RefreshCw} label="Default Retry Count" description="Number of retry attempts on failure">
            <NumberInput value={defaultRetryCount} onChange={setDefaultRetryCount} min={0} max={10} />
          </SettingRow>
          <SettingRow icon={Clock} label="Default Retry Delay" description="Wait time between retry attempts">
            <NumberInput value={defaultRetryDelay} onChange={setDefaultRetryDelay} min={1} max={300} suffix="seconds" />
          </SettingRow>
        </div>
      </div>

      {/* Notification Settings */}
      <div className="" style={{ background: THEME.panel, border: `1px solid ${THEME.border}`, padding: 24 }}>
        <SectionHeader
          icon={Bell}
          title="Notification Settings"
          description="Configure how you receive alerts and updates"
          color={THEME.colors.amber}
        />
        <div>
          <SettingRow icon={Mail} label="Email Notifications" description="Receive execution alerts via email">
            <Toggle checked={emailNotifications} onChange={setEmailNotifications} />
          </SettingRow>
          <SettingRow icon={MessageSquare} label="Slack Notifications" description="Send alerts to a Slack channel">
            <Toggle checked={slackNotifications} onChange={setSlackNotifications} />
          </SettingRow>
          <SettingRow icon={Link} label="Webhook URL" description="POST execution events to a custom endpoint">
            <TextInput value={webhookUrl} onChange={setWebhookUrl} placeholder="https://example.com/webhook" />
          </SettingRow>
        </div>
      </div>

      {/* Danger Zone */}
      <div className="" style={{
        background: THEME.panel,
        border: `1px solid ${THEME.colors.red}30`,
        padding: 24,
      }}>
        <SectionHeader
          icon={AlertTriangle}
          title="Danger Zone"
          description="Destructive actions that cannot be undone"
          color={THEME.colors.red}
        />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 4 }}>
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: 16, borderRadius: 2,
            border: `1px solid ${THEME.borderLight}`,
          }}>
            <div>
              <div style={{ color: THEME.text.primary, fontSize: 14, fontWeight: 500 }}>
                Clear All Executions
              </div>
              <div style={{ color: THEME.text.muted, fontSize: 12, marginTop: 2 }}>
                Permanently remove all execution history and logs
              </div>
            </div>
            <DangerButton icon={Trash2} label="Clear Executions" onClick={handleClearExecutions} />
          </div>
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: 16, borderRadius: 2,
            border: `1px solid ${THEME.borderLight}`,
          }}>
            <div>
              <div style={{ color: THEME.text.primary, fontSize: 14, fontWeight: 500 }}>
                Reset All Schedulers
              </div>
              <div style={{ color: THEME.text.muted, fontSize: 12, marginTop: 2 }}>
                Stop and reset all active schedulers to default state
              </div>
            </div>
            <DangerButton icon={RotateCcw} label="Reset Schedulers" onClick={handleResetSchedulers} />
          </div>
        </div>
      </div>

      {/* Toast */}
      <Toast toast={toast} onClose={() => setToast(prev => ({ ...prev, visible: false }))} />

      {/* Confirm Dialog */}
      <ConfirmDialog
        dialog={confirmDialog}
        onClose={() => setConfirmDialog(prev => ({ ...prev, visible: false }))}
      />

      <style>{`
        @keyframes slideInUp {
          from { opacity: 0; transform: translateY(12px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
