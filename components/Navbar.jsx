import { usePrivy } from '@privy-io/react-auth';
import Link from 'next/link';

export default function Navbar() {
  const { login, authenticated, user } = usePrivy();

  return (
    <nav className="fixed top-0 w-full bg-black/30 backdrop-blur-md border-b border-emerald-500/10 z-50">
      <div className="container mx-auto px-4">
        <div className="flex justify-between items-center h-16">
          <Link href="/" className="flex items-center space-x-2">
            <div className="text-2xl font-bold">
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-cyan-400">
                Autonomous
              </span>
              <span className="text-gray-400 ml-2">Arcade</span>
            </div>
          </Link>

          <div className="flex items-center space-x-6">
            <Link href="/datastore" className="text-gray-400 hover:text-emerald-400 transition-colors">
              Data
            </Link>
            <Link href="/tournaments/create" className="text-gray-400 hover:text-emerald-400 transition-colors">
              Create
            </Link>
            
            {authenticated ? (
              <Link href="/tournaments">
                <div className="relative group">
                  <div className="absolute -inset-0.5 bg-gradient-to-r from-emerald-500 to-cyan-500 rounded-lg blur opacity-30 group-hover:opacity-100 transition duration-1000 group-hover:duration-200"></div>
                  <button className="relative px-6 py-2 bg-black rounded-lg border border-emerald-500/20 text-emerald-400 hover:text-white transition-colors">
                    Dashboard
                  </button>
                </div>
              </Link>
            ) : (
              <div className="relative group">
                <div className="absolute -inset-0.5 bg-gradient-to-r from-emerald-500 to-cyan-500 rounded-lg blur opacity-30 group-hover:opacity-100 transition duration-1000 group-hover:duration-200"></div>
                <button
                  onClick={login}
                  className="relative px-6 py-2 bg-black rounded-lg border border-emerald-500/20 text-emerald-400 hover:text-white transition-colors"
                >
                  Connect
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
} 