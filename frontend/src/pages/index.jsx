import { useEffect } from 'react';
import { useRouter } from 'next/router';
import { useAuthStore } from '../hooks/useAuth';

export default function IndexPage() {
  const router = useRouter();
  const { user } = useAuthStore();
  useEffect(() => {
    router.replace(user ? '/dashboard' : '/login');
  }, [user]);
  return null;
}
