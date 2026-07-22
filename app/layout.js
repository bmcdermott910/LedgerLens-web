import './globals.css';

export const metadata = {
  title: 'LedgerLens — Board & Budget Dashboard',
  description: 'Wendal Inc. budget vs. actuals dashboard',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
