// src/pages/_app.jsx
import '../styles/globals.css';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'react-hot-toast';
import Layout from '../components/Layout';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, retry: 1 },
  },
});

const NO_LAYOUT = ['/login'];

export default function App({ Component, pageProps, router }) {
  const noLayout = NO_LAYOUT.includes(router.pathname);

  return (
    <QueryClientProvider client={queryClient}>
      {noLayout
        ? <Component {...pageProps} />
        : (
          <Layout>
            <Component {...pageProps} />
          </Layout>
        )
      }
      <Toaster
        position="top-right"
        toastOptions={{
          duration: 4000,
          style: {
            fontFamily: 'Inter, system-ui, sans-serif',
            fontSize: '13px',
            borderRadius: '10px',
            boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
          },
        }}
      />
    </QueryClientProvider>
  );
}
