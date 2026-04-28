import { SettingsTabs } from '@/components/SettingsTabs';

export default function PluginsLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SettingsTabs />
      {children}
    </>
  );
}
