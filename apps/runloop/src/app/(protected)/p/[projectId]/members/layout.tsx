import { SettingsTabs } from '@/components/SettingsTabs';

export default function MembersLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SettingsTabs />
      {children}
    </>
  );
}
