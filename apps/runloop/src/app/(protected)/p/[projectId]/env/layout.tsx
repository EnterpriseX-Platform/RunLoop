import { SettingsTabs } from '@/components/SettingsTabs';

export default function EnvLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SettingsTabs />
      {children}
    </>
  );
}
