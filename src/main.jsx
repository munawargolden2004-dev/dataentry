import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import './index.css'
import App from './App.jsx'
import { AuthProvider } from './context/AuthContext.jsx';
import ContentProtection from './Components/ContentProtection.jsx';

// Create a client
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // Data stays "fresh" for 5 minutes
      cacheTime: 1000 * 60 * 30, // Data stays in memory for 30 minutes
      refetchOnWindowFocus: false, // Don't refetch every time user switches tabs
      retry: 1,
    },
  },
});

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter>
          <ContentProtection />
          <App />
        </BrowserRouter>
      </AuthProvider>
      <ReactQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>
  </StrictMode>,
)
