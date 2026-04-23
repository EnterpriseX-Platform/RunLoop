import { SettingsTabs } from '@/components/SettingsTabs';

export default function AuditLogLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SettingsTabs />
      {children}
    </>
  );
}
