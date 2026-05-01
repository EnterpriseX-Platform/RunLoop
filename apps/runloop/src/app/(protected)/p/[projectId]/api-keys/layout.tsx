import { SettingsTabs } from '@/components/SettingsTabs';

export default function ApiKeysLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SettingsTabs />
      {children}
    </>
  );
}
