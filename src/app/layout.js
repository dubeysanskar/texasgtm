import { AuthProvider } from '@/context/AuthContext';
import { ProjectProvider } from '@/context/ProjectContext';
import ImpersonationBanner from '@/components/ImpersonationBanner';
import './globals.css';

export const metadata = {
  title: 'GTM CRM',
  description: 'Modern team CRM with lead management, tasks, and messaging',
  icons: {
    icon: '/favicon.png',
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
        <link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200" rel="stylesheet" />
      </head>
      <body>
        <AuthProvider><ProjectProvider><ImpersonationBanner />{children}</ProjectProvider></AuthProvider>
      </body>
    </html>
  );
}
