import { SettingsTabs } from '@/components/SettingsTabs';

export default function IntegrationsLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SettingsTabs />
      {children}
    </>
  );
}
