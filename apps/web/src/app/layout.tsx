import './globals.css';
import React from 'react';

export const metadata = {
  title: 'Indian Job Portal',
  description: 'Connecting Employers, Intermediaries, and Job Seekers across India',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="antialiased bg-gray-50 text-gray-900">{children}</body>
    </html>
  );
}
