import { SettingsTabs } from '@/components/SettingsTabs';

export default function SecretsLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SettingsTabs />
      {children}
    </>
  );
}
