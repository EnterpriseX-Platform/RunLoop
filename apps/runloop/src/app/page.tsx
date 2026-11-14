import { redirect } from 'next/navigation';

export default function HomePage() {
  redirect('/projects'); // redirect() adds the configured basePath itself
}
